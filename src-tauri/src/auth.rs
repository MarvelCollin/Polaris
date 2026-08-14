const DEFAULT_HASH: &str = "849ffac9e7e000f75a9572cc09e6e0a2395c138c85b389732c79737db7869861";

#[tauri::command]
pub fn get_default_hash() -> String {
    DEFAULT_HASH.to_string()
}
