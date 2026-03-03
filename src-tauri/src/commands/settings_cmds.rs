use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroize;

use crate::models::{normalize_lang, normalize_timezone, AppData, AppSettings, Calendar};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingsPayload {
    pub lang: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub lang: String,
    pub timezone: String,
    pub storage_encrypted: bool,
    pub storage_locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionStatusResponse {
    pub encrypted: bool,
    pub locked: bool,
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<SettingsResponse, String> {
    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    Ok(build_settings_response(&app_data, &state))
}

#[tauri::command]
pub fn set_settings(
    settings: SetSettingsPayload,
    state: State<'_, AppState>,
) -> Result<SettingsResponse, String> {
    if state.store.status().locked {
        return Err("unlock encrypted data before changing settings".to_owned());
    }

    let next_lang = normalize_lang(&settings.lang).ok_or_else(|| {
        format!(
            "unsupported language '{}', expected 'sv' or 'en'",
            settings.lang
        )
    })?;
    let next_timezone = normalize_timezone(&settings.timezone).ok_or_else(|| {
        format!(
            "unsupported timezone '{}': expected non-empty IANA timezone",
            settings.timezone
        )
    })?;

    let response = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        app_data.settings = AppSettings {
            lang: next_lang.clone(),
            timezone: next_timezone.clone(),
        };
        app_data.lang = next_lang;
        build_settings_response(&app_data, &state)
    };

    Ok(response)
}

#[tauri::command]
pub fn unlock_encrypted_data(
    password: String,
    state: State<'_, AppState>,
) -> Result<SettingsResponse, String> {
    let mut password = password;
    if password.trim().is_empty() {
        password.zeroize();
        return Err("password is required".to_owned());
    }

    let unlock_result = state.store.unlock(&password);
    password.zeroize();

    let mut app_data = unlock_result.map_err(|err| format!("failed to unlock data file: {err}"))?;
    app_data.normalize_settings();

    if ensure_default_calendar(&mut app_data) {
        state
            .store
            .save(&app_data)
            .map_err(|err| format!("failed to persist unlocked data: {err}"))?;
    }

    {
        let mut current = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        *current = app_data.clone();
    }
    {
        let mut persisted = state
            .persisted
            .lock()
            .map_err(|err| format!("failed to lock persisted state: {err}"))?;
        *persisted = app_data.clone();
    }

    Ok(build_settings_response(&app_data, &state))
}

#[tauri::command]
pub fn enable_encryption(
    password: String,
    state: State<'_, AppState>,
) -> Result<EncryptionStatusResponse, String> {
    let mut password = password;
    if password.trim().is_empty() {
        password.zeroize();
        return Err("password is required".to_owned());
    }
    if state.store.status().locked {
        password.zeroize();
        return Err("unlock encrypted data before enabling encryption".to_owned());
    }

    let snapshot = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?
        .clone();

    let enable_result = state.store.enable_encryption(&snapshot, &password);
    password.zeroize();
    enable_result.map_err(|err| format!("failed to enable encryption: {err}"))?;

    let mut persisted = state
        .persisted
        .lock()
        .map_err(|err| format!("failed to lock persisted state: {err}"))?;
    *persisted = snapshot;

    Ok(build_encryption_status(&state))
}

#[tauri::command]
pub fn disable_encryption(
    password: String,
    state: State<'_, AppState>,
) -> Result<EncryptionStatusResponse, String> {
    let mut password = password;
    if password.trim().is_empty() {
        password.zeroize();
        return Err("password is required".to_owned());
    }
    if state.store.status().locked {
        password.zeroize();
        return Err("unlock encrypted data before disabling encryption".to_owned());
    }

    let snapshot = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?
        .clone();

    let disable_result = state.store.disable_encryption(&snapshot, &password);
    password.zeroize();
    disable_result.map_err(|err| format!("failed to disable encryption: {err}"))?;

    let mut persisted = state
        .persisted
        .lock()
        .map_err(|err| format!("failed to lock persisted state: {err}"))?;
    *persisted = snapshot;

    Ok(build_encryption_status(&state))
}

fn build_settings_response(app_data: &AppData, state: &State<'_, AppState>) -> SettingsResponse {
    let status = state.store.status();
    SettingsResponse {
        lang: app_data.settings.lang.clone(),
        timezone: app_data.settings.timezone.clone(),
        storage_encrypted: status.encrypted,
        storage_locked: status.locked,
    }
}

fn build_encryption_status(state: &State<'_, AppState>) -> EncryptionStatusResponse {
    let status = state.store.status();
    EncryptionStatusResponse {
        encrypted: status.encrypted,
        locked: status.locked,
    }
}

fn ensure_default_calendar(app_data: &mut AppData) -> bool {
    if !app_data.calendars.is_empty() {
        return false;
    }

    let now = Utc::now().to_rfc3339();
    app_data.calendars.push(Calendar {
        id: Uuid::new_v4(),
        name: "Personal".to_owned(),
        color: "#007aff".to_owned(),
        group: None,
        visible: true,
        created_at: now.clone(),
        updated_at: now,
    });
    true
}

#[cfg(test)]
mod tests {
    use crate::models::{normalize_lang, normalize_timezone};

    use super::*;

    #[test]
    fn normalize_lang_accepts_supported_values() {
        assert_eq!(normalize_lang("sv"), Some("sv".to_owned()));
        assert_eq!(normalize_lang("en"), Some("en".to_owned()));
        assert_eq!(normalize_lang("  en  "), Some("en".to_owned()));
        assert_eq!(normalize_lang("de"), None);
    }

    #[test]
    fn normalize_timezone_rejects_empty_values() {
        assert_eq!(
            normalize_timezone("Europe/Stockholm"),
            Some("Europe/Stockholm".to_owned())
        );
        assert_eq!(normalize_timezone("  "), None);
    }

    #[test]
    fn ensure_default_calendar_adds_personal_calendar_when_missing() {
        let mut app_data = AppData::default();

        assert!(ensure_default_calendar(&mut app_data));
        assert_eq!(app_data.calendars.len(), 1);
        assert_eq!(app_data.calendars[0].name, "Personal");
    }
}
