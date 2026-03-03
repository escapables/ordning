use std::collections::HashMap;

use chrono::{NaiveDate, NaiveTime};
use uuid::Uuid;

use crate::models::recurrence::{EndCondition, Frequency, RecurrenceRule};
use crate::models::{Calendar, Event};

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

    let result = build_week_events_response(
        &[timed_event.clone(), all_day_event.clone()],
        &visible,
        date,
        date,
    );

    assert_eq!(result.timed.len(), 1);
    assert_eq!(result.all_day.len(), 1);
    assert_eq!(result.timed[0].source_id, timed_event.id);
    assert!(!result.timed[0].is_virtual);
    assert_eq!(result.timed[0].title, "Timed");
    assert_eq!(result.timed[0].start_date, "2026-02-24");
    assert_eq!(result.timed[0].end_date, "2026-02-24");
    assert_eq!(result.all_day[0].source_id, all_day_event.id);
    assert!(!result.all_day[0].is_virtual);
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
fn build_week_events_response_expands_recurring_events() {
    let calendar_id = Uuid::new_v4();
    let date = NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
    let range_end = NaiveDate::from_ymd_opt(2026, 3, 4).unwrap();
    let mut event = sample_event(
        Uuid::new_v4(),
        calendar_id,
        date,
        date,
        None,
        None,
        true,
        "Series",
    );
    event.recurrence = Some(RecurrenceRule {
        frequency: Frequency::Weekly,
        interval: 1,
        days_of_week: vec!["mon".to_owned(), "wed".to_owned()],
        end_condition: EndCondition::Never,
        exception_dates: vec![],
        week_of_month: None,
        day_of_week: None,
    });

    let result = build_week_events_response(
        &[event.clone()],
        &HashMap::from([(calendar_id, "#007aff".to_owned())]),
        date,
        range_end,
    );

    assert_eq!(result.all_day.len(), 2);
    assert_eq!(result.all_day[0].id, format!("{}_2026-03-02", event.id));
    assert_eq!(result.all_day[1].id, format!("{}_2026-03-04", event.id));
    assert!(result.all_day[0].is_virtual);
    assert_eq!(result.all_day[0].source_id, event.id);
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
