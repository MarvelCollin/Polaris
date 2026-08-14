use chrono::Local;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write as IoWrite};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

const CLIENT_ID: &str = env!("GDRIVE_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GDRIVE_CLIENT_SECRET");
const SCOPE: &str = "https://www.googleapis.com/auth/drive";

static CACHED_TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone, Default)]
struct OAuthToken {
    refresh_token: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdTime", default)]
    pub created_time: Option<String>,
    #[serde(rename = "modifiedTime", default)]
    pub modified_time: Option<String>,
    #[serde(default)]
    pub size: Option<String>,
}

#[derive(Deserialize)]
struct DriveFileList {
    #[serde(default)]
    files: Vec<DriveFile>,
}

#[derive(Deserialize)]
struct DriveFileId {
    id: String,
}

#[derive(Deserialize)]
struct DriveFileIdList {
    #[serde(default)]
    files: Vec<DriveFileId>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AutoBackupConfig {
    #[serde(default)]
    pub last_backup_ts: Option<i64>,
}

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("polaris.db"))
}

fn parse_json<T: serde::de::DeserializeOwned>(body: &str) -> Result<T, String> {
    serde_json::from_str(body)
        .map_err(|e| format!("{} — response: {}", e, &body[..body.len().min(500)]))
}

fn token_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join("gdrive_token.json")
}

fn auto_backup_config_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join("auto_backup.json")
}

fn load_auto_config(app_dir: &PathBuf) -> AutoBackupConfig {
    std::fs::read_to_string(auto_backup_config_path(app_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_auto_config(app_dir: &PathBuf, config: &AutoBackupConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(auto_backup_config_path(app_dir), json).map_err(|e| e.to_string())
}

fn load_refresh_token(app_dir: &PathBuf) -> Option<String> {
    std::fs::read_to_string(token_path(app_dir))
        .ok()
        .and_then(|s| serde_json::from_str::<OAuthToken>(&s).ok())
        .map(|t| t.refresh_token)
        .filter(|t| !t.is_empty())
}

fn save_refresh_token(app_dir: &PathBuf, token: &str) -> Result<(), String> {
    let t = OAuthToken {
        refresh_token: token.to_string(),
    };
    let json = serde_json::to_string_pretty(&t).map_err(|e| e.to_string())?;
    std::fs::write(token_path(app_dir), json).map_err(|e| e.to_string())
}

fn device_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

async fn get_access_token(app_dir: &PathBuf) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    if let Ok(guard) = CACHED_TOKEN.lock() {
        if let Some((ref token, exp)) = *guard {
            if now < exp - 60 {
                return Ok(token.clone());
            }
        }
    }

    let refresh_token =
        load_refresh_token(app_dir).ok_or("Google Drive belum terhubung. Buka halaman Backup dan klik 'Hubungkan Google Drive'.")?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Token error: {}", body));
    }

    let token_resp: TokenResponse = parse_json(&body)?;
    let expires_in = token_resp.expires_in.unwrap_or(3600);

    if let Ok(mut guard) = CACHED_TOKEN.lock() {
        *guard = Some((token_resp.access_token.clone(), now + expires_in));
    }

    Ok(token_resp.access_token)
}

async fn get_or_create_folder(
    client: &reqwest::Client,
    access_token: &str,
    name: &str,
    parent: Option<&str>,
) -> Result<String, String> {
    let q = if let Some(pid) = parent {
        format!(
            "name='{}' and mimeType='application/vnd.google-apps.folder' and '{}' in parents and trashed=false",
            name, pid
        )
    } else {
        format!(
            "name='{}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            name
        )
    };

    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[("q", q.as_str()), ("fields", "files(id)"), ("spaces", "drive")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let body = resp.text().await.map_err(|e| e.to_string())?;
        let list: DriveFileIdList = parse_json(&body)?;
        if let Some(folder) = list.files.first() {
            return Ok(folder.id.clone());
        }
    }

    let mut meta = serde_json::json!({
        "name": name,
        "mimeType": "application/vnd.google-apps.folder"
    });
    if let Some(pid) = parent {
        meta["parents"] = serde_json::json!([pid]);
    }

    let resp = client
        .post("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .json(&meta)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Gagal membuat folder: {}", body));
    }

    let folder: DriveFileId = parse_json(&body)?;
    Ok(folder.id)
}

async fn get_backup_folder(client: &reqwest::Client, access_token: &str) -> Result<String, String> {
    let root = get_or_create_folder(client, access_token, "Sahabat Sentarum Backup", None).await?;
    get_or_create_folder(client, access_token, &device_name(), Some(&root)).await
}

async fn backup_internal(db_path: &PathBuf, app_dir: &PathBuf) -> Result<DriveFile, String> {
    if !db_path.exists() {
        return Err("Database tidak ditemukan".to_string());
    }

    let access_token = get_access_token(app_dir).await?;
    let file_bytes = std::fs::read(db_path).map_err(|e| format!("Gagal membaca database: {}", e))?;

    let client = reqwest::Client::new();
    let folder_id = get_backup_folder(&client, &access_token).await?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let filename = format!("polaris_backup_{}.db", ts);

    let boundary = "polaris_boundary_xyz789";
    let metadata = serde_json::json!({
        "name": &filename,
        "parents": [&folder_id]
    });

    let mut body = Vec::new();
    let header = format!(
        "--{}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n--{}\r\nContent-Type: application/octet-stream\r\n\r\n",
        boundary,
        serde_json::to_string(&metadata).unwrap(),
        boundary
    );
    body.extend_from_slice(header.as_bytes());
    body.extend_from_slice(&file_bytes);
    body.extend_from_slice(format!("\r\n--{}--", boundary).as_bytes());

    let resp = client
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size")
        .bearer_auth(&access_token)
        .header("Content-Type", format!("multipart/related; boundary={}", boundary))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Upload gagal: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Upload gagal: {}", body));
    }

    parse_json::<DriveFile>(&body)
}

