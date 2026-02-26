---
summary: 'System architecture, technology stack, data model, and design decisions.'
read_when:
  - Starting implementation of a new component.
  - Making technology or design decisions.
  - Reviewing how modules fit together.
---

# Architecture

## Overview

Offline Linux calendar app (Apple Calendar week-view style). JSON import/export sync, multiple color-coded calendars, dual descriptions (private + public) per event. No local server — single binary/AppImage.

## Stack

**Tauri v2** — Rust backend + HTML/CSS/JS in system webview (WebKitGTK). Custom protocol (`tauri://`) for content, IPC for JS↔Rust. Single binary, AppImage packaging.

- **Backend**: Rust (serde, chrono, uuid, tauri-plugin-dialog, tauri-plugin-fs)
- **Frontend**: Vanilla JS (ES modules) + CSS. No framework — reactive state store w/ pub/sub
- **Persistence**: JSON at `<exe_dir>/ordning-data.json` — portable, next to binary (atomic write: .tmp → rename)

## i18n

Swedish default, English toggle. Two-language only.

- String map: `frontend/src/i18n/strings.js` → `{ sv: {...}, en: {...} }` keyed by ID
- Lookup: `t('today')` returns current-lang string; `setLang('en'|'sv')` switches
- Persistence: `"settings": { "lang": "sv" }` in app data JSON (legacy `lang` migrated on startup)
- Day/month names in string map (`monday: "Måndag"` / `"Monday"`)
- All UI text via `t()` — no hardcoded user-facing strings

## Project Structure

```
~/projects/ordning/
├── package.json
├── frontend/
│   ├── index.html
│   └── src/
│       ├── main.js               # Bootstrap, Tauri API init
│       ├── state.js              # Reactive pub/sub state store
│       ├── i18n/
│       │   └── strings.js        # { sv, en }, t() helper
│       ├── styles/
│       │   ├── reset.css
│       │   ├── variables.css     # Design tokens
│       │   ├── layout.css        # Sidebar + main grid
│       │   ├── sidebar.css
│       │   ├── week-view.css
│       │   ├── event-form.css
│       │   └── components.css
│       ├── components/
│       │   ├── app-shell.js
│       │   ├── sidebar/
│       │   │   ├── calendar-list.js
│       │   │   └── mini-month.js
│       │   ├── header/
│       │   │   ├── toolbar.js
│       │   │   └── search.js
│       │   ├── week-view/
│       │   │   ├── week-grid.js
│       │   │   ├── week-zoom.js
│       │   │   ├── day-column.js
│       │   │   ├── event-block.js
│       │   │   ├── context-menu.js
│       │   │   ├── all-day-bar.js
│       │   │   └── time-indicator.js
│       │   ├── event-form/
│       │   │   ├── event-modal.js
│       │   │   └── recurrence-picker.js
│       │   └── dialogs/
│       │       ├── confirm-dialog.js
│       │       ├── import-dialog.js
│       │       ├── export-dialog.js
│       │       └── settings-dialog.js
│       └── utils/
│           ├── date-utils.js
│           ├── color-utils.js
│           ├── dom-utils.js
│           ├── ui-actions.js
│           ├── keyboard-handler.js
│           ├── event-segments.js
│           └── print-week.js
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs
        ├── lib.rs                # Tauri builder, command registration
        ├── state.rs              # AppState w/ Mutex<AppData>
        ├── commands/
        │   ├── calendar_cmds.rs  # CRUD calendars
        │   ├── event_cmds.rs     # CRUD events
        │   ├── view_cmds.rs      # get_week_events, search_events
        │   ├── io_cmds.rs        # Import/export via native file dialogs
        │   └── settings_cmds.rs  # get_settings, set_settings
        ├── models/
        │   ├── calendar.rs       # Calendar { id, name, color, group, visible }
        │   ├── event.rs          # Event { ..., description_private, description_public }
        │   ├── recurrence.rs     # RecurrenceRule, Frequency, EndCondition
        │   └── app_data.rs       # AppData { version, settings, calendars, events }
        ├── storage/
        │   └── json_store.rs     # Load/save w/ atomic write
        └── import_export/
            ├── exporter.rs       # Full vs public-only export
            ├── importer.rs       # Merge by UUID + updated_at, or replace
            └── schema.rs         # Interchange format types
```

## Data Model

### Event (core)

- `id: Uuid`, `calendar_id: Uuid`, `title: String`
- `start_date/end_date: NaiveDate`, `start_time/end_time: Option<NaiveTime>`, `all_day: bool`
- `description_private: String` — personal notes, never in public export
- `description_public: String` — shareable, all exports
- `location: Option<String>`, `recurrence: Option<RecurrenceRule>`
- `created_at/updated_at: String` (ISO 8601, merge conflict resolution)

### Calendar

- `id, name, color (hex), group, visible, created_at, updated_at`

### RecurrenceRule

- `frequency (daily/weekly/monthly/yearly), interval, days_of_week, end_condition (never/after_count/until_date)`

Dates timezone-naive (NaiveDate/NaiveTime) — single-user, local timezone, no remote conversion.

## Import/Export Schema

```json
{
  "ordning_version": 1,
  "exported_at": "2026-02-23T14:30:00Z",
  "export_mode": "public",
  "calendars": [
    { "id": "...", "name": "Work", "color": "#3478F6", "group": "Professional" }
  ],
  "events": [
    {
      "id": "...", "calendar_id": "...", "title": "...",
      "start_date": "2026-02-23", "start_time": "09:00",
      "end_date": "2026-02-23", "end_time": "09:30",
      "all_day": false,
      "description_public": "Daily sync",
      "location": "Room 4B",
      "recurrence": {
        "frequency": "weekly", "interval": 1,
        "days_of_week": ["mon","tue","wed","thu","fri"],
        "end_condition": { "type": "never" }
      }
    }
  ]
}
```

- **Public export**: `description_private` omitted (absent, not empty)
- **Full export**: both description fields
- **Import merge**: match UUID; keep later `updated_at`

## Frontend Rendering

- **App shell**: CSS Grid — sidebar (276px) + main area
- **Week grid**: CSS Grid — 7 day columns + time label column; hourly rows
- **Event blocks**: absolute position in day columns; `top`/`height` from start/end times × px-per-hour
- **Overlapping events**: collision groups, width distributed evenly
- **Aesthetic**: Liberation Sans stack, #007aff blue, #ff3b30 red indicator, #f5f5f7 sidebar bg, 4px radius, 11px event text

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla JS | One view, moderate interactivity. No build tooling. Migrate Preact if needed. |
| JSON not SQLite | Small dataset. Human-readable, doubles as interchange format. |
| NaiveDate/NaiveTime | Offline single-tz. No timezone DB. |
| Mutex not RwLock | Single-user, writes hit disk every mutation. Low contention. |
| Atomic writes | .tmp → rename. No corruption on crash. |
| Simple i18n | Two languages, plain JS object, `t()` lookup. |

## Risks

- **Overlapping events**: collision detection for side-by-side render
- **Recurrence expansion**: start daily/weekly, defer monthly/yearly edge cases
- **WebKitGTK dep**: required for Tauri on Linux; AppImage bundles it
- **Large file perf**: unlikely for personal use; debounced writes if needed

## Verification

After each sprint:
1. `cargo tauri dev` — builds and opens
2. Manual test of sprint demo scenario
3. Persistence: close → reopen → data intact
4. JSON check: `cat ordning-data.json | python3 -m json.tool`
