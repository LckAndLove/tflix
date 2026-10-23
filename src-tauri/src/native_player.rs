use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
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
    #[serde(default)]
    pub model: serde_json::Value,
}

fn validate(request: &PlayerRequest) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(&request.url).map_err(|_| "Invalid player URL")?;
    if request.server != 4
        || request.id.is_empty()
        || !request.id.bytes().all(|c| c.is_ascii_digit())
        || !matches!(request.media_type.as_str(), "movie" | "tv")
        || request.season == 0
        || request.episode == 0
        || url.scheme() != "https"
        || url.host_str() != Some("cinesrc.st")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.path() != format!("/embed/{}/{}", request.media_type, request.id)
    {
        return Err("Invalid player source".into());
    }
    Ok(url)
}

fn controller(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    if window.label() == "main"
        && (url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost"))
    {
        Ok(())
    } else {
        Err("Player controller required".into())
    }
}

fn is_active(app: &tauri::AppHandle, session: u64) -> bool {
    app.state::<PlayerState>()
        .active
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|(id, _)| *id == session)
}

#[tauri::command]
pub async fn open_native_player(
    app: tauri::AppHandle,
    window: WebviewWindow,
    request: PlayerRequest,
) -> Result<u64, String> {
    // Only the bundled controller can create windows; source pages get no IPC permissions.
    controller(&window)?;
    let url = validate(&request)?;
    let session = app
        .state::<PlayerState>()
        .serial
        .fetch_add(1, Ordering::Relaxed)
        + 1;
    let label = format!("playback-{session}");
    let config = serde_json::json!({"session":session,"request":request});
    let script = format!("window.__TFLIX_DIRECT_PLAYER__ = {};", config);
    let close_app = app.clone();
    let previous_label = app
        .state::<PlayerState>()
        .active
        .lock()
        .unwrap()
        .as_ref()
        .map(|(_, label)| label.clone());
    let previous_window = previous_label
        .as_deref()
        .and_then(|label| app.get_webview_window(label));
    let geometry = previous_window.as_ref().unwrap_or(&window);
    let scale = geometry.scale_factor().unwrap_or(1.0);
    let size = geometry.inner_size().ok();
    let position = geometry.outer_position().ok();
    let fullscreen = previous_window
        .as_ref()
        .is_some_and(|w| w.is_fullscreen().unwrap_or(false));
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url));
    if let Some(size) = size {
        builder = builder.inner_size(size.width as f64 / scale, size.height as f64 / scale);
    }
    if let Some(position) = position {
        builder = builder.position(position.x as f64 / scale, position.y as f64 / scale);
    }
    let player = builder
        .title("TFLIX")
        .min_inner_size(940.0, 600.0)
        .visible(false)
        .background_color(tauri::webview::Color(0, 0, 0, 255))
        .initialization_script(&script)
        .initialization_script(include_str!("native_player.js"))
        .initialization_script_for_all_frames(super::INTERACTION_GUARD_SCRIPT)
        .initialization_script_for_all_frames(super::PLAYER_COMPAT_SCRIPT)
        .initialization_script_for_all_frames(super::SUBTITLE_COMPAT_SCRIPT)
        .initialization_script_for_all_frames(super::SUBTITLE_SESSION_SCRIPT)
        .initialization_script_for_all_frames(super::SUBTITLE_CONTROLLER_SCRIPT)
        .initialization_script_for_all_frames(super::SUBTITLE_LAYOUT_SCRIPT)
        .initialization_script_for_all_frames("window.__TFLIX_NATIVE_MONITOR__ = true;")
        .initialization_script_for_all_frames(super::PLAYER_MONITOR_SCRIPT)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_navigation(move |url| url.scheme() == "https" || url.as_str() == "about:blank")
        .build()
        .map_err(|e| e.to_string())?;
    player.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) && is_active(&close_app, session) {
            *close_app.state::<PlayerState>().active.lock().unwrap() = None;
            if let Some(main) = close_app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            }
            let _ = close_app.emit_to("main", "native-player-closed", session);
        }
    });
    let previous = app
        .state::<PlayerState>()
        .active
        .lock()
        .unwrap()
        .replace((session, label));
    if let Some((_, previous_label)) = previous {
        if let Some(previous) = app.get_webview_window(&previous_label) {
            let _ = previous.close();
        }
    }
    window.hide().map_err(|e| e.to_string())?;
    if fullscreen {
        let _ = player.set_fullscreen(true);
    }
    player.show().map_err(|e| e.to_string())?;
    let _ = player.set_focus();
    Ok(session)
}

