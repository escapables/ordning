mod commands;
mod import_export;
mod models;
mod state;
mod storage;

use chrono::Utc;
use std::sync::Mutex;
use uuid::Uuid;

use crate::commands::calendar_cmds::{
    create_calendar, delete_calendar, list_calendars, toggle_visibility, update_calendar,
};
use crate::commands::event_cmds::{
    create_event, delete_event, get_event, get_past_events_count, purge_past_events, update_event,
};
use crate::commands::io_cmds::{
    export_json, get_export_event_count, import_json, preview_import_json,
};
use crate::commands::view_cmds::{get_week_events, search_events};
use crate::models::Calendar;
use crate::state::AppState;
use crate::storage::json_store::JsonStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Force conservative WebKit/Mesa runtime defaults for AppImage startup.
    // Only set when not already defined so test environments can override.
    // SAFETY: called at startup before any threads are spawned.
    unsafe {
        if std::env::var_os("LIBGL_ALWAYS_SOFTWARE").is_none() {
            std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

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
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            list_calendars,
            create_calendar,
            update_calendar,
            delete_calendar,
            toggle_visibility,
            get_week_events,
            search_events,
            create_event,
            update_event,
            delete_event,
            get_event,
            get_past_events_count,
            purge_past_events,
            export_json,
            get_export_event_count,
            preview_import_json,
            import_json
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Ordning application");
}