// ── Tauri commands ──

#[tauri::command]
pub async fn gdrive_auth(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://localhost:{}", port);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/auth?client_id={}&redirect_uri={}&scope={}&response_type=code&access_type=offline&prompt=consent",
        CLIENT_ID,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPE),
    );

    open::that(&auth_url).map_err(|e| format!("Gagal membuka browser: {}", e))?;

    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;

    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;

    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| e.to_string())?;

    let code = request_line
        .split_whitespace()
        .nth(1)
        .and_then(|path| {
            url::form_urlencoded::parse(path.trim_start_matches("/?").as_bytes())
                .find(|(k, _)| k == "code")
                .map(|(_, v)| v.to_string())
        })
        .ok_or("Gagal mendapatkan kode otorisasi")?;

    let html = "<html><body><h2>Berhasil! Kembali ke aplikasi Polaris.</h2><script>window.close()</script></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        html.len(),
        html
    );
    stream.write_all(response.as_bytes()).ok();
    drop(stream);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Token exchange error: {}", body));
    }

    let token_resp: TokenResponse = parse_json(&body)?;
    let refresh_token = token_resp
        .refresh_token
        .ok_or("No refresh token received. Try revoking app access in Google settings and reconnecting.")?;

    save_refresh_token(&app_dir, &refresh_token)?;

    if let Ok(mut guard) = CACHED_TOKEN.lock() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        *guard = Some((
            token_resp.access_token,
            now + token_resp.expires_in.unwrap_or(3600),
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn gdrive_is_connected(app: tauri::AppHandle) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(load_refresh_token(&app_dir).is_some())
}

#[tauri::command]
pub async fn gdrive_disconnect(app: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = token_path(&app_dir);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    if let Ok(mut guard) = CACHED_TOKEN.lock() {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn gdrive_backup(app: tauri::AppHandle) -> Result<DriveFile, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = get_db_path(&app)?;
    let result = backup_internal(&db_path, &app_dir).await?;

    let mut config = load_auto_config(&app_dir);
    config.last_backup_ts = Some(Local::now().timestamp());
    save_auto_config(&app_dir, &config).ok();

    Ok(result)
}

#[tauri::command]
pub async fn gdrive_list_backups(app: tauri::AppHandle) -> Result<Vec<DriveFile>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let access_token = get_access_token(&app_dir).await?;
    let client = reqwest::Client::new();
    let folder_id = get_backup_folder(&client, &access_token).await?;

    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(&access_token)
        .query(&[
            ("q", &format!("'{}' in parents and trashed=false", folder_id) as &str),
            ("fields", "files(id,name,createdTime,modifiedTime,size)"),
            ("orderBy", "createdTime desc"),
            ("pageSize", "20"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Gagal mengambil daftar backup: {}", body_text));
    }

    let list: DriveFileList = parse_json(&body_text)?;
    Ok(list.files)
}

#[tauri::command]
pub async fn gdrive_restore(app: tauri::AppHandle, file_id: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let access_token = get_access_token(&app_dir).await?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "https://www.googleapis.com/drive/v3/files/{}?alt=media",
            file_id
        ))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Download gagal: {}", e))?;

    if !resp.status().is_success() {
        return Err("Download gagal".to_string());
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    if bytes.len() < 16 || &bytes[..16] != b"SQLite format 3\0" {
        return Err("File bukan database SQLite yang valid".to_string());
    }

    let restore_path = app_dir.join("polaris_restore.db");
    std::fs::write(&restore_path, &bytes)
        .map_err(|e| format!("Gagal menyimpan file restore: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn gdrive_delete_backup(app: tauri::AppHandle, file_id: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let access_token = get_access_token(&app_dir).await?;
    let client = reqwest::Client::new();
    let resp = client
        .delete(format!(
            "https://www.googleapis.com/drive/v3/files/{}",
            file_id
        ))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gagal menghapus backup: {}", body));
    }

    Ok(())
}

// ── Auto backup (always on, every 6 hours) ──

const AUTO_BACKUP_INTERVAL_SECS: i64 = 6 * 60 * 60;

#[tauri::command]
pub async fn gdrive_get_auto_backup_status(
    app: tauri::AppHandle,
) -> Result<AutoBackupConfig, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(load_auto_config(&app_dir))
}

pub async fn auto_backup_loop(app: tauri::AppHandle) {
    tokio::time::sleep(Duration::from_secs(10)).await;

    if let Err(e) = try_auto_backup(&app).await {
        eprintln!("Auto backup (startup): {}", e);
    }

    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        if let Err(e) = try_auto_backup(&app).await {
            eprintln!("Auto backup: {}", e);
        }
    }
}

async fn try_auto_backup(app: &tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    if load_refresh_token(&app_dir).is_none() {
        return Ok(());
    }

    let config = load_auto_config(&app_dir);
    let now = Local::now().timestamp();

    if let Some(last_ts) = config.last_backup_ts {
        if now - last_ts < AUTO_BACKUP_INTERVAL_SECS {
            return Ok(());
        }
    }

    let db_path = get_db_path(app)?;
    backup_internal(&db_path, &app_dir).await?;

    let updated = AutoBackupConfig {
        last_backup_ts: Some(now),
    };
    save_auto_config(&app_dir, &updated)?;

    eprintln!("Auto backup selesai");
    Ok(())
}
