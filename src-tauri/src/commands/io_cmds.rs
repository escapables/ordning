use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use uuid::Uuid;

use crate::import_export::importer::{
    apply_import, parse_import_payload, summarize_import, ImportStrategy, ImportSummary,
};
use crate::models::{AppData, ExportCalendar, ExportData, ExportEvent, ExportMode};
use crate::state::AppState;

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
    pub summary: ImportSummary,
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
        .set_file_name("ordning-export.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file()
        .ok_or_else(|| "export canceled".to_owned())?;

    let write_path = to_path_buf(file_path)?;
    let payload = serde_json::to_string_pretty(&export_data)
        .map_err(|err| format!("serialize export: {err}"))?;
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
pub async fn preview_import_json(
    strategy: ImportStrategy,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ImportPreview, String> {
    let file_path = app
        .dialog()
        .file()
        .set_title("Import Ordning JSON")
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
        .ok_or_else(|| "import canceled".to_owned())?;

    let path = to_path_buf(file_path)?;
    let imported = read_import_file(&path)?;
    let current = snapshot_data(&state)?;
    let summary = summarize_import(&current, &imported, strategy);

    Ok(ImportPreview {
        path: path.display().to_string(),
        summary,
    })
}

#[tauri::command]
pub fn import_json(
    path: String,
    strategy: ImportStrategy,
    state: State<'_, AppState>,
) -> Result<ImportResult, String> {
    let file_path = PathBuf::from(path);
    let imported = read_import_file(&file_path)?;
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

fn read_import_file(path: &PathBuf) -> Result<AppData, String> {
    let content = fs::read_to_string(path).map_err(|err| format!("read import file: {err}"))?;
    parse_import_payload(&content)
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveTime};

    use super::*;
    use crate::models::{Calendar, Event};

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
            created_at: "2026-02-24T00:00:00Z".to_owned(),
            updated_at: "2026-02-24T00:00:00Z".to_owned(),
        }
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
}
