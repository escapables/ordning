use std::collections::HashMap;

use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::models::Event;
use crate::recurrence::expand_recurring_event_instances;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct TimedWeekEvent {
    pub id: String,
    pub source_id: Uuid,
    pub is_virtual: bool,
    pub calendar_id: Uuid,
    pub title: String,
    pub date: String,
    pub start_date: String,
    pub end_date: String,
    pub start_time: String,
    pub end_time: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AllDayWeekEvent {
    pub id: String,
    pub source_id: Uuid,
    pub is_virtual: bool,
    pub calendar_id: Uuid,
    pub title: String,
    pub date: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WeekEventsResponse {
    pub timed: Vec<TimedWeekEvent>,
    pub all_day: Vec<AllDayWeekEvent>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SearchEventResult {
    pub id: Uuid,
    pub calendar_id: Uuid,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub description_public: String,
}

#[tauri::command]
pub fn get_week_events(
    start_date: String,
    end_date: String,
    state: State<'_, AppState>,
) -> Result<WeekEventsResponse, String> {
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

    Ok(build_week_events_response(
        &app_data.events,
        &visible_calendars,
        range_start,
        range_end,
    ))
}

#[tauri::command]
pub fn search_events(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchEventResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
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

    Ok(build_search_event_results(
        &app_data.events,
        &visible_calendars,
        query,
    ))
}

fn build_week_events_response(
    events: &[Event],
    visible_calendars: &HashMap<Uuid, String>,
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> WeekEventsResponse {
    let mut timed = Vec::new();
    let mut all_day = Vec::new();
    let expanded_events = expand_recurring_event_instances(events, range_start, range_end);

    for expanded in expanded_events {
        let event = &expanded.event;
        let Some(color) = visible_calendars.get(&event.calendar_id) else {
            continue;
        };

        if event.end_date < range_start || event.start_date > range_end {
            continue;
        }

        let date = event.start_date.format("%Y-%m-%d").to_string();
        let is_all_day = event.all_day || event.start_time.is_none() || event.end_time.is_none();

        if is_all_day {
            all_day.push(AllDayWeekEvent {
                id: expanded.display_id.clone(),
                source_id: event.id,
                is_virtual: expanded.is_virtual,
                calendar_id: event.calendar_id,
                title: event.title.clone(),
                date,
                color: color.clone(),
            });
            continue;
        }

        let (Some(start_time), Some(end_time)) = (event.start_time, event.end_time) else {
            continue;
        };

        timed.push(TimedWeekEvent {
            id: expanded.display_id,
            source_id: event.id,
            is_virtual: expanded.is_virtual,
            calendar_id: event.calendar_id,
            title: event.title.clone(),
            date,
            start_date: event.start_date.format("%Y-%m-%d").to_string(),
            end_date: event.end_date.format("%Y-%m-%d").to_string(),
            start_time: start_time.format("%H:%M").to_string(),
            end_time: end_time.format("%H:%M").to_string(),
            color: color.clone(),
        });
    }

    WeekEventsResponse { timed, all_day }
}

fn build_search_event_results(
    events: &[Event],
    visible_calendars: &HashMap<Uuid, String>,
    query: &str,
) -> Vec<SearchEventResult> {
    let normalized_query = query.to_lowercase();

    let mut results: Vec<SearchEventResult> = events
        .iter()
        .filter(|event| visible_calendars.contains_key(&event.calendar_id))
        .filter(|event| {
            let title = event.title.to_lowercase();
            let private_description = event.description_private.to_lowercase();
            let public_description = event.description_public.to_lowercase();
            let location = event.location.as_deref().unwrap_or("").to_lowercase();

            title.contains(&normalized_query)
                || private_description.contains(&normalized_query)
                || public_description.contains(&normalized_query)
                || location.contains(&normalized_query)
        })
        .map(|event| SearchEventResult {
            id: event.id,
            calendar_id: event.calendar_id,
            title: event.title.clone(),
            start_date: event.start_date.format("%Y-%m-%d").to_string(),
            end_date: event.end_date.format("%Y-%m-%d").to_string(),
            start_time: event
                .start_time
                .map(|time| time.format("%H:%M").to_string()),
            end_time: event.end_time.map(|time| time.format("%H:%M").to_string()),
            all_day: event.all_day || event.start_time.is_none() || event.end_time.is_none(),
            location: event.location.clone(),
            description_public: event.description_public.clone(),
        })
        .collect();

    results.sort_by(|left, right| left.start_date.cmp(&right.start_date));
    results
}

#[cfg(test)]
mod tests;
