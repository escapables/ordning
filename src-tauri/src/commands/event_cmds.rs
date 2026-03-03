use chrono::{Local, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use std::collections::HashSet;

use crate::models::{Event, RecurrenceRule, RecurrenceRuleInput};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub calendar_id: Uuid,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub description_private: String,
    #[serde(default)]
    pub description_public: String,
    pub location: Option<String>,
    #[serde(default)]
    pub recurrence: Option<RecurrenceRuleInput>,
    #[serde(default)]
    pub recurrence_parent_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDto {
    pub id: Uuid,
    pub calendar_id: Uuid,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub description_private: String,
    pub description_public: String,
    pub location: Option<String>,
    pub recurrence: Option<RecurrenceRule>,
    pub recurrence_parent_id: Option<Uuid>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<&Event> for EventDto {
    fn from(event: &Event) -> Self {
        Self {
            id: event.id,
            calendar_id: event.calendar_id,
            title: event.title.clone(),
            start_date: event.start_date.format("%Y-%m-%d").to_string(),
            end_date: event.end_date.format("%Y-%m-%d").to_string(),
            start_time: event
                .start_time
                .map(|time| time.format("%H:%M").to_string()),
            end_time: event.end_time.map(|time| time.format("%H:%M").to_string()),
            all_day: event.all_day,
            description_private: event.description_private.clone(),
            description_public: event.description_public.clone(),
            location: event.location.clone(),
            recurrence: event.recurrence.clone(),
            recurrence_parent_id: event.recurrence_parent_id,
            created_at: event.created_at.clone(),
            updated_at: event.updated_at.clone(),
        }
    }
}

#[tauri::command]
pub fn create_event(event: EventInput, state: State<'_, AppState>) -> Result<EventDto, String> {
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4();

    let created = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;

        ensure_calendar_exists(&app_data.calendars, event.calendar_id)?;

        let created = build_event(id, &event, now.clone(), now)?;
        app_data.events.push(created.clone());
        created
    };

    Ok(EventDto::from(&created))
}

#[tauri::command]
pub fn update_event(
    id: String,
    event: EventInput,
    state: State<'_, AppState>,
) -> Result<EventDto, String> {
    let event_id = parse_uuid(&id)?;
    let now = Utc::now().to_rfc3339();

    let updated = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;

        ensure_calendar_exists(&app_data.calendars, event.calendar_id)?;

        let existing = app_data
            .events
            .iter_mut()
            .find(|stored| stored.id == event_id)
            .ok_or_else(|| format!("event '{event_id}' not found"))?;

        let created_at = existing.created_at.clone();
        let replacement = build_event(event_id, &event, created_at, now)?;
        *existing = replacement.clone();
        replacement
    };

    Ok(EventDto::from(&updated))
}

#[tauri::command]
pub fn delete_event(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let event_id = parse_uuid(&id)?;

    let deleted = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;

        let before = app_data.events.len();
        app_data.events.retain(|event| event.id != event_id);
        before != app_data.events.len()
    };

    if !deleted {
        return Err(format!("event '{event_id}' not found"));
    }

    Ok(())
}

#[tauri::command]
pub fn delete_events(ids: Vec<String>, state: State<'_, AppState>) -> Result<usize, String> {
    let target_ids: HashSet<Uuid> = ids
        .iter()
        .map(|id| parse_uuid(id))
        .collect::<Result<HashSet<Uuid>, String>>()?;

    let mut app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    let before = app_data.events.len();
    app_data
        .events
        .retain(|event| !target_ids.contains(&event.id));
    Ok(before - app_data.events.len())
}

#[tauri::command]
pub fn get_event(id: String, state: State<'_, AppState>) -> Result<EventDto, String> {
    let event_id = parse_uuid(&id)?;

    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    let event = app_data
        .events
        .iter()
        .find(|event| event.id == event_id)
        .ok_or_else(|| format!("event '{event_id}' not found"))?;

    Ok(EventDto::from(event))
}

