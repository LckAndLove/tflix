use tauri::{Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use serde::Serialize;

const SITE_URL: &str = "https://tflix.nunesnetwork.com/";
const SITE_ORIGIN: &str = "https://tflix.nunesnetwork.com";
const SUPPORT_URL: &str = "https://github.com/LckAndLove/tflix";

const INIT_SCRIPT: &str = include_str!("init.js");

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
        .invoke_handler(tauri::generate_handler![check_update, install_update])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let target_url: Url = SITE_URL.parse().expect("valid site URL");

            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(target_url))
                .title("TFLIX")
                .inner_size(1400.0, 880.0)
                .min_inner_size(940.0, 600.0)
                .center()
                .resizable(true)
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
                .initialization_script(INIT_SCRIPT)
                .on_navigation(move |url| {
                    let url_str = url.as_str();
                    // Intercept Support link and open in external system browser
                    if url_str.starts_with(SUPPORT_URL) {
                        let _ = app_handle.opener().open_url(url_str, None::<&str>);
                        return false;
                    }
                    // Pin top frame to TFLIX origin (block external popups/ad redirects)
                    if !url_str.starts_with(SITE_ORIGIN) {
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
