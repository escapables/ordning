use serde::{Deserialize, Serialize};
use tauri::State;

use crate::models::{normalize_lang, AppSettings};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetSettingsPayload {
    pub lang: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub lang: String,
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<SettingsResponse, String> {
    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    Ok(SettingsResponse {
        lang: app_data.settings.lang.clone(),
    })
}

#[tauri::command]
pub fn set_settings(
    settings: SetSettingsPayload,
    state: State<'_, AppState>,
) -> Result<SettingsResponse, String> {
    let next_lang = normalize_lang(&settings.lang).ok_or_else(|| {
        format!(
            "unsupported language '{}', expected 'sv' or 'en'",
            settings.lang
        )
    })?;

    {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        app_data.settings = AppSettings {
            lang: next_lang.clone(),
        };
        app_data.lang = next_lang.clone();
    }

    persist_snapshot(&state)?;
    Ok(SettingsResponse { lang: next_lang })
}

fn persist_snapshot(state: &State<'_, AppState>) -> Result<(), String> {
    let snapshot = {
        let app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        app_data.clone()
    };

    state
        .store
        .save(&snapshot)
        .map_err(|err| format!("failed to persist settings: {err}"))
}

#[cfg(test)]
mod tests {
    use crate::models::normalize_lang;

    #[test]
    fn normalize_lang_accepts_supported_values() {
        assert_eq!(normalize_lang("sv"), Some("sv".to_owned()));
        assert_eq!(normalize_lang("en"), Some("en".to_owned()));
        assert_eq!(normalize_lang("  en  "), Some("en".to_owned()));
        assert_eq!(normalize_lang("de"), None);
    }
}
