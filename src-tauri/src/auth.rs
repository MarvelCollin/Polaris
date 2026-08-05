use sha2::{Digest, Sha256};

const BYPASS_HASH: &str = "6d3c7ff261625033f48ef0aee594de62456a90481b431400f984d9c16ff9de9e";
const DEFAULT_HASH: &str = "154c660289df60fce46c8f980429514ea0118ea854a5bc8ae974c2040e9e2959";

fn sha256_hex(input: &str) -> String {
    let result = Sha256::digest(input.as_bytes());
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
pub fn check_bypass(password: String) -> bool {
    sha256_hex(&password) == BYPASS_HASH
}

#[tauri::command]
pub fn get_default_hash() -> String {
    DEFAULT_HASH.to_string()
}
