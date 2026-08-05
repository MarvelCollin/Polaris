mod auth;
mod gdrive;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if let Ok(app_dir) = app.path().app_data_dir() {
                let restore_file = app_dir.join("polaris_restore.db");
                let db_file = app_dir.join("polaris.db");
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
            auth::check_bypass,
            auth::get_default_hash,
            gdrive::gdrive_authenticate,
            gdrive::gdrive_refresh,
            gdrive::gdrive_backup,
            gdrive::gdrive_list_backups,
            gdrive::gdrive_restore,
            gdrive::gdrive_delete_backup,
            gdrive::gdrive_set_auto_backup,
            gdrive::gdrive_get_auto_backup_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
