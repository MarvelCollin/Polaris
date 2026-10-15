use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tokio::sync::Mutex;

const TURSO_URL: &str = env!("TURSO_URL");
const TURSO_AUTH_TOKEN: &str = env!("TURSO_AUTH_TOKEN");

pub const REPLICA_SIDECARS: [&str; 4] = ["-wal", "-shm", "-info", "-client_wal_index"];
const MIRROR_INTERVAL: Duration = Duration::from_secs(300);
const ARCHIVES_KEPT: usize = 10;
const RESTORE_CHUNK_ROWS: usize = 200;
const RESTORE_CHUNK_BYTES: usize = 512 * 1024;

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

static MIRROR: Mutex<()> = Mutex::const_new(());

#[derive(Serialize)]
pub struct TursoConfig {
    pub url: String,
    pub token: String,
}

pub fn configured() -> bool {
    !TURSO_URL.is_empty() && !TURSO_AUTH_TOKEN.is_empty()
}

pub fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{}", path.display(), suffix))
}

fn database_files(db: &Path) -> Vec<PathBuf> {
    let mut files = vec![db.to_path_buf()];
    files.extend(REPLICA_SIDECARS.iter().map(|suffix| with_suffix(db, suffix)));
    files
}

fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn mirror_db(app_dir: &Path) -> PathBuf {
    app_dir.join("mirror").join("polaris.db")
}

fn offline_db(app_dir: &Path) -> PathBuf {
    app_dir.join("offline").join("polaris.db")
}

fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn move_files(files: &[PathBuf], target: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for file in files {
        if let (true, Some(name)) = (file.exists(), file.file_name()) {
            std::fs::rename(file, target.join(name))
                .map_err(|e| format!("Gagal memindahkan {}: {}", file.display(), e))?;
        }
    }
    Ok(())
}

fn remove_files(db: &Path) -> Result<(), String> {
    for file in database_files(db) {
        if file.exists() {
            std::fs::remove_file(&file).map_err(|e| format!("Gagal menghapus {}: {}", file.display(), e))?;
        }
    }
    Ok(())
}

