use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

const TURSO_URL: &str = env!("TURSO_URL");
const TURSO_AUTH_TOKEN: &str = env!("TURSO_AUTH_TOKEN");

const LEGACY_SIDECARS: [&str; 5] = ["", "-wal", "-shm", "-info", "-client_wal_index"];
const LEGACY_DIRS: [&str; 3] = ["mirror", "offline", "offline-archive"];
const STORES: [&str; 2] = ["outbox", "cache"];
const CHUNK_ROWS: usize = 200;
const CHUNK_BYTES: usize = 512 * 1024;

const TABLE_ORDER: [&str; 16] = [
    "kategori",
    "pelanggan",
    "produk",
    "settings",
    "alamat_pelanggan",
    "harga_pelanggan",
    "penjualan",
    "item_penjualan",
    "pembayaran_penjualan",
    "retur_penjualan",
    "item_retur_penjualan",
    "pembelian",
    "item_pembelian",
    "pembayaran_pembelian",
    "retur_pembelian",
    "item_retur_pembelian",
];

#[derive(Serialize)]
pub struct TursoConfig {
    pub url: String,
    pub token: String,
}

pub fn configured() -> bool {
    !TURSO_URL.is_empty() && !TURSO_AUTH_TOKEN.is_empty()
}

fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn retire_legacy_files(app_dir: &Path) -> Result<(), String> {
    let misplaced = format!("{}polaris.db", app_dir.display());
    let local = app_dir.join("polaris.db");
    let mut items: Vec<PathBuf> = Vec::new();
    for suffix in LEGACY_SIDECARS {
        items.push(PathBuf::from(format!("{}{}", misplaced, suffix)));
        items.push(PathBuf::from(format!("{}{}", local.display(), suffix)));
    }
    items.push(app_dir.join("polaris_restore.db"));
    items.extend(LEGACY_DIRS.iter().map(|dir| app_dir.join(dir)));
    let items: Vec<PathBuf> = items.into_iter().filter(|p| p.exists()).collect();
    if items.is_empty() {
        return Ok(());
    }
    let target = app_dir.join("legacy").join(stamp());
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    for item in items {
        if let Some(name) = item.file_name() {
            std::fs::rename(&item, target.join(name))
                .map_err(|e| format!("Gagal memindahkan {}: {}", item.display(), e))?;
        }
    }
    Ok(())
}

async fn reachable() -> bool {
    if TURSO_URL.is_empty() {
        return false;
    }
    let url = format!("{}/health", TURSO_URL.replacen("libsql://", "https://", 1));
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(client) => client,
        Err(_) => return false,
    };
    client.get(url).send().await.is_ok()
}

async fn connect_remote() -> Result<libsql::Connection, String> {
    if !configured() {
        return Err("Koneksi server belum diatur".to_string());
    }
    let db = libsql::Builder::new_remote(TURSO_URL.to_string(), TURSO_AUTH_TOKEN.to_string())
        .build()
        .await
        .map_err(|e| e.to_string())?;
    db.connect().map_err(|e| e.to_string())
}

fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn literal(value: libsql::Value) -> String {
    match value {
        libsql::Value::Null => "NULL".to_string(),
        libsql::Value::Integer(i) => i.to_string(),
        libsql::Value::Real(f) if f.is_finite() => format!("{:?}", f),
        libsql::Value::Real(_) => "NULL".to_string(),
        libsql::Value::Text(s) => format!("'{}'", s.replace('\'', "''")),
        libsql::Value::Blob(b) => format!("X'{}'", b.iter().map(|x| format!("{:02x}", x)).collect::<String>()),
    }
}

async fn table_names(conn: &libsql::Connection) -> Result<Vec<String>, String> {
    let mut rows = conn
        .query("SELECT name FROM sqlite_master WHERE type = 'table'", ())
        .await
        .map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        if let Ok(libsql::Value::Text(name)) = row.get_value(0) {
            names.push(name);
        }
    }
    Ok(names)
}

async fn column_names(conn: &libsql::Connection, table: &str) -> Result<Vec<String>, String> {
    let rows = conn
        .query(&format!("SELECT * FROM {} LIMIT 0", quote(table)), ())
        .await
        .map_err(|e| e.to_string())?;
    Ok((0..rows.column_count()).filter_map(|i| rows.column_name(i).map(str::to_string)).collect())
}

async fn insert_statements(source: &libsql::Connection, table: &str, columns: &[String]) -> Result<Vec<String>, String> {
    let list = columns.iter().map(|c| quote(c)).collect::<Vec<_>>().join(", ");
    let prefix = format!("INSERT INTO {} ({}) VALUES ", quote(table), list);
    let mut rows = source
        .query(&format!("SELECT {} FROM {}", list, quote(table)), ())
        .await
        .map_err(|e| e.to_string())?;
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut count = 0;
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        let values = (0..columns.len() as i32)
            .map(|i| row.get_value(i).map(literal).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        if count > 0 {
            current.push_str(", ");
        }
        current.push('(');
        current.push_str(&values.join(", "));
        current.push(')');
        count += 1;
        if count >= CHUNK_ROWS || current.len() >= CHUNK_BYTES {
            statements.push(format!("{}{}", prefix, current));
            current.clear();
            count = 0;
        }
    }
    if count > 0 {
        statements.push(format!("{}{}", prefix, current));
    }
    Ok(statements)
}

