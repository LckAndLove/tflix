use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use serde::Serialize;

mod source_config;
mod native_player;

const SUPPORT_URL: &str = "https://github.com/LckAndLove/tflix";

const INIT_SCRIPT: &str = include_str!("init.js");
const INTERACTION_GUARD_SCRIPT: &str = include_str!("interaction_guard.js");
const PLAYER_COMPAT_SCRIPT: &str = include_str!("player_compat.js");
const SUBTITLE_LAYOUT_SCRIPT: &str = include_str!("subtitle_layout.js");
const SUBTITLE_SESSION_SCRIPT: &str = include_str!("subtitle_session.js");
const SUBTITLE_CONTROLLER_SCRIPT: &str = include_str!("subtitle_controller.js");
const SUBTITLE_COMPAT_SCRIPT: &str = include_str!("subtitle_compat.js");
const PLAYER_MONITOR_SCRIPT: &str = include_str!("player_monitor.js");

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
}

#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater_builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            current_version: update.current_version.clone(),
            version: update.version.clone(),
            date: update.date.map(|d| d.to_string()),
            body: update.body.clone(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle, expected_version: String) -> Result<(), String> {
    let updater = app.updater_builder().timeout(std::time::Duration::from_secs(180)).build().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        if update.version != expected_version { return Err("Update version changed. Please check again.".into()); }
        let app_handle = app.clone();
        let mut downloaded: u64 = 0;
        update
            .download_and_install(
                move |chunk_length, content_length| {
                    downloaded += chunk_length as u64;
                    let percent = content_length.map(|total| {
                        if total > 0 {
                            (downloaded as f64 / total as f64 * 100.0).round() as u32
                        } else {
                            0
                        }
                    });
                    let _ = app_handle.emit(
                        "update-download-progress",
                        serde_json::json!({
                            "chunk": chunk_length,
                            "downloaded": downloaded,
                            "total": content_length,
                            "percentage": percent,
                            "percent": percent
                        }),
                    );
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;

        app.restart();
    }
    Err("No update is currently available.".into())
}

#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let focused=native_player::active_window(app).or_else(||app.get_webview_window("main"));
            if let Some(w) = focused {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(native_player::PlayerState::default())
        .invoke_handler(tauri::generate_handler![check_update, install_update, open_external, native_player::open_native_player, native_player::open_player_external, native_player::update_native_player, native_player::send_native_player, native_player::close_native_player, native_player::native_player_event])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("TFLIX")
                .inner_size(1400.0, 880.0)
                .min_inner_size(940.0, 600.0)
                .center()
                .resizable(true)
                .initialization_script("window.__TFLIX_NATIVE_PLAYER__ = true;")
                .initialization_script(INIT_SCRIPT)
                .initialization_script_for_all_frames(INTERACTION_GUARD_SCRIPT)
                .initialization_script_for_all_frames(PLAYER_COMPAT_SCRIPT)
                .initialization_script_for_all_frames(SUBTITLE_COMPAT_SCRIPT)
                .initialization_script_for_all_frames(SUBTITLE_SESSION_SCRIPT)
                .initialization_script_for_all_frames(SUBTITLE_CONTROLLER_SCRIPT)
                .initialization_script_for_all_frames(SUBTITLE_LAYOUT_SCRIPT)
                .initialization_script_for_all_frames(PLAYER_MONITOR_SCRIPT)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .on_navigation(move |url| {
                    let url_str = url.as_str();
                    // Intercept Support link and open in external system browser
                    if url_str.starts_with(SUPPORT_URL) || url_str.contains("github.com") {
                        let _ = app_handle.opener().open_url(url_str, None::<&str>);
                        return false;
                    }
                    // WKWebView also reports iframe navigations here. HTTPS embeds
                    // and their nested player redirects must be allowed; the player
                    // iframe sandbox prevents popups and top-frame navigation.
                    let is_app = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (matches!(url.scheme(), "http" | "https")
                            && url.host_str() == Some("tauri.localhost"));
                    if !is_app && url.scheme() != "https" {
                        return false;
                    }
                    true
                })
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