pub fn adopt_misplaced_db(app_dir: &Path) -> Result<bool, String> {
    let misplaced = with_suffix(app_dir, "polaris.db");
    if !misplaced.exists() {
        return Ok(false);
    }
    let db = app_dir.join("polaris.db");
    let stale: Vec<PathBuf> = database_files(&db).into_iter().filter(|f| f.exists()).collect();
    if !stale.is_empty() {
        move_files(&stale, &app_dir.join("legacy").join(stamp()))?;
    }
    for (from, to) in database_files(&misplaced).into_iter().zip(database_files(&db)) {
        if from.exists() {
            std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(true)
}

pub fn retire_legacy_files(app_dir: &Path) -> Result<(), String> {
    let files: Vec<PathBuf> = database_files(&with_suffix(app_dir, "polaris.db"))
        .into_iter()
        .chain(database_files(&app_dir.join("polaris.db")))
        .chain([app_dir.join("polaris_restore.db")])
        .filter(|f| f.exists())
        .collect();
    if files.is_empty() {
        return Ok(());
    }
    move_files(&files, &app_dir.join("legacy").join(stamp()))
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

async fn pull_mirror(path: &Path) -> Result<(), String> {
    let db = libsql::Builder::new_remote_replica(path, TURSO_URL.to_string(), TURSO_AUTH_TOKEN.to_string())
        .build()
        .await
        .map_err(|e| e.to_string())?;
    db.sync().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn refresh_mirror(app_dir: &Path) -> Result<(), String> {
    if !configured() {
        return Err("Turso belum dikonfigurasi".to_string());
    }
    let path = mirror_db(app_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    match pull_mirror(&path).await {
        Ok(()) => Ok(()),
        Err(first) => {
            if !reachable().await {
                return Err(first);
            }
            remove_files(&path)?;
            pull_mirror(&path).await.map_err(|e| format!("{}; {}", first, e))
        }
    }
}

fn copy_mirror(app_dir: &Path, target: &Path) -> Result<(), String> {
    let source = mirror_db(app_dir);
    if !source.exists() {
        return Err("Tidak ada koneksi ke server dan komputer ini belum punya salinan data. Sambungkan internet lalu buka lagi aplikasi.".to_string());
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    remove_files(target)?;
    std::fs::copy(&source, target).map_err(|e| format!("Gagal menyalin data cadangan: {}", e))?;
    let wal = with_suffix(&source, "-wal");
    if wal.exists() {
        std::fs::copy(&wal, with_suffix(target, "-wal")).map_err(|e| format!("Gagal menyalin data cadangan: {}", e))?;
    }
    Ok(())
}

pub async fn mirror_loop(app: tauri::AppHandle) {
    if !configured() {
        return;
    }
    tokio::time::sleep(Duration::from_secs(3)).await;
    loop {
        if let Ok(dir) = app_dir(&app) {
            let _guard = MIRROR.lock().await;
            if let Err(e) = refresh_mirror(&dir).await {
                eprintln!("Sinkron cadangan lokal gagal: {}", e);
            }
        }
        tokio::time::sleep(MIRROR_INTERVAL).await;
    }
}

pub fn mirror_exists(app_dir: &Path) -> bool {
    mirror_db(app_dir).exists()
}

pub async fn mirror_snapshot(app_dir: &Path) -> Result<Vec<u8>, String> {
    let snapshot = app_dir.join("snapshot").join("polaris.db");
    {
        let _guard = MIRROR.lock().await;
        if let Err(e) = refresh_mirror(app_dir).await {
            eprintln!("Sinkron sebelum backup gagal, memakai salinan terakhir: {}", e);
        }
        copy_mirror(app_dir, &snapshot)?;
    }
    {
        let db = libsql::Builder::new_local(&snapshot).build().await.map_err(|e| e.to_string())?;
        let conn = db.connect().map_err(|e| e.to_string())?;
        conn.query("PRAGMA wal_checkpoint(TRUNCATE)", ()).await.map_err(|e| e.to_string())?;
    }
    let bytes = std::fs::read(&snapshot).map_err(|e| format!("Gagal membaca database: {}", e))?;
    std::fs::remove_dir_all(app_dir.join("snapshot")).ok();
    Ok(bytes)
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

async fn insert_statements(local: &libsql::Connection, table: &str, columns: &[String]) -> Result<Vec<String>, String> {
    let list = columns.iter().map(|c| quote(c)).collect::<Vec<_>>().join(", ");
    let prefix = format!("INSERT INTO {} ({}) VALUES ", quote(table), list);
    let mut rows = local
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
        if count >= RESTORE_CHUNK_ROWS || current.len() >= RESTORE_CHUNK_BYTES {
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

pub async fn restore_to_turso(app_dir: &Path, bytes: &[u8]) -> Result<(), String> {
    if offline_db(app_dir).exists() {
        return Err("Masih ada transaksi offline yang belum terkirim ke server. Sambungkan internet dan tunggu sampai terkirim, lalu coba lagi.".to_string());
    }
    let file = app_dir.join("restore").join(format!("{}.db", stamp()));
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&file, bytes).map_err(|e| format!("Gagal menyimpan file restore: {}", e))?;

    let result = push_backup(&file).await;
    std::fs::remove_dir_all(app_dir.join("restore")).ok();
    result?;

    let _guard = MIRROR.lock().await;
    refresh_mirror(app_dir).await.ok();
    Ok(())
}

async fn push_backup(file: &Path) -> Result<(), String> {
    let local_db = libsql::Builder::new_local(file).build().await.map_err(|e| e.to_string())?;
    let local = local_db.connect().map_err(|e| e.to_string())?;
    let remote_db = libsql::Builder::new_remote(TURSO_URL.to_string(), TURSO_AUTH_TOKEN.to_string())
        .build()
        .await
        .map_err(|e| e.to_string())?;
    let remote = remote_db.connect().map_err(|e| e.to_string())?;

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

#[tauri::command]
pub async fn mirror_sync(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app_dir(&app)?;
    let _guard = MIRROR.lock().await;
    refresh_mirror(&dir).await
}

#[tauri::command]
pub fn offline_db_exists(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(offline_db(&app_dir(&app)?).exists())
}

#[tauri::command]
pub async fn prepare_offline_db(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app_dir(&app)?;
    let path = offline_db(&dir);
    if !path.exists() {
        let _guard = MIRROR.lock().await;
        copy_mirror(&dir, &path)?;
    }
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn discard_offline_db(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app_dir(&app)?;
    let files = database_files(&offline_db(&dir));
    if !files.iter().any(|f| f.exists()) {
        return Ok(());
    }
    let archive = dir.join("offline-archive");
    move_files(&files, &archive.join(stamp()))?;
    std::fs::remove_dir(dir.join("offline")).ok();

    let mut kept: Vec<PathBuf> = std::fs::read_dir(&archive)
        .map(|entries| entries.filter_map(|e| e.ok().map(|e| e.path())).collect())
        .unwrap_or_default();
    kept.sort();
    let excess = kept.len().saturating_sub(ARCHIVES_KEPT);
    for old in kept.into_iter().take(excess) {
        std::fs::remove_dir_all(old).ok();
    }
    Ok(())
}

const UPDATER_TOKEN: &str = env!("UPDATER_TOKEN");

#[tauri::command]
pub fn get_updater_token() -> Option<String> {
    if UPDATER_TOKEN.is_empty() {
        return None;
    }
    Some(UPDATER_TOKEN.to_string())
}