#[tauri::command]
pub fn get_past_events_count(
    before_date: Option<String>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let today = resolve_cutoff_date(before_date)?;
    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;
    Ok(count_past_events(&app_data.events, today))
}

#[tauri::command]
pub fn purge_past_events(
    before_date: Option<String>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let today = resolve_cutoff_date(before_date)?;
    let purged = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;

        let before = app_data.events.len();
        app_data.events.retain(|event| event.start_date >= today);
        before.saturating_sub(app_data.events.len())
    };

    if purged == 0 {
        return Ok(0);
    }

    Ok(purged)
}

fn parse_uuid(value: &str) -> Result<Uuid, String> {
    Uuid::parse_str(value).map_err(|err| format!("invalid id '{value}': {err}"))
}

fn build_event(
    id: Uuid,
    input: &EventInput,
    created_at: String,
    updated_at: String,
) -> Result<Event, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("event title is required".to_owned());
    }

    let start_date = parse_date(&input.start_date, "start_date")?;
    let end_date = parse_date(&input.end_date, "end_date")?;

    if end_date < start_date {
        return Err("end_date must be on or after start_date".to_owned());
    }

    let (start_time, end_time) = if input.all_day {
        (None, None)
    } else {
        let start_time = parse_required_time(input.start_time.as_deref(), "start_time")?;
        let end_time = parse_required_time(input.end_time.as_deref(), "end_time")?;

        if start_date == end_date && end_time <= start_time {
            return Err(
                "end_time must be after start_time when start_date equals end_date".to_owned(),
            );
        }

        (Some(start_time), Some(end_time))
    };

    let recurrence = input
        .recurrence
        .as_ref()
        .map(RecurrenceRuleInput::to_rule)
        .transpose()?;

    Ok(Event {
        id,
        calendar_id: input.calendar_id,
        title: title.to_owned(),
        start_date,
        end_date,
        start_time,
        end_time,
        all_day: input.all_day,
        description_private: input.description_private.trim().to_owned(),
        description_public: input.description_public.trim().to_owned(),
        location: sanitize_optional(input.location.clone()),
        recurrence,
        recurrence_parent_id: input.recurrence_parent_id,
        created_at,
        updated_at,
    })
}

use crate::models::recurrence::parse_date;

fn parse_required_time(value: Option<&str>, field: &str) -> Result<NaiveTime, String> {
    let raw = value.ok_or_else(|| format!("{field} is required when all_day is false"))?;
    NaiveTime::parse_from_str(raw, "%H:%M").map_err(|err| format!("invalid {field} '{raw}': {err}"))
}

fn sanitize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

fn count_past_events(events: &[Event], today: NaiveDate) -> usize {
    events
        .iter()
        .filter(|event| event.start_date < today)
        .count()
}

fn resolve_cutoff_date(before_date: Option<String>) -> Result<NaiveDate, String> {
    let Some(raw_date) = before_date else {
        return Ok(Local::now().date_naive());
    };
    parse_date(&raw_date, "before_date")
}

fn ensure_calendar_exists(
    calendars: &[crate::models::Calendar],
    calendar_id: Uuid,
) -> Result<(), String> {
    if calendars.iter().any(|calendar| calendar.id == calendar_id) {
        Ok(())
    } else {
        Err(format!("calendar '{calendar_id}' not found"))
    }
}

#[tauri::command]
pub fn count_events_by_title(
    title: String,
    calendar_id: String,
    exclude_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let calendar_uuid = parse_uuid(&calendar_id)?;
    let exclude_uuid = parse_uuid(&exclude_id)?;
    let normalized = title.trim().to_lowercase();

    let app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    let count = app_data
        .events
        .iter()
        .filter(|event| {
            event.id != exclude_uuid
                && event.calendar_id == calendar_uuid
                && event.title.trim().to_lowercase() == normalized
        })
        .count();

    Ok(count)
}

