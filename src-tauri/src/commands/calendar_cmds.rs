use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::models::Calendar;
use crate::state::AppState;

#[tauri::command]
pub fn list_calendars(state: State<'_, AppState>) -> Result<Vec<Calendar>, String> {
    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;
    Ok(app_data.calendars.clone())
}

#[tauri::command]
pub fn create_calendar(
    name: String,
    color: Option<String>,
    group: Option<String>,
    state: State<'_, AppState>,
) -> Result<Calendar, String> {
    let now = Utc::now().to_rfc3339();
    let calendar = Calendar {
        id: Uuid::new_v4(),
        name,
        color: color.unwrap_or_else(|| "#007aff".to_owned()),
        group,
        visible: true,
        created_at: now.clone(),
        updated_at: now,
    };

    let snapshot = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        app_data.calendars.push(calendar.clone());
        app_data.clone()
    };

    state
        .store
        .save(&snapshot)
        .map_err(|err| format!("failed to persist calendar: {err}"))?;

    Ok(calendar)
}
