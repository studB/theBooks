mod chat;
mod format;
mod fs;
mod git;
mod s3;
mod search;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            chat::chat_complete,
            chat::get_api_key,
            chat::set_api_key,
            fs::list_workspace,
            fs::read_file,
            fs::write_file,
            fs::create_file,
            fs::create_folder,
            fs::rename_item,
            fs::delete_item,
            fs::get_workspace,
            fs::set_workspace,
            fs::migrate_from_local,
            fs::is_migrated_v4_local,
            format::get_format,
            format::set_format,
            format::remove_format,
            format::get_default_format,
            git::git_status_summary,
            git::git_file_diff,
            s3::sync_workspace,
            s3::set_s3_workspace,
            s3::get_s3_workspace,
            search::search_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
