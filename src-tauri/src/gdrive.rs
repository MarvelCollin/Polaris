use chrono::Local;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

const SA_EMAIL: &str = env!("GDRIVE_SA_EMAIL");
const SA_KEY: &str = env!("GDRIVE_SA_KEY");
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";

static CACHED_TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);

#[derive(Serialize)]
struct Claims {
    iss: String,
    scope: String,
    aud: String,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
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

async fn get_access_token() -> Result<String, String> {
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

    let pem = SA_KEY.replace("\\n", "\n");
    let key = EncodingKey::from_rsa_pem(pem.as_bytes())
        .map_err(|e| format!("Invalid service account key: {}", e))?;

    let claims = Claims {
        iss: SA_EMAIL.to_string(),
        scope: SCOPE.to_string(),
        aud: "https://oauth2.googleapis.com/token".to_string(),
        iat: now,
        exp: now + 3600,
    };

    let jwt = encode(&Header::new(Algorithm::RS256), &claims, &key)
        .map_err(|e| format!("JWT encode error: {}", e))?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
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

    if let Ok(mut guard) = CACHED_TOKEN.lock() {
        *guard = Some((token_resp.access_token.clone(), now + 3600));
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

fn device_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

async fn get_backup_folder(client: &reqwest::Client, access_token: &str) -> Result<String, String> {
    let root = get_or_create_folder(client, access_token, "Sahabat Sentarum Backup", None).await?;
    get_or_create_folder(client, access_token, &device_name(), Some(&root)).await
}

async fn backup_internal(db_path: &PathBuf) -> Result<DriveFile, String> {
    if !db_path.exists() {
        return Err("Database tidak ditemukan".to_string());
    }

    let access_token = get_access_token().await?;
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
pub async fn gdrive_backup(app: tauri::AppHandle) -> Result<DriveFile, String> {
    let db_path = get_db_path(&app)?;
    let result = backup_internal(&db_path).await?;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut config = load_auto_config(&app_dir);
    config.last_backup_ts = Some(Local::now().timestamp());
    save_auto_config(&app_dir, &config).ok();

    Ok(result)
}

#[tauri::command]
pub async fn gdrive_list_backups() -> Result<Vec<DriveFile>, String> {
    let access_token = get_access_token().await?;
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
    let access_token = get_access_token().await?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file_id))
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

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let restore_path = app_dir.join("polaris_restore.db");
    std::fs::write(&restore_path, &bytes)
        .map_err(|e| format!("Gagal menyimpan file restore: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn gdrive_delete_backup(file_id: String) -> Result<(), String> {
    let access_token = get_access_token().await?;
    let client = reqwest::Client::new();
    let resp = client
        .delete(format!("https://www.googleapis.com/drive/v3/files/{}", file_id))
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
        tokio::time::sleep(Duration::from_secs(300)).await;
        if let Err(e) = try_auto_backup(&app).await {
            eprintln!("Auto backup: {}", e);
        }
    }
}

async fn try_auto_backup(app: &tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let config = load_auto_config(&app_dir);
    let now = Local::now().timestamp();

    if let Some(last_ts) = config.last_backup_ts {
        if now - last_ts < AUTO_BACKUP_INTERVAL_SECS {
            return Ok(());
        }
    }

    let db_path = get_db_path(app)?;
    backup_internal(&db_path).await?;

    let updated = AutoBackupConfig {
        last_backup_ts: Some(now),
    };
    save_auto_config(&app_dir, &updated)?;

    eprintln!("Auto backup selesai");
    Ok(())
}
