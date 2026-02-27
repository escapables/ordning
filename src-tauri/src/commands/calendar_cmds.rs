use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::models::{AppData, Calendar};
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
    let calendar_name = sanitize_name(&name)?;
    let calendar = Calendar {
        id: Uuid::new_v4(),
        name: calendar_name,
        color: sanitize_color(color),
        group: sanitize_optional(group),
        visible: true,
        created_at: now.clone(),
        updated_at: now,
    };

    {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        app_data.calendars.push(calendar.clone());
    }

    Ok(calendar)
}

#[tauri::command]
pub fn update_calendar(
    id: String,
    name: String,
    color: Option<String>,
    group: Option<String>,
    state: State<'_, AppState>,
) -> Result<Calendar, String> {
    let calendar_id = parse_uuid(&id)?;
    let updated_at = Utc::now().to_rfc3339();
    let calendar_name = sanitize_name(&name)?;
    let calendar_color = sanitize_color(color);
    let calendar_group = sanitize_optional(group);

    let updated = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        update_calendar_in_data(
            &mut app_data,
            calendar_id,
            calendar_name,
            calendar_color,
            calendar_group,
            updated_at,
        )?
    };

    Ok(updated)
}

#[tauri::command]
pub fn toggle_visibility(id: String, state: State<'_, AppState>) -> Result<Calendar, String> {
    let calendar_id = parse_uuid(&id)?;
    let updated_at = Utc::now().to_rfc3339();

    let toggled = {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        toggle_visibility_in_data(&mut app_data, calendar_id, updated_at)?
    };

    Ok(toggled)
}

#[tauri::command]
pub fn delete_calendar(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let calendar_id = parse_uuid(&id)?;

    {
        let mut app_data = state
            .data
            .lock()
            .map_err(|err| format!("failed to lock app state: {err}"))?;
        delete_calendar_in_data(&mut app_data, calendar_id)?;
    }

    Ok(())
}

fn update_calendar_in_data(
    app_data: &mut AppData,
    calendar_id: Uuid,
    name: String,
    color: String,
    group: Option<String>,
    updated_at: String,
) -> Result<Calendar, String> {
    let calendar = app_data
        .calendars
        .iter_mut()
        .find(|calendar| calendar.id == calendar_id)
        .ok_or_else(|| format!("calendar '{calendar_id}' not found"))?;

    calendar.name = name;
    calendar.color = color;
    calendar.group = group;
    calendar.updated_at = updated_at;
    Ok(calendar.clone())
}

fn toggle_visibility_in_data(
    app_data: &mut AppData,
    calendar_id: Uuid,
    updated_at: String,
) -> Result<Calendar, String> {
    let visible_count = app_data
        .calendars
        .iter()
        .filter(|calendar| calendar.visible)
        .count();
    let calendar = app_data
        .calendars
        .iter_mut()
        .find(|calendar| calendar.id == calendar_id)
        .ok_or_else(|| format!("calendar '{calendar_id}' not found"))?;

    if calendar.visible && visible_count <= 1 {
        return Err("at least one calendar must remain visible".to_owned());
    }

    calendar.visible = !calendar.visible;
    calendar.updated_at = updated_at;
    Ok(calendar.clone())
}

fn delete_calendar_in_data(app_data: &mut AppData, calendar_id: Uuid) -> Result<(), String> {
    let before = app_data.calendars.len();
    app_data
        .calendars
        .retain(|calendar| calendar.id != calendar_id);
    if app_data.calendars.len() == before {
        return Err(format!("calendar '{calendar_id}' not found"));
    }

    app_data
        .events
        .retain(|event| event.calendar_id != calendar_id);
    Ok(())
}

fn sanitize_name(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err("calendar name is required".to_owned())
    } else {
        Ok(trimmed.to_owned())
    }
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

fn sanitize_color(value: Option<String>) -> String {
    sanitize_optional(value).unwrap_or_else(|| "#007aff".to_owned())
}

