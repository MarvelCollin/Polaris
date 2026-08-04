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

fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("polaris.db"))
}

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

    if !token_resp.status().is_success() {
        let body = token_resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange gagal: {}", body));
    }

    token_resp
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("Gagal parse token: {}", e))
}

#[tauri::command]
pub async fn gdrive_refresh(refresh_token: String) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("refresh_token", refresh_token.as_str()),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Gagal refresh token: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh gagal: {}", body));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| e.to_string())
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
        let list: DriveFileList = resp.json().await.map_err(|e| e.to_string())?;
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

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gagal membuat folder: {}", body));
    }

    let folder: DriveFile = resp.json().await.map_err(|e| e.to_string())?;
    Ok(folder.id)
}

#[tauri::command]
pub async fn gdrive_backup(
    app: tauri::AppHandle,
    access_token: String,
) -> Result<DriveFile, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Err("Database tidak ditemukan".to_string());
    }

    let file_bytes = std::fs::read(&db_path).map_err(|e| format!("Gagal membaca database: {}", e))?;

    let client = reqwest::Client::new();
    let folder_id = get_or_create_folder(&client, &access_token).await?;

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
        .header(
            "Content-Type",
            format!("multipart/related; boundary={}", boundary),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Upload gagal: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Upload gagal: {}", body));
    }

    resp.json::<DriveFile>()
        .await
        .map_err(|e| format!("Gagal parse response: {}", e))
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

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gagal mengambil daftar backup: {}", body));
    }

    let list: DriveFileList = resp.json().await.map_err(|e| e.to_string())?;
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
