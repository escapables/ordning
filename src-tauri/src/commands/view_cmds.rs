use std::collections::HashMap;

use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct WeekEvent {
    pub id: Uuid,
    pub calendar_id: Uuid,
    pub title: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub color: String,
}

#[tauri::command]
pub fn get_week_events(
    start_date: String,
    end_date: String,
    state: State<'_, AppState>,
) -> Result<Vec<WeekEvent>, String> {
    let range_start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|err| format!("invalid start_date '{start_date}': {err}"))?;
    let range_end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|err| format!("invalid end_date '{end_date}': {err}"))?;

    if range_end < range_start {
        return Err("end_date must be on or after start_date".to_owned());
    }

    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    let visible_calendars: HashMap<Uuid, String> = app_data
        .calendars
        .iter()
        .filter(|calendar| calendar.visible)
        .map(|calendar| (calendar.id, calendar.color.clone()))
        .collect();

    let events = app_data
        .events
        .iter()
        .filter_map(|event| {
            let color = visible_calendars.get(&event.calendar_id)?;
            if event.end_date < range_start || event.start_date > range_end {
                return None;
            }

            let start_time = event.start_time?;
            let end_time = event.end_time?;
            let date = event.start_date.format("%Y-%m-%d").to_string();

            Some(WeekEvent {
                id: event.id,
                calendar_id: event.calendar_id,
                title: event.title.clone(),
                date,
                start_time: start_time.format("%H:%M").to_string(),
                end_time: end_time.format("%H:%M").to_string(),
                color: color.clone(),
            })
        })
        .collect();

    Ok(events)
}