#[tauri::command]
pub fn bulk_update_descriptions(
    title: String,
    calendar_id: String,
    exclude_id: String,
    description_private: String,
    description_public: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let calendar_uuid = parse_uuid(&calendar_id)?;
    let exclude_uuid = parse_uuid(&exclude_id)?;
    let normalized = title.trim().to_lowercase();
    let now = Utc::now().to_rfc3339();
    let trimmed_private = description_private.trim().to_owned();
    let trimmed_public = description_public.trim().to_owned();

    let mut app_data = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;

    let mut count = 0usize;
    for event in &mut app_data.events {
        if event.id != exclude_uuid
            && event.calendar_id == calendar_uuid
            && event.title.trim().to_lowercase() == normalized
        {
            event.description_private = trimmed_private.clone();
            event.description_public = trimmed_public.clone();
            event.updated_at = now.clone();
            count += 1;
        }
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::recurrence::Frequency;

    fn sample_input(calendar_id: Uuid) -> EventInput {
        EventInput {
            calendar_id,
            title: "Planning".to_owned(),
            start_date: "2026-02-23".to_owned(),
            end_date: "2026-02-23".to_owned(),
            start_time: Some("09:00".to_owned()),
            end_time: Some("10:00".to_owned()),
            all_day: false,
            description_private: "private".to_owned(),
            description_public: "public".to_owned(),
            location: Some("Room A".to_owned()),
            recurrence: None,
            recurrence_parent_id: None,
        }
    }

    #[test]
    fn build_event_requires_title() {
        let mut input = sample_input(Uuid::new_v4());
        input.title = "   ".to_owned();

        let result = build_event(Uuid::new_v4(), &input, "c".to_owned(), "u".to_owned());

        assert_eq!(result.unwrap_err(), "event title is required");
    }

    #[test]
    fn build_event_clears_times_for_all_day_events() {
        let mut input = sample_input(Uuid::new_v4());
        input.all_day = true;

        let event = build_event(Uuid::new_v4(), &input, "c".to_owned(), "u".to_owned()).unwrap();

        assert!(event.start_time.is_none());
        assert!(event.end_time.is_none());
    }

    #[test]
    fn build_event_rejects_invalid_time_range_same_day() {
        let mut input = sample_input(Uuid::new_v4());
        input.start_time = Some("10:00".to_owned());
        input.end_time = Some("09:00".to_owned());

        let result = build_event(Uuid::new_v4(), &input, "c".to_owned(), "u".to_owned());

        assert_eq!(
            result.unwrap_err(),
            "end_time must be after start_time when start_date equals end_date"
        );
    }

    #[test]
    fn ensure_calendar_exists_checks_membership() {
        let calendar_id = Uuid::new_v4();
        let calendars = vec![crate::models::Calendar {
            id: calendar_id,
            name: "Personal".to_owned(),
            color: "#007aff".to_owned(),
            group: None,
            visible: true,
            created_at: "c".to_owned(),
            updated_at: "u".to_owned(),
        }];

        assert!(ensure_calendar_exists(&calendars, calendar_id).is_ok());
        assert!(ensure_calendar_exists(&calendars, Uuid::new_v4()).is_err());
    }

    #[test]
    fn count_past_events_filters_by_start_date() {
        let calendar_id = Uuid::new_v4();
        let today = NaiveDate::from_ymd_opt(2026, 2, 26).unwrap();

        let mut past = sample_input(calendar_id);
        past.start_date = "2026-02-20".to_owned();
        past.end_date = "2026-02-20".to_owned();

        let mut current_day = sample_input(calendar_id);
        current_day.start_date = "2026-02-26".to_owned();
        current_day.end_date = "2026-02-26".to_owned();

        let mut spanning = sample_input(calendar_id);
        spanning.start_date = "2026-02-24".to_owned();
        spanning.end_date = "2026-02-27".to_owned();

        let events = vec![
            build_event(Uuid::new_v4(), &past, "c".to_owned(), "u".to_owned()).unwrap(),
            build_event(Uuid::new_v4(), &current_day, "c".to_owned(), "u".to_owned()).unwrap(),
            build_event(Uuid::new_v4(), &spanning, "c".to_owned(), "u".to_owned()).unwrap(),
        ];

        assert_eq!(count_past_events(&events, today), 2);
    }

    #[test]
    fn resolve_cutoff_date_uses_payload_date() {
        let resolved =
            resolve_cutoff_date(Some("2026-03-01".to_owned())).expect("payload date should parse");
        assert_eq!(resolved, NaiveDate::from_ymd_opt(2026, 3, 1).unwrap());
    }

    #[test]
    fn event_input_with_recurrence_deserializes() {
        let json = r#"{
            "calendarId": "00000000-0000-0000-0000-000000000001",
            "title": "Weekly sync",
            "startDate": "2026-03-01",
            "endDate": "2026-03-01",
            "startTime": "09:00",
            "endTime": "10:00",
            "allDay": false,
            "descriptionPrivate": "",
            "descriptionPublic": "",
            "location": null,
            "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "daysOfWeek": ["mon", "wed"],
                "endConditionType": "after_count",
                "endConditionCount": 5,
                "endConditionUntilDate": null,
                "exceptionDates": ["2026-03-08"],
                "weekOfMonth": null,
                "dayOfWeek": null
            },
            "recurrenceParentId": null
        }"#;

        let input: EventInput = serde_json::from_str(json).unwrap();
        assert!(input.recurrence.is_some());
        let rec = input.recurrence.unwrap();
        assert_eq!(rec.interval, 1);
        assert_eq!(rec.days_of_week, vec!["mon", "wed"]);
        assert_eq!(rec.end_condition_type, "after_count");
        assert_eq!(rec.end_condition_count, Some(5));
        assert_eq!(rec.exception_dates, vec!["2026-03-08"]);
    }

    #[test]
    fn build_event_roundtrip_preserves_recurrence_via_dto() {
        let calendar_id = Uuid::new_v4();
        let parent_id = Uuid::new_v4();
        let mut input = sample_input(calendar_id);
        input.recurrence = Some(RecurrenceRuleInput {
            frequency: Frequency::Monthly,
            interval: 2,
            days_of_week: vec![],
            end_condition_type: "until_date".to_owned(),
            end_condition_count: None,
            end_condition_until_date: Some("2026-12-31".to_owned()),
            exception_dates: vec!["2026-04-01".to_owned()],
            week_of_month: Some(3),
            day_of_week: Some("tue".to_owned()),
        });
        input.recurrence_parent_id = Some(parent_id);

        let event = build_event(Uuid::new_v4(), &input, "c".to_owned(), "u".to_owned()).unwrap();
        let dto = EventDto::from(&event);

        let rec = dto.recurrence.unwrap();
        assert_eq!(rec.frequency, Frequency::Monthly);
        assert_eq!(rec.interval, 2);
        assert_eq!(rec.week_of_month, Some(3));
        assert_eq!(rec.day_of_week.as_deref(), Some("tue"));
        assert_eq!(rec.exception_dates.len(), 1);
        assert_eq!(dto.recurrence_parent_id, Some(parent_id));
    }

    #[test]
    fn delete_events_removes_multiple_by_id() {
        let calendar_id = Uuid::new_v4();
        let id_a = Uuid::new_v4();
        let id_b = Uuid::new_v4();
        let id_c = Uuid::new_v4();

        let events = vec![
            build_event(
                id_a,
                &sample_input(calendar_id),
                "c".to_owned(),
                "u".to_owned(),
            )
            .unwrap(),
            build_event(
                id_b,
                &sample_input(calendar_id),
                "c".to_owned(),
                "u".to_owned(),
            )
            .unwrap(),
            build_event(
                id_c,
                &sample_input(calendar_id),
                "c".to_owned(),
                "u".to_owned(),
            )
            .unwrap(),
        ];

        let target_ids: std::collections::HashSet<Uuid> = [id_a, id_c].into_iter().collect();
        let remaining: Vec<_> = events
            .into_iter()
            .filter(|event| !target_ids.contains(&event.id))
            .collect();

        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, id_b);
    }
}
