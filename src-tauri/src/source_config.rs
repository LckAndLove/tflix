// Browser/Android adapters, native URL validation and remote permissions use
// the same JSON block, without evaluating third-party or bundled JavaScript.
pub fn all() -> Vec<serde_json::Value> {
    let script = include_str!("../../stream/source-config.js");
    let data = script
        .split("/* TFLIX_SOURCE_DATA_START */")
        .nth(1)
        .and_then(|rest| rest.split("/* TFLIX_SOURCE_DATA_END */").next())
        .expect("shared source data markers missing");
    serde_json::from_str(data).expect("invalid shared source data")
}