pub async fn export_snapshot(app_dir: &Path) -> Result<Vec<u8>, String> {
    let remote = connect_remote().await?;
    let folder = app_dir.join("snapshot");
    std::fs::remove_dir_all(&folder).ok();
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let file = folder.join("polaris.db");
    let result = write_snapshot(&remote, &file).await;
    let bytes = result.and_then(|_| std::fs::read(&file).map_err(|e| format!("Gagal membaca backup: {}", e)));
    std::fs::remove_dir_all(&folder).ok();
    bytes
}

async fn write_snapshot(remote: &libsql::Connection, file: &Path) -> Result<(), String> {
    let mut schema = remote
        .query(
            "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
            (),
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut tables = Vec::new();
    let mut ddl = Vec::new();
    while let Some(row) = schema.next().await.map_err(|e| e.to_string())? {
        if let (Ok(libsql::Value::Text(kind)), Ok(libsql::Value::Text(name)), Ok(libsql::Value::Text(sql))) =
            (row.get_value(0), row.get_value(1), row.get_value(2))
        {
            if kind == "table" {
                tables.push(name);
            }
            ddl.push(sql);
        }
    }

    let local_db = libsql::Builder::new_local(file).build().await.map_err(|e| e.to_string())?;
    let local = local_db.connect().map_err(|e| e.to_string())?;
    let tx = local.transaction().await.map_err(|e| e.to_string())?;
    for sql in &ddl {
        tx.execute(sql, ()).await.map_err(|e| format!("Gagal membuat struktur backup: {}", e))?;
    }
    for table in &tables {
        let columns = column_names(remote, table).await?;
        if columns.is_empty() {
            continue;
        }
        for statement in insert_statements(remote, table, &columns).await? {
            tx.execute(&statement, ()).await.map_err(|e| format!("Gagal menulis backup: {}", e))?;
        }
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn restore_to_turso(app_dir: &Path, bytes: &[u8]) -> Result<(), String> {
    let folder = app_dir.join("restore");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let file = folder.join(format!("{}.db", stamp()));
    std::fs::write(&file, bytes).map_err(|e| format!("Gagal menyimpan file restore: {}", e))?;
    let result = push_backup(&file).await;
    std::fs::remove_dir_all(&folder).ok();
    result
}

async fn push_backup(file: &Path) -> Result<(), String> {
    let local_db = libsql::Builder::new_local(file).build().await.map_err(|e| e.to_string())?;
    let local = local_db.connect().map_err(|e| e.to_string())?;
    let remote = connect_remote().await?;

    let local_tables = table_names(&local).await?;
    let remote_tables = table_names(&remote).await?;
    let tables: Vec<&str> = TABLE_ORDER
        .iter()
        .copied()
        .filter(|t| remote_tables.iter().any(|r| r == t))
        .collect();

    let mut inserts = Vec::new();
    for table in &tables {
        if !local_tables.iter().any(|l| l == table) {
            continue;
        }
        let remote_columns = column_names(&remote, table).await?;
        let columns: Vec<String> = column_names(&local, table)
            .await?
            .into_iter()
            .filter(|c| remote_columns.contains(c))
            .collect();
        if !columns.is_empty() {
            inserts.extend(insert_statements(&local, table, &columns).await?);
        }
    }

    let tx = remote.transaction().await.map_err(|e| e.to_string())?;
    for table in tables.iter().rev() {
        tx.execute(&format!("DELETE FROM {}", quote(table)), ())
            .await
            .map_err(|e| format!("Gagal mengosongkan {}: {}", table, e))?;
    }
    for statement in &inserts {
        tx.execute(statement, ()).await.map_err(|e| format!("Gagal mengembalikan data: {}", e))?;
    }
    tx.commit().await.map_err(|e| format!("Gagal menyimpan restore: {}", e))?;
    Ok(())
}

fn store_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    if !STORES.contains(&name) {
        return Err(format!("Penyimpanan tidak dikenal: {}", name));
    }
    Ok(app_dir(app)?.join(format!("{}.json", name)))
}

#[tauri::command]
pub fn app_store_read(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let path = store_path(&app, &name)?;
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_store_write(app: tauri::AppHandle, name: String, content: String) -> Result<(), String> {
    let path = store_path(&app, &name)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_turso_config() -> Option<TursoConfig> {
    if !configured() {
        return None;
    }
    Some(TursoConfig {
        url: TURSO_URL.to_string(),
        token: TURSO_AUTH_TOKEN.to_string(),
    })
}

#[tauri::command]
pub async fn turso_reachable() -> bool {
    reachable().await
}

const UPDATER_TOKEN: &str = env!("UPDATER_TOKEN");

#[tauri::command]
pub fn get_updater_token() -> Option<String> {
    if UPDATER_TOKEN.is_empty() {
        return None;
    }
    Some(UPDATER_TOKEN.to_string())
}
