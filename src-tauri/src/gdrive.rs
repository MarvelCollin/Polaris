use chrono::Local;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const CLIENT_ID: &str = env!("GDRIVE_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GDRIVE_CLIENT_SECRET");
const REDIRECT_PORT: u16 = 17249;

#[derive(Serialize, Deserialize, Clone)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
    #[serde(default)]
    pub token_type: Option<String>,
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
    pub enabled: bool,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub last_backup_date: Option<String>,
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

// ── Core functions (shared by commands and auto-backup) ──

async fn refresh_internal(refresh_token: &str) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Gagal refresh token: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Token refresh gagal: {}", body));
    }

    parse_json::<TokenResponse>(&body)
}

async fn backup_internal(db_path: &PathBuf, access_token: &str) -> Result<DriveFile, String> {
    if !db_path.exists() {
        return Err("Database tidak ditemukan".to_string());
    }

    let file_bytes =
        std::fs::read(db_path).map_err(|e| format!("Gagal membaca database: {}", e))?;

    let client = reqwest::Client::new();
    let folder_id = get_or_create_folder(&client, access_token).await?;

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
        .bearer_auth(access_token)
        .header(
            "Content-Type",
            format!("multipart/related; boundary={}", boundary),
        )
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

async fn get_or_create_folder(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<String, String> {
    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .query(&[
            ("q", "name='Sahabat Sentarum Backup' and mimeType='application/vnd.google-apps.folder' and trashed=false"),
            ("fields", "files(id)"),
            ("spaces", "drive"),
        ])
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

    let resp = client
        .post("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(access_token)
        .json(&serde_json::json!({
            "name": "Sahabat Sentarum Backup",
            "mimeType": "application/vnd.google-apps.folder"
        }))
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

// ── Tauri commands ──

#[tauri::command]
pub async fn gdrive_authenticate() -> Result<TokenResponse, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", REDIRECT_PORT))
        .await
        .map_err(|e| format!("Gagal membuka port {}: {}", REDIRECT_PORT, e))?;

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://localhost:{}&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent",
        CLIENT_ID, REDIRECT_PORT
    );

    open::that(&auth_url).map_err(|e| format!("Gagal membuka browser: {}", e))?;

    let (mut stream, _) = tokio::time::timeout(Duration::from_secs(300), listener.accept())
        .await
        .map_err(|_| "Login timeout (5 menit). Coba lagi.".to_string())?
        .map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; 8192];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);

    if request.contains("error=") {
        let error = request
            .split("error=")
            .nth(1)
            .and_then(|s| s.split(&['&', ' '][..]).next())
            .unwrap_or("unknown");
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body style='font-family:sans-serif;text-align:center;padding:50px'><h2 style='color:red'>Login gagal</h2><p>{}</p></body></html>",
            error
        );
        stream.write_all(resp.as_bytes()).await.ok();
        return Err(format!("OAuth error: {}", error));
    }

    let code = request
        .split("code=")
        .nth(1)
        .and_then(|s| s.split(&['&', ' '][..]).next())
        .ok_or("Kode otorisasi tidak ditemukan")?
        .to_string();

    let resp = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body style='font-family:sans-serif;text-align:center;padding:50px'><h2 style='color:#1b508a'>Berhasil terhubung!</h2><p>Kembali ke aplikasi Sahabat Sentarum.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>";
    stream.write_all(resp.as_bytes()).await.ok();

    let client = reqwest::Client::new();
    let token_resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", &format!("http://localhost:{}", REDIRECT_PORT)),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Gagal menukar kode: {}", e))?;

    let status = token_resp.status();
    let body = token_resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Token exchange gagal: {}", body));
    }

    parse_json::<TokenResponse>(&body)
}

#[tauri::command]
pub async fn gdrive_refresh(refresh_token: String) -> Result<TokenResponse, String> {
    refresh_internal(&refresh_token).await
}

