mod auth;
mod gdrive;
mod midtrans;
mod printer;
mod turso;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_libsql::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Ok(app_dir) = app.path().app_data_dir() {
                std::fs::create_dir_all(&app_dir).ok();

                let db_file = app_dir.join("polaris.db");
                if !db_file.exists() {
                    if let Ok(cwd) = std::env::current_dir() {
                        let stray = cwd.join("polaris.db");
                        if stray.exists() {
                            std::fs::copy(&stray, &db_file).ok();
                            for suffix in ["-shm", "-wal"] {
                                let from = cwd.join(format!("polaris.db{}", suffix));
                                if from.exists() {
                                    std::fs::copy(&from, app_dir.join(format!("polaris.db{}", suffix))).ok();
                                }
                            }
                        }
                    }
                }

                let restore_file = app_dir.join("polaris_restore.db");
                if restore_file.exists() {
                    std::fs::copy(&restore_file, &db_file).ok();
                    std::fs::remove_file(&restore_file).ok();
                }
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                gdrive::auto_backup_loop(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::get_default_hash,
            gdrive::gdrive_backup,
            gdrive::gdrive_list_backups,
            gdrive::gdrive_restore,
            gdrive::gdrive_delete_backup,
            gdrive::gdrive_get_auto_backup_status,
            midtrans::midtrans_create_qris,
            midtrans::midtrans_check_status,
            midtrans::midtrans_cancel,
            printer::list_printers,
            printer::print_raw,
            printer::printer_status,
            turso::get_turso_config,
            turso::get_updater_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
