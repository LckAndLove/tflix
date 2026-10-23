use serde::{Deserialize, Serialize};
use std::sync::{atomic::{AtomicU64, Ordering}, Mutex};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct PlayerState {
    serial: AtomicU64,
    active: Mutex<Option<(u64, String)>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerRequest {
    pub url: String,
    pub server: u8,
    pub media_type: String,
    pub id: String,
    pub season: u32,
    pub episode: u32,
    pub title: String,
    pub language: String,
}

fn validate(request: &PlayerRequest) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(&request.url).map_err(|_| "Invalid player URL")?;
    if request.server != 4 || request.id.is_empty() || !request.id.bytes().all(|c| c.is_ascii_digit())
        || !matches!(request.media_type.as_str(), "movie" | "tv") || request.season == 0 || request.episode == 0
        || url.scheme() != "https" || url.host_str() != Some("cinesrc.st")
        || !url.username().is_empty() || url.password().is_some() || url.port().is_some()
        || url.path() != format!("/embed/{}/{}", request.media_type, request.id)
    { return Err("Invalid player source".into()); }
    Ok(url)
}

fn is_active(app: &tauri::AppHandle, session: u64) -> bool {
    app.state::<PlayerState>().active.lock().unwrap().as_ref().is_some_and(|(id, _)| *id == session)
}

#[tauri::command]
pub async fn open_native_player(app: tauri::AppHandle, window: WebviewWindow, request: PlayerRequest) -> Result<u64, String> {
    // Only the bundled controller can create windows; source pages get no IPC permissions.
    let caller = window.url().map_err(|e| e.to_string())?;
    if window.label() != "main" || !(caller.scheme() == "tauri" || caller.host_str() == Some("tauri.localhost")) {
        return Err("Player controller required".into());
    }
    let url = validate(&request)?;
    let session = app.state::<PlayerState>().serial.fetch_add(1, Ordering::Relaxed) + 1;
    let label = format!("playback-{session}");
    let config = serde_json::json!({"session":session,"request":request});
    let script = format!("window.__TFLIX_DIRECT_PLAYER__ = {};", config);
    let nav_app = app.clone();
    let close_app = app.clone();
    let player = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .title("TFLIX").inner_size(1400.0, 880.0).min_inner_size(940.0, 600.0).center()
        .initialization_script(&script)
        .initialization_script(include_str!("native_player.js"))
        .initialization_script_for_all_frames(super::INTERACTION_GUARD_SCRIPT)
        .initialization_script_for_all_frames(super::PLAYER_COMPAT_SCRIPT)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_navigation(move |url| {
            if url.scheme() == "tflix-player" {
                if is_active(&nav_app, session) && url.host_str() == Some("back") {
                    if let Some(window) = nav_app.get_webview_window(&format!("playback-{session}")) { let _ = window.close(); }
                }
                return false;
            }
            url.scheme() == "https" || url.as_str() == "about:blank"
        })
        .build().map_err(|e| e.to_string())?;
    player.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) && is_active(&close_app, session) {
            *close_app.state::<PlayerState>().active.lock().unwrap() = None;
            if let Some(main) = close_app.get_webview_window("main") { let _ = main.show(); let _ = main.set_focus(); }
            let _ = close_app.emit_to("main", "native-player-closed", session);
        }
    });
    let previous = app.state::<PlayerState>().active.lock().unwrap().replace((session, label));
    if let Some((_, previous_label)) = previous {
        if let Some(previous) = app.get_webview_window(&previous_label) { let _ = previous.close(); }
    }
    let _ = player.set_focus();
    window.hide().map_err(|e| e.to_string())?;
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> PlayerRequest {
        PlayerRequest { url: "https://cinesrc.st/embed/tv/123542?s=1&e=3".into(), server:4, media_type:"tv".into(), id:"123542".into(), season:1, episode:3, title:"Title".into(), language:"zh".into() }
    }
    #[test]
    fn accepts_the_selected_ekko_title() { assert!(validate(&request()).is_ok()); }
    #[test]
    fn rejects_untrusted_urls_and_mismatched_titles() {
        for url in ["https://example.com/embed/tv/123542", "https://cinesrc.st.evil.test/embed/tv/123542", "http://cinesrc.st/embed/tv/123542", "https://user:pass@cinesrc.st/embed/tv/123542", "https://cinesrc.st/embed/tv/1"] {
            let mut value=request();value.url=url.into();assert!(validate(&value).is_err());
        }
    }
}
