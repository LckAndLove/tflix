use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const SITE_URL: &str = "https://tflix.nunesnetwork.com/";
const SITE_ORIGIN: &str = "https://tflix.nunesnetwork.com";
const SUPPORT_URL: &str = "https://github.com/TomasTNunes/tflix";

const INIT_SCRIPT: &str = include_str!("init.js");

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
