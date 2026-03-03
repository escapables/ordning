use std::collections::{HashMap, HashSet};

use chrono::{Datelike, Duration, NaiveDate, Weekday};
use uuid::Uuid;

use crate::models::recurrence::{EndCondition, Frequency};
use crate::models::{Event, RecurrenceRule};

#[derive(Debug, Clone)]
pub(crate) struct ExpandedEventInstance {
    pub(crate) display_id: String,
    pub(crate) event: Event,
    pub(crate) is_virtual: bool,
}

/// Expands recurring events into concrete instances that overlap the requested range.
#[allow(dead_code)]
pub fn expand_recurring_events(
    events: &[Event],
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> Vec<Event> {
    expand_recurring_event_instances(events, range_start, range_end)
        .into_iter()
        .map(|instance| instance.event)
        .collect()
}

pub(crate) fn expand_recurring_event_instances(
    events: &[Event],
    range_start: NaiveDate,
    range_end: NaiveDate,
) -> Vec<ExpandedEventInstance> {
    let recurring_parent_ids: HashSet<Uuid> = events
        .iter()
        .filter(|event| event.recurrence.is_some())
        .map(|event| event.id)
        .collect();

    let overrides_by_parent = collect_overrides(events);
    let mut consumed_override_ids = HashSet::new();
    let mut expanded = Vec::new();

    for event in events {
        if let Some(rule) = &event.recurrence {
            expand_parent_instances(
                event,
                rule,
                range_start,
                range_end,
                overrides_by_parent.get(&event.id),
                &mut consumed_override_ids,
                &mut expanded,
            );
            continue;
        }

        if let Some(parent_id) = event.recurrence_parent_id {
            if recurring_parent_ids.contains(&parent_id) {
                continue;
            }
        }

        push_instance_if_in_range(&mut expanded, event, range_start, range_end);
    }

    for event in events {
        if event.recurrence.is_some() {
            continue;
        }

        let Some(parent_id) = event.recurrence_parent_id else {
            continue;
        };

        if !recurring_parent_ids.contains(&parent_id) || consumed_override_ids.contains(&event.id) {
            continue;
        }

        push_instance_if_in_range(&mut expanded, event, range_start, range_end);
    }

    expanded
}

fn collect_overrides(events: &[Event]) -> HashMap<Uuid, HashMap<NaiveDate, &Event>> {
    let mut overrides_by_parent = HashMap::new();

    for event in events {
        if event.recurrence.is_some() {
            continue;
        }

        let Some(parent_id) = event.recurrence_parent_id else {
            continue;
        };

        overrides_by_parent
            .entry(parent_id)
            .or_insert_with(HashMap::new)
            .insert(event.start_date, event);
    }

    overrides_by_parent
}

#[derive(Debug, Clone, Copy)]
struct ExpansionWindow {
    range_start: NaiveDate,
    range_end: NaiveDate,
    expansion_end: NaiveDate,
    after_count: Option<u32>,
}

fn expand_parent_occurrences(
    parent: &Event,
    rule: &RecurrenceRule,
    window: &ExpansionWindow,
    overrides_by_date: Option<&HashMap<NaiveDate, &Event>>,
    consumed_override_ids: &mut HashSet<Uuid>,
    expanded: &mut Vec<ExpandedEventInstance>,
) {
    let exception_dates: HashSet<NaiveDate> = rule.exception_dates.iter().copied().collect();
    let mut scheduled_count = 0_u32;

    for occurrence_date in occurrence_dates(parent.start_date, rule, window.expansion_end) {
        scheduled_count += 1;

        if let Some(override_event) =
            overrides_by_date.and_then(|events| events.get(&occurrence_date))
        {
            consumed_override_ids.insert(override_event.id);
            push_instance_if_in_range(
                expanded,
                override_event,
                window.range_start,
                window.range_end,
            );
        } else if !exception_dates.contains(&occurrence_date) {
            let virtual_event = build_virtual_event(parent, occurrence_date);
            if overlaps_range(&virtual_event, window.range_start, window.range_end) {
                expanded.push(ExpandedEventInstance {
                    display_id: format!("{}_{}", parent.id, occurrence_date.format("%Y-%m-%d")),
                    event: virtual_event,
                    is_virtual: true,
                });
            }
        }

        if matches!(window.after_count, Some(limit) if scheduled_count >= limit) {
            break;
        }
    }
}

fn expand_parent_instances(
    parent: &Event,
    rule: &RecurrenceRule,
    range_start: NaiveDate,
    range_end: NaiveDate,
    overrides_by_date: Option<&HashMap<NaiveDate, &Event>>,
    consumed_override_ids: &mut HashSet<Uuid>,
    expanded: &mut Vec<ExpandedEventInstance>,
) {
    let Some(expansion_end) = expansion_end(parent.start_date, range_end, &rule.end_condition)
    else {
        return;
    };

    if expansion_end < parent.start_date {
        return;
    }

    let window = match &rule.end_condition {
        EndCondition::AfterCount { count } => {
            if *count == 0 {
                return;
            }
            ExpansionWindow {
                range_start,
                range_end,
                expansion_end,
                after_count: Some(*count),
            }
        }
        _ => ExpansionWindow {
            range_start,
            range_end,
            expansion_end,
            after_count: None,
        },
    };

    expand_parent_occurrences(
        parent,
        rule,
        &window,
        overrides_by_date,
        consumed_override_ids,
        expanded,
    );
}

fn push_instance_if_in_range(
    expanded: &mut Vec<ExpandedEventInstance>,
    event: &Event,
    range_start: NaiveDate,
    range_end: NaiveDate,
) {
    if !overlaps_range(event, range_start, range_end) {
        return;
    }

    expanded.push(ExpandedEventInstance {
        display_id: event.id.to_string(),
        event: event.clone(),
        is_virtual: false,
    });
}

fn occurrence_dates(
    start_date: NaiveDate,
    rule: &RecurrenceRule,
    expansion_end: NaiveDate,
) -> Vec<NaiveDate> {
    match rule.frequency {
        Frequency::Weekly => weekly_occurrence_dates(start_date, rule, expansion_end),
        Frequency::Monthly => monthly_occurrence_dates(start_date, rule, expansion_end),
    }
}

fn weekly_occurrence_dates(
    start_date: NaiveDate,
    rule: &RecurrenceRule,
    expansion_end: NaiveDate,
) -> Vec<NaiveDate> {
    let interval = i64::from(rule.interval.max(1));
    let mut scheduled_days = rule
        .days_of_week
        .iter()
        .filter_map(|day| parse_weekday(day))
        .collect::<HashSet<_>>();

    if scheduled_days.is_empty() {
        scheduled_days.insert(start_date.weekday());
    }

    let mut dates = Vec::new();
    let mut current = start_date;

    while current <= expansion_end {
        let days_since_start = current.signed_duration_since(start_date).num_days();
        let week_offset = days_since_start / 7;

        if week_offset % interval == 0 && scheduled_days.contains(&current.weekday()) {
            dates.push(current);
        }

        current += Duration::days(1);
    }

    dates
}

fn monthly_occurrence_dates(
    start_date: NaiveDate,
    rule: &RecurrenceRule,
    expansion_end: NaiveDate,
) -> Vec<NaiveDate> {
    let interval = rule.interval.max(1);
    let week_of_month = rule
        .week_of_month
        .filter(|week| (1..=5).contains(week))
        .unwrap_or_else(|| week_of_month(start_date));
    let weekday = rule
        .day_of_week
        .as_deref()
        .and_then(parse_weekday)
        .unwrap_or_else(|| start_date.weekday());

    let mut dates = Vec::new();
    let mut month_offset = 0_u32;

    loop {
        let Some(month_start) = month_start(start_date, month_offset) else {
            break;
        };

        if month_start > expansion_end {
            break;
        }

        if let Some(date) = nth_weekday_of_month(
            month_start.year(),
            month_start.month(),
            week_of_month,
            weekday,
        ) {
            if date >= start_date && date <= expansion_end {
                dates.push(date);
            }
        }

        let Some(next_offset) = month_offset.checked_add(interval) else {
            break;
        };
        month_offset = next_offset;
    }

    dates
}

fn month_start(start_date: NaiveDate, month_offset: u32) -> Option<NaiveDate> {
    let total_months = i64::from(start_date.year()) * 12
        + i64::from(start_date.month0())
        + i64::from(month_offset);
    let year = i32::try_from(total_months / 12).ok()?;
    let month = u32::try_from(total_months % 12).ok()? + 1;

    NaiveDate::from_ymd_opt(year, month, 1)
}

fn nth_weekday_of_month(
    year: i32,
    month: u32,
    week_of_month: u8,
    weekday: Weekday,
) -> Option<NaiveDate> {
    let first_day = NaiveDate::from_ymd_opt(year, month, 1)?;
    let weekday_offset = (7 + i64::from(weekday.num_days_from_monday())
        - i64::from(first_day.weekday().num_days_from_monday()))
        % 7;
    let day = 1 + u32::try_from(weekday_offset).ok()? + (u32::from(week_of_month) - 1) * 7;
    let date = NaiveDate::from_ymd_opt(year, month, day)?;

    if date.month() == month {
        Some(date)
    } else {
        None
    }
}

fn parse_weekday(value: &str) -> Option<Weekday> {
    match value.trim().to_ascii_lowercase().as_str() {
        "mon" => Some(Weekday::Mon),
        "tue" => Some(Weekday::Tue),
        "wed" => Some(Weekday::Wed),
        "thu" => Some(Weekday::Thu),
        "fri" => Some(Weekday::Fri),
        "sat" => Some(Weekday::Sat),
        "sun" => Some(Weekday::Sun),
        _ => None,
    }
}

fn week_of_month(date: NaiveDate) -> u8 {
    ((date.day() - 1) / 7 + 1) as u8
}

fn expansion_end(
    start_date: NaiveDate,
    range_end: NaiveDate,
    end_condition: &EndCondition,
) -> Option<NaiveDate> {
    let hard_limit = start_date.checked_add_signed(Duration::days(365))?;
    let mut end = hard_limit.min(range_end);

    if let EndCondition::UntilDate { until_date } = end_condition {
        end = end.min(*until_date);
    }

    Some(end)
}

fn build_virtual_event(parent: &Event, occurrence_date: NaiveDate) -> Event {
    let day_span = parent
        .end_date
        .signed_duration_since(parent.start_date)
        .num_days()
        .max(0);
    let end_date = occurrence_date + Duration::days(day_span);

    Event {
        id: parent.id,
        calendar_id: parent.calendar_id,
        title: parent.title.clone(),
        start_date: occurrence_date,
        end_date,
        start_time: parent.start_time,
        end_time: parent.end_time,
        all_day: parent.all_day,
        description_private: parent.description_private.clone(),
        description_public: parent.description_public.clone(),
        location: parent.location.clone(),
        recurrence: None,
        recurrence_parent_id: Some(parent.id),
        created_at: parent.created_at.clone(),
        updated_at: parent.updated_at.clone(),
    }
}

fn overlaps_range(event: &Event, range_start: NaiveDate, range_end: NaiveDate) -> bool {
    event.end_date >= range_start && event.start_date <= range_end
}

#[cfg(test)]
mod tests;