#[tauri::command]
pub async fn gdrive_backup(
    app: tauri::AppHandle,
    access_token: String,
) -> Result<DriveFile, String> {
    let db_path = get_db_path(&app)?;
    backup_internal(&db_path, &access_token).await
}

#[tauri::command]
pub async fn gdrive_list_backups(access_token: String) -> Result<Vec<DriveFile>, String> {
    let client = reqwest::Client::new();
    let folder_id = get_or_create_folder(&client, &access_token).await?;

    let resp = client
        .get("https://www.googleapis.com/drive/v3/files")
        .bearer_auth(&access_token)
        .query(&[
            (
                "q",
                &format!("'{}' in parents and trashed=false", folder_id) as &str,
            ),
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
pub async fn gdrive_restore(
    app: tauri::AppHandle,
    access_token: String,
    file_id: String,
) -> Result<(), String> {
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

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let restore_path = app_dir.join("polaris_restore.db");
    std::fs::write(&restore_path, &bytes)
        .map_err(|e| format!("Gagal menyimpan file restore: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn gdrive_delete_backup(access_token: String, file_id: String) -> Result<(), String> {
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

// ── Auto backup ──

#[tauri::command]
pub async fn gdrive_set_auto_backup(
    app: tauri::AppHandle,
    enabled: bool,
    refresh_token: Option<String>,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut config = load_auto_config(&app_dir);
    config.enabled = enabled;
    if let Some(rt) = refresh_token {
        config.refresh_token = Some(rt);
    }
    save_auto_config(&app_dir, &config)?;

    if enabled {
        register_wake_task().ok();
    } else {
        unregister_wake_task().ok();
    }

    Ok(())
}

#[tauri::command]
pub async fn gdrive_get_auto_backup_status(
    app: tauri::AppHandle,
) -> Result<AutoBackupConfig, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(load_auto_config(&app_dir))
}

fn register_wake_task() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_path = exe.to_string_lossy().replace('\\', "\\\\");

    let ps = format!(
        "$action = New-ScheduledTaskAction -Execute '{}'\n\
         $trigger = New-ScheduledTaskTrigger -Daily -At '00:00'\n\
         $settings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable\n\
         Register-ScheduledTask -TaskName 'SahabatSentarumAutoBackup' -Action $action -Trigger $trigger -Settings $settings -Force",
        exe_path
    );

    let output = std::process::Command::new("powershell")
        .args(["-ExecutionPolicy", "Bypass", "-Command", &ps])
        .output()
        .map_err(|e| format!("Gagal mendaftarkan scheduled task: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Scheduled task error: {}", stderr));
    }

    Ok(())
}

fn unregister_wake_task() -> Result<(), String> {
    std::process::Command::new("powershell")
        .args([
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Unregister-ScheduledTask -TaskName 'SahabatSentarumAutoBackup' -Confirm:$false -ErrorAction SilentlyContinue",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Background loop — runs every 60s, backs up if enabled and none done today
pub async fn auto_backup_loop(app: tauri::AppHandle) {
    tokio::time::sleep(Duration::from_secs(30)).await;

    loop {
        if let Err(e) = try_auto_backup(&app).await {
            eprintln!("Auto backup: {}", e);
        }
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}

async fn try_auto_backup(app: &tauri::AppHandle) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let config = load_auto_config(&app_dir);

    if !config.enabled {
        return Ok(());
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    if config.last_backup_date.as_deref() == Some(today.as_str()) {
        return Ok(());
    }

    let refresh_token = config
        .refresh_token
        .as_deref()
        .ok_or("Auto backup: refresh token tidak ada")?;

    let token_resp = refresh_internal(refresh_token).await?;
    let db_path = get_db_path(app)?;
    backup_internal(&db_path, &token_resp.access_token).await?;

    let mut updated = config;
    updated.last_backup_date = Some(today);
    save_auto_config(&app_dir, &updated)?;

    eprintln!("Auto backup selesai");
    Ok(())
}
