use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Frequency {
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EndCondition {
    Never,
    AfterCount { count: u32 },
    UntilDate { until_date: NaiveDate },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecurrenceRule {
    pub frequency: Frequency,
    pub interval: u32,
    #[serde(default)]
    pub days_of_week: Vec<String>,
    pub end_condition: EndCondition,
    #[serde(default)]
    pub exception_dates: Vec<NaiveDate>,
    pub week_of_month: Option<u8>,
    pub day_of_week: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceRuleInput {
    pub frequency: Frequency,
    pub interval: u32,
    #[serde(default)]
    pub days_of_week: Vec<String>,
    pub end_condition_type: String,
    pub end_condition_count: Option<u32>,
    pub end_condition_until_date: Option<String>,
    #[serde(default)]
    pub exception_dates: Vec<String>,
    pub week_of_month: Option<u8>,
    pub day_of_week: Option<String>,
}

impl RecurrenceRuleInput {
    pub fn to_rule(&self) -> Result<RecurrenceRule, String> {
        let end_condition = match self.end_condition_type.as_str() {
            "never" => EndCondition::Never,
            "after_count" => {
                let count = self
                    .end_condition_count
                    .ok_or("end_condition_count is required when type is after_count")?;
                EndCondition::AfterCount { count }
            }
            "until_date" => {
                let raw = self
                    .end_condition_until_date
                    .as_deref()
                    .ok_or("end_condition_until_date is required when type is until_date")?;
                let until_date = parse_date(raw, "end_condition_until_date")?;
                EndCondition::UntilDate { until_date }
            }
            other => return Err(format!("invalid end_condition_type '{other}'")),
        };

        let exception_dates = self
            .exception_dates
            .iter()
            .enumerate()
            .map(|(i, raw)| parse_date(raw, &format!("exception_dates[{i}]")))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(RecurrenceRule {
            frequency: self.frequency,
            interval: self.interval,
            days_of_week: self.days_of_week.clone(),
            end_condition,
            exception_dates,
            week_of_month: self.week_of_month,
            day_of_week: self.day_of_week.clone(),
        })
    }
}

pub(crate) fn parse_date(value: &str, field: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|err| format!("invalid {field} '{value}': {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_round_trip_weekly() {
        let rule = RecurrenceRule {
            frequency: Frequency::Weekly,
            interval: 2,
            days_of_week: vec!["mon".to_owned(), "wed".to_owned()],
            end_condition: EndCondition::AfterCount { count: 10 },
            exception_dates: vec![NaiveDate::from_ymd_opt(2026, 3, 5).unwrap()],
            week_of_month: None,
            day_of_week: None,
        };

        let json = serde_json::to_string(&rule).unwrap();
        let deserialized: RecurrenceRule = serde_json::from_str(&json).unwrap();
        assert_eq!(rule, deserialized);
    }

    #[test]
    fn serde_round_trip_monthly() {
        let rule = RecurrenceRule {
            frequency: Frequency::Monthly,
            interval: 1,
            days_of_week: vec![],
            end_condition: EndCondition::UntilDate {
                until_date: NaiveDate::from_ymd_opt(2026, 12, 31).unwrap(),
            },
            exception_dates: vec![],
            week_of_month: Some(2),
            day_of_week: Some("tue".to_owned()),
        };

        let json = serde_json::to_string(&rule).unwrap();
        let deserialized: RecurrenceRule = serde_json::from_str(&json).unwrap();
        assert_eq!(rule, deserialized);
    }

    #[test]
    fn exception_dates_defaults_to_empty() {
        let json = r#"{
            "frequency": "weekly",
            "interval": 1,
            "days_of_week": ["fri"],
            "end_condition": {"type": "never"},
            "week_of_month": null,
            "day_of_week": null
        }"#;

        let rule: RecurrenceRule = serde_json::from_str(json).unwrap();
        assert!(rule.exception_dates.is_empty());
    }

    #[test]
    fn to_rule_converts_weekly_input() {
        let input = RecurrenceRuleInput {
            frequency: Frequency::Weekly,
            interval: 1,
            days_of_week: vec!["mon".to_owned()],
            end_condition_type: "never".to_owned(),
            end_condition_count: None,
            end_condition_until_date: None,
            exception_dates: vec![],
            week_of_month: None,
            day_of_week: None,
        };

        let rule = input.to_rule().unwrap();
        assert_eq!(rule.frequency, Frequency::Weekly);
        assert_eq!(rule.interval, 1);
        assert_eq!(rule.days_of_week, vec!["mon"]);
        assert_eq!(rule.end_condition, EndCondition::Never);
    }
}
