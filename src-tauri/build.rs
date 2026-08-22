use std::collections::HashMap;

fn main() {
    let keys = [
        ("midtrans_server_key", "MIDTRANS_SERVER_KEY"),
        ("client_id", "GDRIVE_CLIENT_ID"),
        ("client_secret", "GDRIVE_CLIENT_SECRET"),
        ("refresh_token", "GDRIVE_REFRESH_TOKEN"),
        ("turso_url", "TURSO_URL"),
        ("turso_auth_token", "TURSO_AUTH_TOKEN"),
        ("updater_token", "UPDATER_TOKEN"),
    ];

    let mut values: HashMap<&str, String> = HashMap::new();
    for (_, env_name) in keys.iter() {
        values.insert(env_name, String::new());
    }

    match std::fs::read_to_string("gdrive_secrets.toml") {
        Ok(contents) => {
            for line in contents.lines() {
                let line = line.trim();
                if line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim().trim_matches('"');
                    if let Some((_, env_name)) = keys.iter().find(|(k, _)| *k == key) {
                        values.insert(env_name, value.to_string());
                    }
                }
            }
            println!("cargo:rerun-if-changed=gdrive_secrets.toml");
        }
        Err(_) => {
            println!("cargo:warning=gdrive_secrets.toml not found, secrets disabled");
        }
    }

    for (_, env_name) in keys.iter() {
        let value = values.get(env_name).cloned().unwrap_or_default();
        println!("cargo:rustc-env={}={}", env_name, value);
    }

    tauri_build::build()
}
