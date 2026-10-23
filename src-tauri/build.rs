fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "check_update", "install_update", "open_external", "open_native_player",
            "update_native_player", "send_native_player", "close_native_player", "native_player_event",
        ])
    )).expect("failed to build TFLIX");
}
