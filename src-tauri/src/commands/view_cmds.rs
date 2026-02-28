use std::collections::HashMap;

use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

#[cfg(test)]
use crate::models::Calendar;
use crate::models::Event;
use crate::state::AppState;
#[cfg(test)]
use chrono::NaiveTime;

#[derive(Debug, Clone, Serialize)]
pub struct TimedWeekEvent {
    pub id: Uuid,
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
    pub id: Uuid,
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

    for event in events {
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
                id: event.id,
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
            id: event.id,
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
mod tests {
    use super::*;

    fn sample_calendar(id: Uuid) -> Calendar {
        Calendar {
            id,
            name: "Personal".to_owned(),
            color: "#007aff".to_owned(),
            group: None,
            visible: true,
            created_at: "2026-01-01T00:00:00Z".to_owned(),
            updated_at: "2026-01-01T00:00:00Z".to_owned(),
        }
    }

    fn sample_event(
        id: Uuid,
        calendar_id: Uuid,
        start_date: NaiveDate,
        end_date: NaiveDate,
        start_time: Option<NaiveTime>,
        end_time: Option<NaiveTime>,
        all_day: bool,
        title: &str,
    ) -> Event {
        Event {
            id,
            calendar_id,
            title: title.to_owned(),
            start_date,
            end_date,
            start_time,
            end_time,
            all_day,
            description_private: String::new(),
            description_public: String::new(),
            location: None,
            recurrence: None,
            recurrence_parent_id: None,
            created_at: "2026-01-01T00:00:00Z".to_owned(),
            updated_at: "2026-01-01T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn build_week_events_response_splits_timed_and_all_day() {
        let calendar_id = Uuid::new_v4();
        let _calendar = sample_calendar(calendar_id);
        let date = NaiveDate::from_ymd_opt(2026, 2, 24).unwrap();

        let timed_event = sample_event(
            Uuid::new_v4(),
            calendar_id,
            date,
            date,
            Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            false,
            "Timed",
        );
        let all_day_event = sample_event(
            Uuid::new_v4(),
            calendar_id,
            date,
            date,
            None,
            None,
            true,
            "All day",
        );

        let mut visible = HashMap::new();
        visible.insert(calendar_id, "#007aff".to_owned());

        let result =
            build_week_events_response(&[timed_event, all_day_event], &visible, date, date);

        assert_eq!(result.timed.len(), 1);
        assert_eq!(result.all_day.len(), 1);
        assert_eq!(result.timed[0].title, "Timed");
        assert_eq!(result.timed[0].start_date, "2026-02-24");
        assert_eq!(result.timed[0].end_date, "2026-02-24");
        assert_eq!(result.all_day[0].title, "All day");
    }

    #[test]
    fn build_week_events_response_preserves_multi_day_timed_dates() {
        let calendar_id = Uuid::new_v4();
        let start_date = NaiveDate::from_ymd_opt(2026, 2, 24).unwrap();
        let end_date = NaiveDate::from_ymd_opt(2026, 2, 26).unwrap();

        let event = sample_event(
            Uuid::new_v4(),
            calendar_id,
            start_date,
            end_date,
            Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(12, 0, 0).unwrap()),
            false,
            "Long run",
        );

        let mut visible = HashMap::new();
        visible.insert(calendar_id, "#007aff".to_owned());

        let result = build_week_events_response(&[event], &visible, start_date, end_date);

        assert_eq!(result.timed.len(), 1);
        assert_eq!(result.timed[0].start_date, "2026-02-24");
        assert_eq!(result.timed[0].end_date, "2026-02-26");
    }

    #[test]
    fn build_week_events_response_filters_out_of_range() {
        let calendar_id = Uuid::new_v4();
        let date = NaiveDate::from_ymd_opt(2026, 2, 24).unwrap();
        let outside = NaiveDate::from_ymd_opt(2026, 3, 10).unwrap();

        let event = sample_event(
            Uuid::new_v4(),
            calendar_id,
            outside,
            outside,
            Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            false,
            "Outside",
        );

        let mut visible = HashMap::new();
        visible.insert(calendar_id, "#007aff".to_owned());

        let result = build_week_events_response(&[event], &visible, date, date);

        assert!(result.timed.is_empty());
        assert!(result.all_day.is_empty());
    }

    #[test]
    fn build_search_event_results_matches_title_description_and_location() {
        let calendar_id = Uuid::new_v4();
        let date = NaiveDate::from_ymd_opt(2026, 2, 24).unwrap();

        let mut by_title = sample_event(
            Uuid::new_v4(),
            calendar_id,
            date,
            date,
            Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            false,
            "Roadmap Review",
        );
        by_title.description_public = "Team sync".to_owned();

        let mut by_private_description = sample_event(
            Uuid::new_v4(),
            calendar_id,
            date,
            date,
            Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(11, 0, 0).unwrap()),
            false,
            "Daily",
        );
        by_private_description.description_private = "Contains Urgent context".to_owned();

        let mut by_location = sample_event(
            Uuid::new_v4(),
            calendar_id,
            date,
            date,
            Some(NaiveTime::from_hms_opt(12, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(13, 0, 0).unwrap()),
            false,
            "Lunch",
        );
        by_location.location = Some("Rooftop".to_owned());

        let mut visible = HashMap::new();
        visible.insert(calendar_id, "#007aff".to_owned());

        let query_title =
            build_search_event_results(std::slice::from_ref(&by_title), &visible, "review");
        let query_description = build_search_event_results(
            std::slice::from_ref(&by_private_description),
            &visible,
            "urgent",
        );
        let query_location =
            build_search_event_results(std::slice::from_ref(&by_location), &visible, "roof");

        assert_eq!(query_title.len(), 1);
        assert_eq!(query_title[0].title, "Roadmap Review");
        assert_eq!(query_title[0].calendar_id, calendar_id);
        assert_eq!(query_title[0].end_date, "2026-02-24");
        assert_eq!(query_title[0].start_time.as_deref(), Some("09:00"));
        assert_eq!(query_title[0].end_time.as_deref(), Some("10:00"));
        assert!(!query_title[0].all_day);
        assert_eq!(query_title[0].description_public, "Team sync");

        assert_eq!(query_description.len(), 1);
        assert_eq!(query_description[0].title, "Daily");

        assert_eq!(query_location.len(), 1);
        assert_eq!(query_location[0].location.as_deref(), Some("Rooftop"));
    }

    #[test]
    fn build_search_event_results_excludes_hidden_calendar_events() {
        let visible_calendar_id = Uuid::new_v4();
        let hidden_calendar_id = Uuid::new_v4();
        let date = NaiveDate::from_ymd_opt(2026, 2, 24).unwrap();

        let visible_event = sample_event(
            Uuid::new_v4(),
            visible_calendar_id,
            date,
            date,
            Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
            false,
            "Visible",
        );
        let hidden_event = sample_event(
            Uuid::new_v4(),
            hidden_calendar_id,
            date,
            date,
            Some(NaiveTime::from_hms_opt(11, 0, 0).unwrap()),
            Some(NaiveTime::from_hms_opt(12, 0, 0).unwrap()),
            false,
            "Hidden",
        );

        let mut visible = HashMap::new();
        visible.insert(visible_calendar_id, "#007aff".to_owned());

        let result = build_search_event_results(&[visible_event, hidden_event], &visible, "i");

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].title, "Visible");
    }
}
