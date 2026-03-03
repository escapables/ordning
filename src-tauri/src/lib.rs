mod commands;
mod import_export;
mod models;
mod recurrence;
mod state;
mod storage;

use chrono::Utc;
use std::sync::Mutex;
use tauri::Manager;
use uuid::Uuid;

use crate::commands::calendar_cmds::{
    create_calendar, delete_calendar, list_calendars, toggle_visibility, update_calendar,
};
use crate::commands::event_cmds::{
    bulk_update_descriptions, count_events_by_title, create_event, delete_event, delete_events,
    get_event, get_past_events_count, purge_past_events, update_event,
};
use crate::commands::io_cmds::{
    export_json, get_export_event_count, get_launch_directory, import_json, preview_import_json,
};
use crate::commands::persistence_cmds::{
    discard_unsaved_changes, has_unsaved_changes, persist_snapshot, request_app_close,
};
use crate::commands::settings_cmds::{
    enable_encryption, get_settings, set_settings, unlock_encrypted_data,
};
use crate::commands::view_cmds::{get_week_events, search_events};
use crate::models::{AppData, Calendar};
use crate::state::AppState;
use crate::storage::json_store::{JsonStore, LoadState};

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
    let app_data = match store
        .load_or_create()
        .expect("failed to load initial app data")
    {
        LoadState::Ready(mut app_data) => {
            app_data.normalize_settings();

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

            app_data
        }
        LoadState::Locked => AppData::default(),
    };

    let launch_directory = std::env::current_dir().unwrap_or_else(|_| std::env::temp_dir());
    let state = AppState {
        data: Mutex::new(app_data.clone()),
        persisted: Mutex::new(app_data),
        store,
        launch_directory,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .setup(|app| {
            #[cfg(target_os = "linux")]
            if let Some(main_webview) = app.get_webview_window("main") {
                let _ = main_webview.with_webview(|webview| {
                    use gtk::prelude::WidgetExt;
                    use webkit2gtk::{SettingsExt, WebViewExt};

                    let view = webview.inner();

                    if let Some(settings) = WebViewExt::settings(&view) {
                        settings.set_enable_developer_extras(false);
                    }

                    // Disable WebKitGTK's built-in pinch-to-zoom which drives
                    // pageScaleFactor (visual magnification of the whole page).
                    // The private GtkGestureZoom stored under "wk-view-zoom-gesture"
                    // is separate from zoom_level. (see wry #544, tauri #13115)
                    unsafe {
                        use webkit2gtk::glib::object::ObjectType;
                        let obj_ptr = view.as_ptr() as *mut webkit2gtk::glib::gobject_ffi::GObject;
                        let data = webkit2gtk::glib::gobject_ffi::g_object_get_data(
                            obj_ptr,
                            c"wk-view-zoom-gesture".as_ptr(),
                        );
                        if !data.is_null() {
                            webkit2gtk::glib::gobject_ffi::g_signal_handlers_destroy(
                                data as *mut webkit2gtk::glib::gobject_ffi::GObject,
                            );
                        }
                    }

                    // Forward touchpad pinch events to JS as custom events so the
                    // calendar grid can use them for its own zoom.  Intercept at the
                    // widget event level (before GTK gesture processing) and suppress
                    // so the destroyed gesture cannot reclaim the sequence.
                    let view_for_pinch = view.clone();
                    view.connect_event(move |_widget, event| {
                        use gtk::gdk;
                        if event.event_type() != gdk::EventType::TouchpadPinch {
                            return webkit2gtk::glib::Propagation::Proceed;
                        }
                        let pinch = event
                            .downcast_ref::<gdk::EventTouchpadPinch>()
                            .expect("TouchpadPinch downcast");
                        let phase = pinch.as_ref().phase;
                        let scale = pinch.scale();
                        let (x, y) = pinch.position();
                        let js = format!(
                            "document.dispatchEvent(new CustomEvent('__pinch',\
                             {{detail:{{phase:{phase},scale:{scale},x:{x},y:{y}}}}}))"
                        );
                        view_for_pinch.evaluate_javascript(
                            &js,
                            None,
                            None,
                            webkit2gtk::gio::Cancellable::NONE,
                            |_| {},
                        );
                        webkit2gtk::glib::Propagation::Stop
                    });

                    // Guard Ctrl+scroll page zoom (separate from pinch).
                    view.set_zoom_level(1.0);
                    view.connect_zoom_level_notify(|zoom_view: &webkit2gtk::WebView| {
                        if (zoom_view.zoom_level() - 1.0).abs() > f64::EPSILON {
                            zoom_view.set_zoom_level(1.0);
                        }
                    });
                });
            }
            Ok(())
        })
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
            delete_events,
            get_event,
            get_past_events_count,
            purge_past_events,
            count_events_by_title,
            bulk_update_descriptions,
            export_json,
            get_export_event_count,
            get_launch_directory,
            preview_import_json,
            import_json,
            get_settings,
            set_settings,
            unlock_encrypted_data,
            enable_encryption,
            has_unsaved_changes,
            persist_snapshot,
            discard_unsaved_changes,
            request_app_close
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Ordning application");
}
