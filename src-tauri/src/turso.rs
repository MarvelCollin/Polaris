use serde::Serialize;

const TURSO_URL: &str = env!("TURSO_URL");
const TURSO_AUTH_TOKEN: &str = env!("TURSO_AUTH_TOKEN");

#[derive(Serialize)]
pub struct TursoConfig {
    pub url: String,
    pub token: String,
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
