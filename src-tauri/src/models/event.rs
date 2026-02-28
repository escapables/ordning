use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::RecurrenceRule;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Event {
    pub id: Uuid,
    pub calendar_id: Uuid,
    pub title: String,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub start_time: Option<NaiveTime>,
    pub end_time: Option<NaiveTime>,
    pub all_day: bool,
    pub description_private: String,
    pub description_public: String,
    pub location: Option<String>,
    pub recurrence: Option<RecurrenceRule>,
    pub recurrence_parent_id: Option<Uuid>,
    pub created_at: String,
    pub updated_at: String,
}
