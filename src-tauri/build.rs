#[path = "src/source_config.rs"]
mod source_config;

fn main() {
    println!("cargo:rerun-if-changed=../stream/source-config.js");
    let capability = serde_json::json!({
        "$schema":"../gen/schemas/desktop-schema.json",
        "identifier":"native-player",
        "description":"Playback windows may report validated playback events only. No updater, file or system permissions.",
        "local":false,"windows":["playback-*"],
        "remote":{"urls":source_config::all().iter().map(|s|format!("https://{}/*",s["host"].as_str().expect("source host missing"))).collect::<Vec<_>>()},
        "permissions":["allow-native-player-event"]
    });
    let path = "capabilities/native-player.json";
    let data = serde_json::to_string_pretty(&capability).unwrap() + "\n";
    if std::fs::read_to_string(path).ok().as_deref() != Some(&data) {
        std::fs::write(path, data).expect("failed to write player permissions");
    }

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "check_update",
            "install_update",
            "open_external",
            "open_native_player",
            "update_native_player",
            "send_native_player",
            "close_native_player",
            "native_player_event",
        ]),
    ))
    .expect("failed to build TFLIX");
}
