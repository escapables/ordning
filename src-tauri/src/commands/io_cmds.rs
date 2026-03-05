mod import_file;
mod path_state;

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use uuid::Uuid;
use zeroize::Zeroize;

use self::import_file::{preview_import_file, read_import_file};
use self::path_state::{
    clear_pending_import_path, get_pending_import_path, pick_import_file, resolve_dialog_directory,
    set_pending_import_path,
};

use crate::import_export::importer::{
    apply_import, summarize_import, ImportStrategy, ImportSummary,
};
use crate::models::{AppData, ExportCalendar, ExportData, ExportEvent, ExportMode};
use crate::state::AppState;
use crate::storage::encryption::EncryptionContext;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub calendar_count: usize,
    pub event_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub path: String,
    pub summary: Option<ImportSummary>,
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub path: String,
    pub summary: ImportSummary,
}

#[tauri::command]
pub async fn export_json(
    mode: ExportMode,
    calendar_ids: Option<Vec<String>>,
    password: Option<String>,
    default_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ExportResult, String> {
    let selected_ids = parse_calendar_ids(calendar_ids)?;
    let app_data = snapshot_data(&state)?;
    let export_data = build_export_data(&app_data, mode, selected_ids)?;

    let file_path = app
        .dialog()
        .file()
        .set_title("Export Ordning JSON")
        .set_directory(resolve_dialog_directory(&state, default_path))
        .set_file_name("ordning-export.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file()
        .ok_or_else(|| "export canceled".to_owned())?;

    let write_path = to_path_buf(file_path)?;
    let payload = serialize_export_payload(&export_data, password)?;
    fs::write(&write_path, payload).map_err(|err| format!("write export file: {err}"))?;

    Ok(ExportResult {
        path: write_path.display().to_string(),
        calendar_count: export_data.calendars.len(),
        event_count: export_data.events.len(),
    })
}

#[tauri::command]
pub fn get_export_event_count(
    calendar_ids: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let selected_ids = parse_calendar_ids(calendar_ids)?;
    let app_data = snapshot_data(&state)?;
    let export_data = build_export_data(&app_data, ExportMode::Full, selected_ids)?;
    Ok(export_data.events.len())
}

#[tauri::command]
pub fn get_launch_directory(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.launch_directory.display().to_string())
}

#[tauri::command]
pub async fn preview_import_json(
    strategy: ImportStrategy,
    password: Option<String>,
    default_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ImportPreview, String> {
    let path = resolve_import_path(default_path, password.as_deref(), &app, &state)?;
    set_pending_import_path(&state, &path)?;
    let (imported, encrypted) = preview_import_file(&path, password)?;
    let summary = if let Some(imported_data) = imported {
        let current = snapshot_data(&state)?;
        Some(summarize_import(&current, &imported_data, strategy))
    } else {
        None
    };

    Ok(ImportPreview {
        path: path.display().to_string(),
        summary,
        encrypted,
    })
}

#[tauri::command]
pub fn import_json(
    strategy: ImportStrategy,
    password: Option<String>,
    state: State<'_, AppState>,
) -> Result<ImportResult, String> {
    let file_path =
        get_pending_import_path(&state)?.ok_or_else(|| "no import file selected".to_owned())?;
    let imported = read_import_file(&file_path, password)?;
    let current = snapshot_data(&state)?;
    let (updated_data, summary) = apply_import(&current, &imported, strategy);

    state
        .store
        .save(&updated_data)
        .map_err(|err| format!("failed to persist import: {err}"))?;

    {
        let mut locked = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        *locked = updated_data.clone();
    }
    {
        let mut persisted = state
            .persisted
            .lock()
            .map_err(|err| format!("failed to lock persisted state: {err}"))?;
        *persisted = updated_data;
    }
    clear_pending_import_path(&state)?;

    Ok(ImportResult {
        path: file_path.display().to_string(),
        summary,
    })
}

fn snapshot_data(state: &State<'_, AppState>) -> Result<AppData, String> {
    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;
    Ok(app_data.clone())
}

fn resolve_import_path(
    default_path: Option<String>,
    password: Option<&str>,
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> Result<PathBuf, String> {
    if password.is_some() {
        return get_pending_import_path(state)?.ok_or_else(|| "no import file selected".to_owned());
    }

    pick_import_file(app, resolve_dialog_directory(state, default_path))
}

fn parse_calendar_ids(raw: Option<Vec<String>>) -> Result<Option<HashSet<Uuid>>, String> {
    match raw {
        None => Ok(None),
        Some(values) => {
            let mut ids = HashSet::new();
            for value in values {
                let id = Uuid::parse_str(&value)
                    .map_err(|err| format!("invalid calendar id '{value}': {err}"))?;
                ids.insert(id);
            }
            Ok(Some(ids))
        }
    }
}

fn build_export_data(
    app_data: &AppData,
    mode: ExportMode,
    selected_ids: Option<HashSet<Uuid>>,
) -> Result<ExportData, String> {
    let calendar_filter = selected_ids.unwrap_or_else(|| {
        app_data
            .calendars
            .iter()
            .map(|calendar| calendar.id)
            .collect::<HashSet<_>>()
    });

    if calendar_filter.is_empty() {
        return Err("at least one calendar must be selected".to_owned());
    }

    let calendars = app_data
        .calendars
        .iter()
        .filter(|calendar| calendar_filter.contains(&calendar.id))
        .map(ExportCalendar::from)
        .collect::<Vec<_>>();

    let events = app_data
        .events
        .iter()
        .filter(|event| calendar_filter.contains(&event.calendar_id))
        .map(|event| ExportEvent::from_event(event, mode))
        .collect::<Vec<_>>();

    Ok(ExportData::new(mode, calendars, events))
}

fn to_path_buf(file_path: FilePath) -> Result<PathBuf, String> {
    match file_path {
        FilePath::Path(path) => Ok(path),
        FilePath::Url(url) => url
            .to_file_path()
            .map_err(|_| "unsupported export target URL".to_owned()),
    }
}

fn serialize_export_payload(
    export_data: &ExportData,
    password: Option<String>,
) -> Result<Vec<u8>, String> {
    match password {
        None => {
            serde_json::to_vec_pretty(export_data).map_err(|err| format!("serialize export: {err}"))
        }
        Some(mut password) => {
            if password.trim().is_empty() {
                password.zeroize();
                return Err("export password is required".to_owned());
            }

            let envelope = EncryptionContext::derive_new(&password)
                .and_then(|context| context.encrypt_json(export_data, "encrypted export data"))
                .map_err(|err| format!("serialize export: {err}"));
            password.zeroize();

            let envelope = envelope?;
            serde_json::to_vec_pretty(&envelope).map_err(|err| format!("serialize export: {err}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveTime};

    use super::*;
    use crate::models::{Calendar, Event};
    use crate::storage::encryption::EncryptedEnvelope;

    fn calendar(id: Uuid, name: &str) -> Calendar {
        Calendar {
            id,
            name: name.to_owned(),
            color: "#007aff".to_owned(),
            group: None,
            visible: true,
            created_at: "2026-02-24T00:00:00Z".to_owned(),
            updated_at: "2026-02-24T00:00:00Z".to_owned(),
        }
    }

    fn event(id: Uuid, calendar_id: Uuid, title: &str) -> Event {
        Event {
            id,
            calendar_id,
            title: title.to_owned(),
            start_date: NaiveDate::from_ymd_opt(2026, 2, 24).expect("valid date"),
            end_date: NaiveDate::from_ymd_opt(2026, 2, 24).expect("valid date"),
            start_time: None,
            end_time: None,
            all_day: true,
            description_private: "private".to_owned(),
            description_public: "public".to_owned(),
            location: None,
            recurrence: None,
            recurrence_parent_id: None,
            created_at: "2026-02-24T00:00:00Z".to_owned(),
            updated_at: "2026-02-24T00:00:00Z".to_owned(),
        }
    }

    fn single_event_export_data(title: &str) -> ExportData {
        let calendar_id = Uuid::new_v4();
        let app_data = AppData {
            calendars: vec![calendar(calendar_id, "Work")],
            events: vec![event(Uuid::new_v4(), calendar_id, title)],
            ..AppData::default()
        };

        build_export_data(
            &app_data,
            ExportMode::Full,
            Some(HashSet::from([calendar_id])),
        )
        .expect("export should succeed")
    }

    #[test]
    fn build_export_data_public_mode_strips_private_description() {
        let calendar_id = Uuid::new_v4();
        let app_data = AppData {
            calendars: vec![calendar(calendar_id, "Personal")],
            events: vec![event(Uuid::new_v4(), calendar_id, "Daily sync")],
            ..AppData::default()
        };

        let exported = build_export_data(
            &app_data,
            ExportMode::Public,
            Some(HashSet::from([calendar_id])),
        )
        .expect("export should succeed");

        assert_eq!(exported.events.len(), 1);
        assert!(exported.events[0].description_private.is_none());
        assert_eq!(exported.events[0].description_public, "public");
    }

    #[test]
    fn build_export_data_filters_selected_calendars() {
        let include_id = Uuid::new_v4();
        let exclude_id = Uuid::new_v4();
        let app_data = AppData {
            calendars: vec![
                calendar(include_id, "Include"),
                calendar(exclude_id, "Exclude"),
            ],
            events: vec![
                event(Uuid::new_v4(), include_id, "Included event"),
                event(Uuid::new_v4(), exclude_id, "Excluded event"),
            ],
            ..AppData::default()
        };

        let exported = build_export_data(
            &app_data,
            ExportMode::Full,
            Some(HashSet::from([include_id])),
        )
        .expect("export should succeed");

        assert_eq!(exported.calendars.len(), 1);
        assert_eq!(exported.calendars[0].id, include_id);
        assert_eq!(exported.events.len(), 1);
        assert_eq!(exported.events[0].calendar_id, include_id);
        assert!(exported.events[0].description_private.is_some());
    }

    #[test]
    fn build_export_data_preserves_wrapped_event_dates_and_times() {
        let calendar_id = Uuid::new_v4();
        let app_data = AppData {
            calendars: vec![calendar(calendar_id, "Work")],
            events: vec![Event {
                id: Uuid::new_v4(),
                calendar_id,
                title: "Night Deploy".to_owned(),
                start_date: NaiveDate::from_ymd_opt(2026, 2, 24).expect("valid date"),
                end_date: NaiveDate::from_ymd_opt(2026, 2, 25).expect("valid date"),
                start_time: Some(NaiveTime::from_hms_opt(23, 0, 0).expect("valid time")),
                end_time: Some(NaiveTime::from_hms_opt(1, 30, 0).expect("valid time")),
                all_day: false,
                description_private: "private".to_owned(),
                description_public: "public".to_owned(),
                location: None,
                recurrence: None,
                recurrence_parent_id: None,
                created_at: "2026-02-24T00:00:00Z".to_owned(),
                updated_at: "2026-02-24T00:00:00Z".to_owned(),
            }],
            ..AppData::default()
        };

        let exported = build_export_data(
            &app_data,
            ExportMode::Full,
            Some(HashSet::from([calendar_id])),
        )
        .expect("export should succeed");

        assert_eq!(exported.events.len(), 1);
        let event = &exported.events[0];
        assert_eq!(event.start_date, "2026-02-24");
        assert_eq!(event.end_date, "2026-02-25");
        assert_eq!(event.start_time.as_deref(), Some("23:00"));
        assert_eq!(event.end_time.as_deref(), Some("01:30"));
    }

    #[test]
    fn serialize_export_payload_encrypts_when_password_present() {
        let export_data = single_event_export_data("Encrypted");

        let payload = serialize_export_payload(&export_data, Some("top secret".to_owned()))
            .expect("encrypted export payload");
        let envelope = serde_json::from_slice::<EncryptedEnvelope>(&payload)
            .expect("valid encrypted envelope");
        let decrypted = EncryptionContext::decrypt_json_with_password::<ExportData>(
            &envelope,
            "top secret",
            "encrypted export data",
        )
        .expect("decrypt encrypted export");

        assert_eq!(decrypted, export_data);
    }

    #[test]
    fn parse_import_content_reads_encrypted_export_with_password() {
        let export_data = single_event_export_data("Encrypted");
        let payload = serialize_export_payload(&export_data, Some("top secret".to_owned()))
            .expect("encrypted export payload");
        let content = String::from_utf8(payload).expect("utf8 export payload");

        let (imported, encrypted) = super::import_file::parse_import_content(
            &content,
            Some("top secret".to_owned()),
            false,
        )
        .expect("import works");
        let imported = imported.expect("imported app data");

        assert!(encrypted);
        assert_eq!(imported.calendars.len(), 1);
        assert_eq!(imported.events.len(), 1);
        assert_eq!(imported.events[0].title, "Encrypted");
    }

    #[test]
    fn parse_import_content_requires_password_for_encrypted_export() {
        let export_data = single_event_export_data("Encrypted");
        let payload = serialize_export_payload(&export_data, Some("top secret".to_owned()))
            .expect("encrypted export payload");
        let content = String::from_utf8(payload).expect("utf8 export payload");

        let error = super::import_file::parse_import_content(&content, None, false)
            .expect_err("encrypted import should require password");

        assert!(error.contains("password is required"));
    }
}
