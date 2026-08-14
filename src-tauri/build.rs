fn main() {
    if let Ok(contents) = std::fs::read_to_string("gdrive_secrets.toml") {
        for line in contents.lines() {
            let line = line.trim();
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim().trim_matches('"');
                match key {
                    "midtrans_server_key" => println!("cargo:rustc-env=MIDTRANS_SERVER_KEY={}", value),
                    "client_id" => println!("cargo:rustc-env=GDRIVE_CLIENT_ID={}", value),
                    "client_secret" => println!("cargo:rustc-env=GDRIVE_CLIENT_SECRET={}", value),
                    "refresh_token" => println!("cargo:rustc-env=GDRIVE_REFRESH_TOKEN={}", value),
                    _ => {}
                }
            }
        }
        println!("cargo:rerun-if-changed=gdrive_secrets.toml");
    } else {
        println!("cargo:rustc-env=MIDTRANS_SERVER_KEY=");
        println!("cargo:rustc-env=GDRIVE_CLIENT_ID=");
        println!("cargo:rustc-env=GDRIVE_CLIENT_SECRET=");
        println!("cargo:rustc-env=GDRIVE_REFRESH_TOKEN=");
        println!("cargo:warning=gdrive_secrets.toml not found, secrets disabled");
    }

    tauri_build::build()
}
