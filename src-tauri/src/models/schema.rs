use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{Calendar, Event, RecurrenceRule};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportMode {
    Full,
    Public,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportData {
    pub ordning_version: u8,
    pub exported_at: String,
    pub export_mode: ExportMode,
    pub calendars: Vec<ExportCalendar>,
    pub events: Vec<ExportEvent>,
}

impl ExportData {
    pub fn new(
        export_mode: ExportMode,
        calendars: Vec<ExportCalendar>,
        events: Vec<ExportEvent>,
    ) -> Self {
        Self {
            ordning_version: 1,
            exported_at: Utc::now().to_rfc3339(),
            export_mode,
            calendars,
            events,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportCalendar {
    pub id: Uuid,
    pub name: String,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<&Calendar> for ExportCalendar {
    fn from(calendar: &Calendar) -> Self {
        Self {
            id: calendar.id,
            name: calendar.name.clone(),
            color: calendar.color.clone(),
            group: calendar.group.clone(),
            created_at: Some(calendar.created_at.clone()),
            updated_at: Some(calendar.updated_at.clone()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportEvent {
    pub id: Uuid,
    pub calendar_id: Uuid,
    pub title: String,
    pub start_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    pub end_date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    pub all_day: bool,
    pub description_public: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_private: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence: Option<RecurrenceRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_parent_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl ExportEvent {
    pub fn from_event(event: &Event, mode: ExportMode) -> Self {
        let description_private = match mode {
            ExportMode::Full => Some(event.description_private.clone()),
            ExportMode::Public => None,
        };

        Self {
            id: event.id,
            calendar_id: event.calendar_id,
            title: event.title.clone(),
            start_date: event.start_date.format("%Y-%m-%d").to_string(),
            start_time: event
                .start_time
                .map(|time| time.format("%H:%M").to_string()),
            end_date: event.end_date.format("%Y-%m-%d").to_string(),
            end_time: event.end_time.map(|time| time.format("%H:%M").to_string()),
            all_day: event.all_day,
            description_public: event.description_public.clone(),
            description_private,
            location: event.location.clone(),
            recurrence: event.recurrence.clone(),
            recurrence_parent_id: event.recurrence_parent_id,
            created_at: Some(event.created_at.clone()),
            updated_at: Some(event.updated_at.clone()),
        }
    }
}
