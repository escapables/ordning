mod commands;
mod models;
mod state;
mod storage;

use chrono::Utc;
use std::sync::Mutex;
use uuid::Uuid;

use crate::commands::calendar_cmds::{create_calendar, list_calendars};
use crate::commands::view_cmds::get_week_events;
use crate::models::Calendar;
use crate::state::AppState;
use crate::storage::json_store::JsonStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = JsonStore::new().expect("failed to initialize JSON store");
    let mut app_data = store
        .load_or_create()
        .expect("failed to load initial app data");

    if app_data.calendars.is_empty() {
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
        store
            .save(&app_data)
            .expect("failed to seed default calendar");
    }

    let state = AppState {
        data: Mutex::new(app_data),
        store,
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            list_calendars,
            create_calendar,
            get_week_events
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Ordning application");
}
