use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

const TURSO_URL: &str = env!("TURSO_URL");
const TURSO_AUTH_TOKEN: &str = env!("TURSO_AUTH_TOKEN");

pub const REPLICA_SIDECARS: [&str; 4] = ["-wal", "-shm", "-info", "-client_wal_index"];

#[derive(Serialize)]
pub struct TursoConfig {
    pub url: String,
    pub token: String,
}

pub fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{}", path.display(), suffix))
}

fn replica_files(app: &tauri::AppHandle) -> Result<(PathBuf, Vec<PathBuf>), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db = dir.join("polaris.db");
    let mut files = vec![db.clone()];
    files.extend(REPLICA_SIDECARS.iter().map(|suffix| with_suffix(&db, suffix)));
    Ok((dir, files))
}

#[tauri::command]
pub fn get_turso_config() -> Option<TursoConfig> {
    if TURSO_URL.is_empty() || TURSO_AUTH_TOKEN.is_empty() {
        return None;
    }
    Some(TursoConfig {
        url: TURSO_URL.to_string(),
        token: TURSO_AUTH_TOKEN.to_string(),
    })
}

#[tauri::command]
pub async fn turso_reachable() -> bool {
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

#[tauri::command]
pub fn quarantine_replica(app: tauri::AppHandle) -> Result<String, String> {
    let (dir, files) = replica_files(&app)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target = dir.join("diverged").join(stamp);
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    for file in files {
        if let (true, Some(name)) = (file.exists(), file.file_name()) {
            std::fs::rename(&file, target.join(name))
                .map_err(|e| format!("Gagal memindahkan {}: {}", file.display(), e))?;
        }
    }
    Ok(target.display().to_string())
}

#[tauri::command]
pub fn restore_replica(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    let (_, files) = replica_files(&app)?;
    let source = PathBuf::from(folder);
    for file in &files {
        if file.exists() {
            std::fs::remove_file(file).map_err(|e| format!("Gagal menghapus {}: {}", file.display(), e))?;
        }
    }
    for file in &files {
        if let Some(name) = file.file_name() {
            let saved = source.join(name);
            if saved.exists() {
                std::fs::rename(&saved, file).map_err(|e| format!("Gagal mengembalikan {}: {}", file.display(), e))?;
            }
        }
    }
    std::fs::remove_dir(&source).ok();
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