fn parse_uuid(value: &str) -> Result<Uuid, String> {
    Uuid::parse_str(value).map_err(|err| format!("invalid id '{value}': {err}"))
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveTime};

    use super::*;
    use crate::models::Event;

    fn sample_calendar(id: Uuid, visible: bool) -> Calendar {
        Calendar {
            id,
            name: "Calendar".to_owned(),
            color: "#007aff".to_owned(),
            group: None,
            visible,
            created_at: "2026-02-24T00:00:00Z".to_owned(),
            updated_at: "2026-02-24T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn toggle_visibility_rejects_hiding_last_visible_calendar() {
        let id = Uuid::new_v4();
        let mut app_data = AppData {
            calendars: vec![sample_calendar(id, true)],
            ..AppData::default()
        };

        let result =
            toggle_visibility_in_data(&mut app_data, id, "2026-02-24T00:00:01Z".to_owned());

        assert!(result.is_err());
        assert!(app_data.calendars[0].visible);
    }

    #[test]
    fn delete_calendar_cascades_events() {
        let delete_id = Uuid::new_v4();
        let keep_id = Uuid::new_v4();

        let mut app_data = AppData {
            calendars: vec![
                sample_calendar(delete_id, true),
                sample_calendar(keep_id, true),
            ],
            events: vec![
                Event {
                    id: Uuid::new_v4(),
                    calendar_id: delete_id,
                    title: "Delete me".to_owned(),
                    start_date: NaiveDate::from_ymd_opt(2026, 2, 24).unwrap(),
                    end_date: NaiveDate::from_ymd_opt(2026, 2, 24).unwrap(),
                    start_time: Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
                    end_time: Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap()),
                    all_day: false,
                    description_private: String::new(),
                    description_public: String::new(),
                    location: None,
                    recurrence: None,
                    created_at: "2026-02-24T00:00:00Z".to_owned(),
                    updated_at: "2026-02-24T00:00:00Z".to_owned(),
                },
                Event {
                    id: Uuid::new_v4(),
                    calendar_id: keep_id,
                    title: "Keep me".to_owned(),
                    start_date: NaiveDate::from_ymd_opt(2026, 2, 24).unwrap(),
                    end_date: NaiveDate::from_ymd_opt(2026, 2, 24).unwrap(),
                    start_time: Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
                    end_time: Some(NaiveTime::from_hms_opt(10, 30, 0).unwrap()),
                    all_day: false,
                    description_private: String::new(),
                    description_public: String::new(),
                    location: None,
                    recurrence: None,
                    created_at: "2026-02-24T00:00:00Z".to_owned(),
                    updated_at: "2026-02-24T00:00:00Z".to_owned(),
                },
            ],
            ..AppData::default()
        };

        let result = delete_calendar_in_data(&mut app_data, delete_id);

        assert!(result.is_ok());
        assert_eq!(app_data.calendars.len(), 1);
        assert_eq!(app_data.events.len(), 1);
        assert_eq!(app_data.events[0].calendar_id, keep_id);
    }

    #[test]
    fn delete_last_calendar_is_allowed_and_cascades_events() {
        let delete_id = Uuid::new_v4();

        let mut app_data = AppData {
            calendars: vec![sample_calendar(delete_id, true)],
            events: vec![Event {
                id: Uuid::new_v4(),
                calendar_id: delete_id,
                title: "Delete me".to_owned(),
                start_date: NaiveDate::from_ymd_opt(2026, 2, 24).unwrap(),
                end_date: NaiveDate::from_ymd_opt(2026, 2, 24).unwrap(),
                start_time: Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
                end_time: Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap()),
                all_day: false,
                description_private: String::new(),
                description_public: String::new(),
                location: None,
                recurrence: None,
                created_at: "2026-02-24T00:00:00Z".to_owned(),
                updated_at: "2026-02-24T00:00:00Z".to_owned(),
            }],
            ..AppData::default()
        };

        let result = delete_calendar_in_data(&mut app_data, delete_id);

        assert!(result.is_ok());
        assert!(app_data.calendars.is_empty());
        assert!(app_data.events.is_empty());
    }

    #[test]
    fn update_calendar_changes_properties() {
        let id = Uuid::new_v4();
        let mut app_data = AppData {
            calendars: vec![sample_calendar(id, true)],
            ..AppData::default()
        };

        let updated = update_calendar_in_data(
            &mut app_data,
            id,
            "Work".to_owned(),
            "#34c759".to_owned(),
            Some("Professional".to_owned()),
            "2026-02-24T00:00:02Z".to_owned(),
        )
        .unwrap();

        assert_eq!(updated.name, "Work");
        assert_eq!(updated.color, "#34c759");
        assert_eq!(updated.group.as_deref(), Some("Professional"));
        assert_eq!(updated.updated_at, "2026-02-24T00:00:02Z");
    }
}
