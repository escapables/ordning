use serde::{Deserialize, Serialize};

use super::{Calendar, Event};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppData {
    pub version: u32,
    #[serde(default = "default_lang")]
    pub lang: String,
    #[serde(default)]
    pub calendars: Vec<Calendar>,
    #[serde(default)]
    pub events: Vec<Event>,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            version: 1,
            lang: default_lang(),
            calendars: Vec::new(),
            events: Vec::new(),
        }
    }
}

fn default_lang() -> String {
    "sv".to_owned()
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveTime};
    use uuid::Uuid;

    use super::*;
    use crate::models::event::Event;
    use crate::models::recurrence::{EndCondition, Frequency, RecurrenceRule};

    #[test]
    fn app_data_serialization_round_trip_preserves_values() {
        let calendar_id = Uuid::new_v4();
        let event_id = Uuid::new_v4();

        let app_data = AppData {
            version: 1,
            lang: "en".to_owned(),
            calendars: vec![Calendar {
                id: calendar_id,
                name: "Personal".to_owned(),
                color: "#007aff".to_owned(),
                group: Some("Default".to_owned()),
                visible: true,
                created_at: "2026-02-23T00:00:00Z".to_owned(),
                updated_at: "2026-02-23T00:00:00Z".to_owned(),
            }],
            events: vec![Event {
                id: event_id,
                calendar_id,
                title: "Planning".to_owned(),
                start_date: NaiveDate::from_ymd_opt(2026, 2, 23).unwrap(),
                end_date: NaiveDate::from_ymd_opt(2026, 2, 23).unwrap(),
                start_time: Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
                end_time: Some(NaiveTime::from_hms_opt(9, 30, 0).unwrap()),
                all_day: false,
                description_private: "private".to_owned(),
                description_public: "public".to_owned(),
                location: Some("Room A".to_owned()),
                recurrence: Some(RecurrenceRule {
                    frequency: Frequency::Weekly,
                    interval: 1,
                    days_of_week: vec!["mon".to_owned()],
                    end_condition: EndCondition::Never,
                }),
                created_at: "2026-02-23T00:00:00Z".to_owned(),
                updated_at: "2026-02-23T00:00:00Z".to_owned(),
            }],
        };

        let json = serde_json::to_string(&app_data).unwrap();
        let round_trip: AppData = serde_json::from_str(&json).unwrap();

        assert_eq!(round_trip, app_data);
    }
}