fn player_event(session: u64, payload: &str) -> Option<serde_json::Value> {
    if payload.len() > 4096 {
        return None;
    }
    let data: serde_json::Value = serde_json::from_str(payload).ok()?;
    let action = data.get("action").and_then(|v| v.as_str());
    if let Some(action) = action {
        if !matches!(
            action,
            "source"
                | "season"
                | "episode"
                | "next"
                | "language"
                | "provider-episode"
                | "sync"
                | "back"
        ) {
            return None;
        }
        let mut result = serde_json::json!({"session":session,"action":action});
        for key in ["server", "season", "episode"] {
            if let Some(value) = data.get(key) {
                let number = value.as_u64()?;
                if number == 0 || number > 100_000 {
                    return None;
                }
                result[key] = number.into();
            }
        }
        return Some(result);
    }
    let kind = data.get("type")?.as_str()?;
    if !matches!(
        kind,
        "tflix:media-ready"
            | "tflix:media-progress"
            | "tflix:media-resumed"
            | "tflix:media-playing"
            | "tflix:media-paused"
            | "tflix:interaction"
    ) {
        return None;
    }
    let frame = data.get("frameId")?.as_u64()?;
    if frame == 0 {
        return None;
    }
    let mut result = serde_json::json!({"session":session,"type":kind,"frameId":frame});
    for key in ["currentTime", "duration"] {
        if let Some(value) = data.get(key) {
            if value.is_null() {
                continue;
            }
            let number = value.as_f64()?;
            if !number.is_finite() || !(0.0..=604800.0).contains(&number) {
                return None;
            }
            result[key] = value.clone();
        }
    }
    if let Some(value) = data.get("ended").and_then(|v| v.as_bool()) {
        result["ended"] = value.into();
    }
    if let Some(id) = data.get("mediaId").and_then(|v| v.as_str()) {
        if id.len() > 20 || !id.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        result["mediaId"] = id.into();
        let media_type = data.get("mediaType")?.as_str()?;
        if !matches!(media_type, "movie" | "tv") {
            return None;
        }
        result["mediaType"] = media_type.into();
        for key in ["season", "episode"] {
            result[key] = data.get(key)?.as_u64()?.into();
        }
    }
    Some(result)
}

// This is the only command exposed to remote player origins. It cannot
// execute scripts, open URLs, read storage, or use any system/plugin API.
#[tauri::command]
pub async fn native_player_event(
    app: tauri::AppHandle,
    window: WebviewWindow,
    payload: serde_json::Value,
) -> Result<(), String> {
    let session = window
        .label()
        .strip_prefix("playback-")
        .and_then(|x| x.parse::<u64>().ok())
        .ok_or("Player window required")?;
    if !is_active(&app, session) {
        return Ok(());
    }
    let event = player_event(session, &payload.to_string()).ok_or("Invalid player event")?;
    if event.get("action").and_then(|x| x.as_str()) == Some("back") {
        window.close().map_err(|e| e.to_string())?;
    } else {
        app.emit_to("main", "native-player-event", event)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_native_player(
    app: tauri::AppHandle,
    window: WebviewWindow,
    session: u64,
    model: serde_json::Value,
) -> Result<(), String> {
    controller(&window)?;
    if is_active(&app, session) {
        if let Some(player) = app.get_webview_window(&format!("playback-{session}")) {
            player
                .eval(&format!("window.__TFLIX_UPDATE_PLAYER__?.({});", model))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn send_native_player(
    app: tauri::AppHandle,
    window: WebviewWindow,
    session: u64,
    frame_id: u64,
    command: serde_json::Value,
) -> Result<(), String> {
    controller(&window)?;
    if command.get("type").and_then(|x| x.as_str()) != Some("tflix:resume") {
        return Err("Invalid playback command".into());
    }
    for key in ["time", "duration"] {
        let value = command
            .get(key)
            .and_then(|x| x.as_f64())
            .ok_or("Invalid playback time")?;
        if !value.is_finite() || !(0.0..=604800.0).contains(&value) {
            return Err("Invalid playback time".into());
        }
    }
    if is_active(&app, session) {
        if let Some(player) = app.get_webview_window(&format!("playback-{session}")) {
            let value = serde_json::json!({"frameId":frame_id,"command":command});
            player
                .eval(&format!("window.__TFLIX_NATIVE_SEND__?.({value});"))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn close_native_player(
    app: tauri::AppHandle,
    window: WebviewWindow,
    session: u64,
) -> Result<(), String> {
    controller(&window)?;
    if is_active(&app, session) {
        *app.state::<PlayerState>().active.lock().unwrap() = None;
        if let Some(player) = app.get_webview_window(&format!("playback-{session}")) {
            let _ = player.close();
        }
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_focus();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> PlayerRequest {
        PlayerRequest {
            url: "https://cinesrc.st/embed/tv/123542?s=1&e=3".into(),
            server: 4,
            media_type: "tv".into(),
            id: "123542".into(),
            season: 1,
            episode: 3,
            title: "Title".into(),
            language: "zh".into(),
            model: serde_json::Value::Null,
        }
    }
    #[test]
    fn accepts_the_selected_ekko_title() {
        assert!(validate(&request()).is_ok());
    }
    #[test]
    fn validates_native_channel_without_accepting_script_or_failure_commands() {
        assert!(player_event(
            1,
            r#"{"type":"tflix:media-progress","frameId":1,"currentTime":30,"duration":120}"#
        )
        .is_some());
        assert!(player_event(1, r#"{"action":"source","server":2}"#).is_some());
        for payload in [
            r#"{"action":"eval","script":"bad"}"#,
            r#"{"type":"tflix:media-error","frameId":1}"#,
            r#"{"type":"tflix:media-progress","frameId":1,"currentTime":-1}"#,
            r#"{"action":"season","season":0}"#,
        ] {
            assert!(player_event(1, payload).is_none());
        }
    }
    #[test]
    fn rejects_untrusted_urls_and_mismatched_titles() {
        for url in [
            "https://example.com/embed/tv/123542",
            "https://cinesrc.st.evil.test/embed/tv/123542",
            "http://cinesrc.st/embed/tv/123542",
            "https://user:pass@cinesrc.st/embed/tv/123542",
            "https://cinesrc.st/embed/tv/1",
        ] {
            let mut value = request();
            value.url = url.into();
            assert!(validate(&value).is_err());
        }
    }
}
