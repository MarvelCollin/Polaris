fn main() {
    if let Ok(contents) = std::fs::read_to_string("gdrive_secrets.toml") {
        for line in contents.lines() {
            let line = line.trim();
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim().trim_matches('"');
                match key {
                    "midtrans_server_key" => println!("cargo:rustc-env=MIDTRANS_SERVER_KEY={}", value),
                    "service_account_email" => println!("cargo:rustc-env=GDRIVE_SA_EMAIL={}", value),
                    "service_account_private_key" => println!("cargo:rustc-env=GDRIVE_SA_KEY={}", value),
                    "target_email" => println!("cargo:rustc-env=GDRIVE_TARGET_EMAIL={}", value),
                    _ => {}
                }
            }
        }
        println!("cargo:rerun-if-changed=gdrive_secrets.toml");
    } else {
        println!("cargo:rustc-env=MIDTRANS_SERVER_KEY=");
        println!("cargo:rustc-env=GDRIVE_SA_EMAIL=");
        println!("cargo:rustc-env=GDRIVE_SA_KEY=");
        println!("cargo:rustc-env=GDRIVE_TARGET_EMAIL=");
        println!("cargo:warning=gdrive_secrets.toml not found, secrets disabled");
    }

    tauri_build::build()
}
