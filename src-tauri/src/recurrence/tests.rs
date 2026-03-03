use chrono::NaiveTime;

use super::*;

fn sample_event(id: Uuid, start_date: NaiveDate, title: &str) -> Event {
    Event {
        id,
        calendar_id: Uuid::new_v4(),
        title: title.to_owned(),
        start_date,
        end_date: start_date,
        start_time: Some(NaiveTime::from_hms_opt(9, 0, 0).unwrap()),
        end_time: Some(NaiveTime::from_hms_opt(10, 0, 0).unwrap()),
        all_day: false,
        description_private: "private".to_owned(),
        description_public: "public".to_owned(),
        location: Some("Room 1".to_owned()),
        recurrence: None,
        recurrence_parent_id: None,
        created_at: "2026-01-01T00:00:00Z".to_owned(),
        updated_at: "2026-01-01T00:00:00Z".to_owned(),
    }
}

fn sample_weekly_rule(end_condition: EndCondition) -> RecurrenceRule {
    RecurrenceRule {
        frequency: Frequency::Weekly,
        interval: 1,
        days_of_week: vec!["mon".to_owned(), "wed".to_owned()],
        end_condition,
        exception_dates: vec![],
        week_of_month: None,
        day_of_week: None,
    }
}

#[test]
fn expand_recurring_events_expands_weekly_instances_in_range() {
    let start_date = NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
    let mut recurring = sample_event(Uuid::new_v4(), start_date, "Standup");
    recurring.recurrence = Some(sample_weekly_rule(EndCondition::Never));

    let expanded = expand_recurring_events(
        &[recurring],
        NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 3, 8).unwrap(),
    );

    assert_eq!(expanded.len(), 2);
    assert_eq!(
        expanded[0].start_date,
        NaiveDate::from_ymd_opt(2026, 3, 2).unwrap()
    );
    assert_eq!(
        expanded[1].start_date,
        NaiveDate::from_ymd_opt(2026, 3, 4).unwrap()
    );
}

#[test]
fn expand_recurring_events_expands_monthly_nth_weekday_instances() {
    let start_date = NaiveDate::from_ymd_opt(2026, 1, 13).unwrap();
    let mut recurring = sample_event(Uuid::new_v4(), start_date, "Review");
    recurring.recurrence = Some(RecurrenceRule {
        frequency: Frequency::Monthly,
        interval: 1,
        days_of_week: vec![],
        end_condition: EndCondition::Never,
        exception_dates: vec![],
        week_of_month: Some(2),
        day_of_week: Some("tue".to_owned()),
    });

    let expanded = expand_recurring_events(
        &[recurring],
        NaiveDate::from_ymd_opt(2026, 2, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 4, 30).unwrap(),
    );
    let dates = expanded
        .iter()
        .map(|event| event.start_date)
        .collect::<Vec<_>>();

    assert_eq!(
        dates,
        vec![
            NaiveDate::from_ymd_opt(2026, 2, 10).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 10).unwrap(),
            NaiveDate::from_ymd_opt(2026, 4, 14).unwrap(),
        ]
    );
}

#[test]
fn expand_recurring_events_skips_exception_dates() {
    let start_date = NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
    let mut recurring = sample_event(Uuid::new_v4(), start_date, "Standup");
    let mut rule = sample_weekly_rule(EndCondition::Never);
    rule.exception_dates = vec![NaiveDate::from_ymd_opt(2026, 3, 4).unwrap()];
    recurring.recurrence = Some(rule);

    let expanded = expand_recurring_events(
        &[recurring],
        NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 3, 8).unwrap(),
    );

    assert_eq!(expanded.len(), 1);
    assert_eq!(
        expanded[0].start_date,
        NaiveDate::from_ymd_opt(2026, 3, 2).unwrap()
    );
}

#[test]
fn expand_recurring_events_honors_after_count_cap() {
    let start_date = NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
    let mut recurring = sample_event(Uuid::new_v4(), start_date, "Standup");
    recurring.recurrence = Some(sample_weekly_rule(EndCondition::AfterCount { count: 3 }));

    let expanded = expand_recurring_events(
        &[recurring],
        NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 3, 31).unwrap(),
    );
    let dates = expanded
        .iter()
        .map(|event| event.start_date)
        .collect::<Vec<_>>();

    assert_eq!(
        dates,
        vec![
            NaiveDate::from_ymd_opt(2026, 3, 2).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 4).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 9).unwrap(),
        ]
    );
}

#[test]
fn expand_recurring_events_honors_until_date_cap() {
    let start_date = NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
    let mut recurring = sample_event(Uuid::new_v4(), start_date, "Standup");
    recurring.recurrence = Some(sample_weekly_rule(EndCondition::UntilDate {
        until_date: NaiveDate::from_ymd_opt(2026, 3, 9).unwrap(),
    }));

    let expanded = expand_recurring_events(
        &[recurring],
        NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 3, 31).unwrap(),
    );
    let dates = expanded
        .iter()
        .map(|event| event.start_date)
        .collect::<Vec<_>>();

    assert_eq!(
        dates,
        vec![
            NaiveDate::from_ymd_opt(2026, 3, 2).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 4).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 9).unwrap(),
        ]
    );
}

#[test]
fn expand_recurring_events_replaces_virtual_instances_with_overrides() {
    let start_date = NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
    let parent_id = Uuid::new_v4();
    let mut recurring = sample_event(parent_id, start_date, "Standup");
    let mut rule = sample_weekly_rule(EndCondition::Never);
    rule.exception_dates = vec![NaiveDate::from_ymd_opt(2026, 3, 4).unwrap()];
    recurring.recurrence = Some(rule);

    let mut override_event = sample_event(
        Uuid::new_v4(),
        NaiveDate::from_ymd_opt(2026, 3, 4).unwrap(),
        "Client Standup",
    );
    override_event.recurrence_parent_id = Some(parent_id);

    let expanded_instances = expand_recurring_event_instances(
        &[recurring, override_event.clone()],
        NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
        NaiveDate::from_ymd_opt(2026, 3, 8).unwrap(),
    );

    assert_eq!(expanded_instances.len(), 2);
    assert_eq!(
        expanded_instances[0].display_id,
        format!("{parent_id}_2026-03-02")
    );
    assert_eq!(
        expanded_instances[1].display_id,
        override_event.id.to_string()
    );
    assert_eq!(expanded_instances[1].event.title, "Client Standup");
}
