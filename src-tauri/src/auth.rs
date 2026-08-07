const DEFAULT_HASH: &str = "154c660289df60fce46c8f980429514ea0118ea854a5bc8ae974c2040e9e2959";

#[tauri::command]
pub fn get_default_hash() -> String {
    DEFAULT_HASH.to_string()
}
