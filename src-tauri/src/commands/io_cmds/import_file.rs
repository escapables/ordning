use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use zeroize::Zeroize;

use crate::import_export::importer::{parse_export_data, parse_import_payload};
use crate::models::{AppData, ExportData};
use crate::storage::encryption::{EncryptedEnvelope, EncryptionContext, ENCRYPTED_FORMAT};

pub(super) fn read_import_file(
    path: &PathBuf,
    password: Option<String>,
) -> Result<AppData, String> {
    let content = fs::read_to_string(path).map_err(|err| format!("read import file: {err}"))?;
    let (imported, _) = parse_import_content(&content, password, false)?;
    imported.ok_or_else(|| "password is required for encrypted import".to_owned())
}

pub(super) fn preview_import_file(
    path: &PathBuf,
    password: Option<String>,
) -> Result<(Option<AppData>, bool), String> {
    let content = fs::read_to_string(path).map_err(|err| format!("read import file: {err}"))?;
    parse_import_content(&content, password, true)
}

pub(super) fn parse_import_content(
    content: &str,
    password: Option<String>,
    allow_encrypted_probe: bool,
) -> Result<(Option<AppData>, bool), String> {
    let parsed = serde_json::from_str::<Value>(content)
        .map_err(|err| format!("invalid import JSON: {err}"))?;

    match parsed.get("format").and_then(Value::as_str) {
        Some(ENCRYPTED_FORMAT) => {
            let envelope = serde_json::from_value::<EncryptedEnvelope>(parsed)
                .map_err(|err| format!("invalid encrypted import JSON: {err}"))?;
            let mut password = password.unwrap_or_default();
            if password.trim().is_empty() {
                password.zeroize();
                if allow_encrypted_probe {
                    return Ok((None, true));
                }
                return Err("password is required for encrypted import".to_owned());
            }

            let export_data = EncryptionContext::decrypt_json_with_password::<ExportData>(
                &envelope,
                &password,
                "encrypted export data",
            )
            .map_err(|err| format!("failed to decrypt import file: {err}"));
            password.zeroize();

            Ok((Some(parse_export_data(export_data?)?), true))
        }
        Some(other) => Err(format!("unsupported import format '{other}'")),
        None => Ok((Some(parse_import_payload(content)?), false)),
    }
}
