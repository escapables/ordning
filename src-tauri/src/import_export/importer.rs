use std::collections::HashMap;

use chrono::{DateTime, Days, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{AppData, AppSettings, Calendar, Event, ExportData};

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportStrategy {
    Merge,
    Replace,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub calendar_count: usize,
    pub event_count: usize,
    pub new_events: usize,
    pub updated_events: usize,
    pub conflict_events: usize,
}

pub fn parse_import_payload(raw: &str) -> Result<AppData, String> {
    let parsed = serde_json::from_str::<ExportData>(raw)
        .map_err(|err| format!("invalid import JSON: {err}"))?;
    parse_export_data(parsed)
}

pub fn parse_export_data(parsed: ExportData) -> Result<AppData, String> {
    if parsed.ordning_version != 1 {
        return Err(format!(
            "unsupported ordning_version '{}'",
            parsed.ordning_version
        ));
    }

    let mut calendars = Vec::with_capacity(parsed.calendars.len());
    for calendar in &parsed.calendars {
        calendars.push(Calendar {
            id: calendar.id,
            name: calendar.name.trim().to_owned(),
            color: calendar.color.clone(),
            group: calendar.group.clone(),
            visible: true,
            created_at: calendar
                .created_at
                .clone()
                .unwrap_or_else(|| parsed.exported_at.clone()),
            updated_at: calendar
                .updated_at
                .clone()
                .unwrap_or_else(|| parsed.exported_at.clone()),
        });
    }

    let mut events = Vec::with_capacity(parsed.events.len());
    for event in &parsed.events {
        let start_date = NaiveDate::parse_from_str(&event.start_date, "%Y-%m-%d")
            .map_err(|err| format!("invalid start_date '{}': {err}", event.start_date))?;
        let end_date = NaiveDate::parse_from_str(&event.end_date, "%Y-%m-%d")
            .map_err(|err| format!("invalid end_date '{}': {err}", event.end_date))?;
        let start_time = parse_time(event.start_time.as_deref(), "start_time")?;
        let end_time = parse_time(event.end_time.as_deref(), "end_time")?;

        let (start_date, end_date, start_time, end_time) =
            normalize_timed_range(start_date, end_date, start_time, end_time, event.all_day)?;

        events.push(Event {
            id: event.id,
            calendar_id: event.calendar_id,
            title: event.title.trim().to_owned(),
            start_date,
            end_date,
            start_time,
            end_time,
            all_day: event.all_day,
            description_private: event.description_private.clone().unwrap_or_default(),
            description_public: event.description_public.clone(),
            location: sanitize_optional(event.location.clone()),
            recurrence: event.recurrence.clone(),
            recurrence_parent_id: event.recurrence_parent_id,
            created_at: event
                .created_at
                .clone()
                .unwrap_or_else(|| parsed.exported_at.clone()),
            updated_at: event
                .updated_at
                .clone()
                .unwrap_or_else(|| parsed.exported_at.clone()),
        });
    }

    Ok(AppData {
        version: 1,
        settings: AppSettings::default(),
        lang: "sv".to_owned(),
        calendars,
        events,
    })
}

pub fn summarize_import(
    existing: &AppData,
    incoming: &AppData,
    strategy: ImportStrategy,
) -> ImportSummary {
    match strategy {
        ImportStrategy::Replace => ImportSummary {
            calendar_count: incoming.calendars.len(),
            event_count: incoming.events.len(),
            new_events: incoming.events.len(),
            updated_events: 0,
            conflict_events: 0,
        },
        ImportStrategy::Merge => summarize_merge(existing, incoming),
    }
}

pub fn apply_import(
    existing: &AppData,
    incoming: &AppData,
    strategy: ImportStrategy,
) -> (AppData, ImportSummary) {
    let summary = summarize_import(existing, incoming, strategy);
    let merged = match strategy {
        ImportStrategy::Replace => replace_data(existing, incoming),
        ImportStrategy::Merge => merge_data(existing, incoming),
    };
    (merged, summary)
}

fn summarize_merge(existing: &AppData, incoming: &AppData) -> ImportSummary {
    let existing_events = existing
        .events
        .iter()
        .map(|event| (event.id, event.updated_at.as_str()))
        .collect::<HashMap<_, _>>();

    let mut new_events = 0;
    let mut updated_events = 0;
    let mut conflict_events = 0;

    for event in &incoming.events {
        match existing_events.get(&event.id) {
            None => new_events += 1,
            Some(existing_updated_at) => {
                if is_newer(&event.updated_at, existing_updated_at) {
                    updated_events += 1;
                } else {
                    conflict_events += 1;
                }
            }
        }
    }

    ImportSummary {
        calendar_count: incoming.calendars.len(),
        event_count: incoming.events.len(),
        new_events,
        updated_events,
        conflict_events,
    }
}

fn merge_data(existing: &AppData, incoming: &AppData) -> AppData {
    let mut calendar_map = existing
        .calendars
        .iter()
        .cloned()
        .map(|calendar| (calendar.id, calendar))
        .collect::<HashMap<_, _>>();
    for calendar in &incoming.calendars {
        calendar_map.insert(calendar.id, calendar.clone());
    }

    let mut event_map = existing
        .events
        .iter()
        .cloned()
        .map(|event| (event.id, event))
        .collect::<HashMap<_, _>>();
    for event in &incoming.events {
        match event_map.get(&event.id) {
            None => {
                event_map.insert(event.id, event.clone());
            }
            Some(current) => {
                if is_newer(&event.updated_at, &current.updated_at) {
                    event_map.insert(event.id, event.clone());
                }
            }
        }
    }

    let mut merged = AppData {
        version: existing.version,
        settings: existing.settings.clone(),
        lang: existing.lang.clone(),
        calendars: calendar_map.into_values().collect(),
        events: event_map.into_values().collect(),
    };
    ensure_minimum_calendar(&mut merged);
    merged
}

fn replace_data(existing: &AppData, incoming: &AppData) -> AppData {
    let mut replaced = AppData {
        version: existing.version,
        settings: existing.settings.clone(),
        lang: existing.lang.clone(),
        calendars: incoming.calendars.clone(),
        events: incoming.events.clone(),
    };
    ensure_minimum_calendar(&mut replaced);
    replaced
}

fn ensure_minimum_calendar(app_data: &mut AppData) {
    if !app_data.calendars.is_empty() {
        return;
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
}

fn parse_time(value: Option<&str>, field: &str) -> Result<Option<NaiveTime>, String> {
    match value {
        None => Ok(None),
        Some(raw) => NaiveTime::parse_from_str(raw, "%H:%M")
            .map(Some)
            .map_err(|err| format!("invalid {field} '{raw}': {err}")),
    }
}

fn normalize_timed_range(
    start_date: NaiveDate,
    end_date: NaiveDate,
    start_time: Option<NaiveTime>,
    end_time: Option<NaiveTime>,
    all_day: bool,
) -> Result<(NaiveDate, NaiveDate, Option<NaiveTime>, Option<NaiveTime>), String> {
    if all_day {
        return Ok((start_date, end_date, None, None));
    }

    let (Some(start_time), Some(end_time)) = (start_time, end_time) else {
        return Ok((start_date, end_date, start_time, end_time));
    };

    if end_date < start_date {
        return Err("end_date must be on or after start_date".to_owned());
    }

    if end_date == start_date && end_time <= start_time {
        let next_date = start_date
            .checked_add_days(Days::new(1))
            .ok_or_else(|| "failed to normalize wrapped event end_date".to_owned())?;
        return Ok((start_date, next_date, Some(start_time), Some(end_time)));
    }

    Ok((start_date, end_date, Some(start_time), Some(end_time)))
}

fn sanitize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

fn is_newer(incoming: &str, existing: &str) -> bool {
    let incoming_time = DateTime::parse_from_rfc3339(incoming).ok();
    let existing_time = DateTime::parse_from_rfc3339(existing).ok();
    match (incoming_time, existing_time) {
        (Some(incoming_time), Some(existing_time)) => incoming_time > existing_time,
        _ => incoming > existing,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveTime};

    use super::*;
    use crate::models::{Calendar, Event};

    fn calendar(id: Uuid) -> Calendar {
        Calendar {
            id,
            name: "Personal".to_owned(),
            color: "#007aff".to_owned(),
            group: None,
            visible: true,
            created_at: "2026-02-24T00:00:00Z".to_owned(),
            updated_at: "2026-02-24T00:00:00Z".to_owned(),
        }
    }

    fn event(id: Uuid, calendar_id: Uuid, updated_at: &str) -> Event {
        Event {
            id,
            calendar_id,
            title: "Event".to_owned(),
            start_date: NaiveDate::from_ymd_opt(2026, 2, 24).expect("valid"),
            end_date: NaiveDate::from_ymd_opt(2026, 2, 24).expect("valid"),
            start_time: None,
            end_time: None,
            all_day: true,
            description_private: String::new(),
            description_public: String::new(),
            location: None,
            recurrence: None,
            recurrence_parent_id: None,
            created_at: "2026-02-24T00:00:00Z".to_owned(),
            updated_at: updated_at.to_owned(),
        }
    }

    #[test]
    fn summarize_merge_counts_conflicts_for_older_events() {
        let calendar_id = Uuid::new_v4();
        let event_id = Uuid::new_v4();
        let existing = AppData {
            calendars: vec![calendar(calendar_id)],
            events: vec![event(event_id, calendar_id, "2026-02-24T12:00:00Z")],
            ..AppData::default()
        };
        let incoming = AppData {
            calendars: vec![calendar(calendar_id)],
            events: vec![event(event_id, calendar_id, "2026-02-24T11:59:00Z")],
            ..AppData::default()
        };

        let summary = summarize_import(&existing, &incoming, ImportStrategy::Merge);
        assert_eq!(summary.new_events, 0);
        assert_eq!(summary.updated_events, 0);
        assert_eq!(summary.conflict_events, 1);
    }

    #[test]
    fn apply_import_merge_updates_when_incoming_is_newer() {
        let calendar_id = Uuid::new_v4();
        let event_id = Uuid::new_v4();
        let existing = AppData {
            calendars: vec![calendar(calendar_id)],
            events: vec![event(event_id, calendar_id, "2026-02-24T12:00:00Z")],
            ..AppData::default()
        };
        let mut newer_event = event(event_id, calendar_id, "2026-02-24T12:01:00Z");
        newer_event.title = "New".to_owned();
        let incoming = AppData {
            calendars: vec![calendar(calendar_id)],
            events: vec![newer_event],
            ..AppData::default()
        };

        let (merged, summary) = apply_import(&existing, &incoming, ImportStrategy::Merge);
        assert_eq!(summary.updated_events, 1);
        assert_eq!(merged.events.len(), 1);
        assert_eq!(merged.events[0].title, "New");
    }

    #[test]
    fn parse_import_payload_normalizes_legacy_wrapped_event_to_next_day_end_date() {
        let calendar_id = Uuid::new_v4();
        let event_id = Uuid::new_v4();
        let raw = format!(
            r##"{{
  "ordning_version": 1,
  "exported_at": "2026-02-27T12:00:00Z",
  "export_mode": "full",
  "calendars": [
    {{
      "id": "{calendar_id}",
      "name": "Work",
      "color": "#4a90d9"
    }}
  ],
  "events": [
    {{
      "id": "{event_id}",
      "calendar_id": "{calendar_id}",
      "title": "Night Deploy",
      "start_date": "2026-02-24",
      "start_time": "23:00",
      "end_date": "2026-02-24",
      "end_time": "01:30",
      "all_day": false,
      "description_public": "deploy",
      "description_private": "ops"
    }}
  ]
}}"##
        );

        let parsed = parse_import_payload(&raw).expect("import payload should parse");
        assert_eq!(parsed.events.len(), 1);

        let event = &parsed.events[0];
        assert_eq!(
            event.end_date,
            NaiveDate::from_ymd_opt(2026, 2, 25).expect("valid date")
        );
        assert_eq!(
            event.start_time,
            Some(NaiveTime::from_hms_opt(23, 0, 0).expect("valid time"))
        );
        assert_eq!(
            event.end_time,
            Some(NaiveTime::from_hms_opt(1, 30, 0).expect("valid time"))
        );
    }
}
