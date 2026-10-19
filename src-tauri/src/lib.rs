use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use serde::Serialize;

mod player_bridge;

const SUPPORT_URL: &str = "https://github.com/LckAndLove/tflix";

const INIT_SCRIPT: &str = include_str!("init.js");
const PLAYER_COMPAT_SCRIPT: &str = include_str!("player_compat.js");
const SUBTITLE_LAYOUT_SCRIPT: &str = include_str!("subtitle_layout.js");
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
    let updater = app.updater().map_err(|e| e.to_string())?;
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
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
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
    Ok(())
}

#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![check_update, install_update, open_external])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let player_origin = player_bridge::start()?;
            let bridge_origin = tauri::Url::parse(&player_origin)?.origin();
            let player_script = format!(
                "window.__TFLIX_PLAYER_ORIGIN__ = {};",
                serde_json::to_string(&player_origin)?
            );
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("TFLIX")
                .inner_size(1400.0, 880.0)
                .min_inner_size(940.0, 600.0)
                .center()
                .resizable(true)
                .initialization_script(&player_script)
                .initialization_script(INIT_SCRIPT)
                .initialization_script_for_all_frames(PLAYER_COMPAT_SCRIPT)
                .initialization_script_for_all_frames(SUBTITLE_COMPAT_SCRIPT)
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
                    let is_player_bridge = url.origin() == bridge_origin;
                    if !is_app && !is_player_bridge && url.scheme() != "https" {
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
