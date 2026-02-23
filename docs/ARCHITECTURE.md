---
summary: 'System architecture, technology stack, data model, and design decisions.'
read_when:
  - Starting implementation of a new component.
  - Making technology or design decisions.
  - Reviewing how modules fit together.
---

# Architecture

## Overview

Personal offline calendar app for Linux, mimicking Apple Calendar's week view. Syncs via JSON import/export, supports multiple calendars with color coding, and has dual description fields (private + public) per event. Runs completely offline with no local server — distributed as a single binary/AppImage.

## Technology Stack

**Tauri v2** — Rust backend + HTML/CSS/JS frontend rendered in system webview (WebKitGTK). No HTTP server; Tauri uses a custom protocol (`tauri://`) for content loading and IPC for JS-to-Rust communication. Single binary output, AppImage packaging.

- **Backend**: Rust (serde, chrono, uuid, tauri-plugin-dialog, tauri-plugin-fs)
- **Frontend**: Vanilla JS (ES modules) + CSS. No framework — simple reactive state store with pub/sub pattern
- **Persistence**: JSON file at `~/.local/share/com.ordning.app/ordning-data.json` (atomic write: write to .tmp, rename)

## Internationalization

Swedish default, English toggle. Two-language only — no framework needed.

- **String map**: `src/i18n/strings.js` exports `{ sv: { ... }, en: { ... } }` keyed by string ID
- **Lookup**: `t('today')` returns current-language string; `setLang('en'|'sv')` switches
- **Persistence**: Language preference stored in app data JSON (`"lang": "sv"`)
- **Day/month names**: Included in string map (e.g., `monday: "Måndag"` / `"Monday"`)
- **Settings toggle**: UI in sidebar or toolbar (later milestone); plumbing from v0.1

All UI text must go through `t()` — no hardcoded user-facing strings in components.

## Project Structure

```
~/projects/ordning/
├── package.json
├── index.html
├── src/                          # Frontend
│   ├── main.js                   # Bootstrap, Tauri API init
│   ├── state.js                  # Reactive pub/sub state store
│   ├── i18n/
│   │   └── strings.js            # { sv: {...}, en: {...} }, t() helper
│   ├── styles/
│   │   ├── reset.css
│   │   ├── variables.css         # Apple Calendar aesthetic tokens
│   │   ├── layout.css            # Sidebar + main grid
│   │   ├── sidebar.css
│   │   ├── week-view.css
│   │   ├── event-form.css
│   │   └── components.css
│   ├── components/
│   │   ├── app-shell.js
│   │   ├── sidebar/
│   │   │   ├── calendar-list.js
│   │   │   └── mini-month.js
│   │   ├── header/
│   │   │   ├── toolbar.js
│   │   │   └── search.js
│   │   ├── week-view/
│   │   │   ├── week-grid.js
│   │   │   ├── day-column.js
│   │   │   ├── event-block.js
│   │   │   ├── all-day-bar.js
│   │   │   └── time-indicator.js
│   │   ├── event-form/
│   │   │   ├── event-modal.js
│   │   │   └── recurrence-picker.js
│   │   └── dialogs/
│   │       ├── import-dialog.js
│   │       └── export-dialog.js
│   └── utils/
│       ├── date-utils.js
│       ├── color-utils.js
│       └── dom-utils.js
└── src-tauri/                    # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs
        ├── lib.rs                # Tauri builder, command registration
        ├── state.rs              # AppState with Mutex<AppData>
        ├── commands/
        │   ├── calendar_cmds.rs  # CRUD calendars
        │   ├── event_cmds.rs     # CRUD events
        │   ├── view_cmds.rs      # get_week_events, search_events
        │   └── io_cmds.rs        # import/export via native file dialogs
        ├── models/
        │   ├── calendar.rs       # Calendar { id, name, color, group, visible }
        │   ├── event.rs          # Event { ..., description_private, description_public }
        │   ├── recurrence.rs     # RecurrenceRule, Frequency, EndCondition
        │   └── app_data.rs       # AppData { version, calendars, events }
        ├── storage/
        │   └── json_store.rs     # Load/save with atomic write
        └── import_export/
            ├── exporter.rs       # Full vs public-only export
            ├── importer.rs       # Merge by UUID + updated_at, or replace
            └── schema.rs         # Interchange format types
```

## Data Model

### Event (core entity)

- `id: Uuid`, `calendar_id: Uuid`, `title: String`
- `start_date/end_date: NaiveDate`, `start_time/end_time: Option<NaiveTime>`, `all_day: bool`
- `description_private: String` — personal notes, never exported in "public" mode
- `description_public: String` — shareable description, included in all exports
- `location: Option<String>`, `recurrence: Option<RecurrenceRule>`
- `created_at/updated_at: String` (ISO 8601, used for merge conflict resolution)

### Calendar

- `id, name, color (hex), group, visible, created_at, updated_at`

### RecurrenceRule

- `frequency (daily/weekly/monthly/yearly), interval, days_of_week, end_condition (never/after_count/until_date)`

Dates are timezone-naive (NaiveDate/NaiveTime) — personal calendar operates in user's local timezone, no remote timezone conversion needed.

## Import/Export JSON Schema

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
      "id": "...",
      "calendar_id": "...",
      "title": "...",
      "start_date": "2026-02-23",
      "start_time": "09:00",
      "end_date": "2026-02-23",
      "end_time": "09:30",
      "all_day": false,
      "description_public": "Daily sync with the team",
      "location": "Room 4B",
      "recurrence": {
        "frequency": "weekly",
        "interval": 1,
        "days_of_week": ["mon", "tue", "wed", "thu", "fri"],
        "end_condition": { "type": "never" }
      }
    }
  ]
}
```

- **Public export**: `description_private` field omitted entirely (not empty — absent)
- **Full export**: Both description fields included
- **Import merge**: Match by UUID; if same event exists, keep the one with later `updated_at`

## Frontend Rendering Strategy

- **App shell**: CSS Grid — sidebar (240px) + main area
- **Week grid**: CSS Grid for 7 day columns + time label column; hourly rows
- **Event blocks**: Absolutely positioned within day columns; `top`/`height` computed from start/end times (pixels-per-hour constant)
- **Overlapping events**: Collision detection groups overlapping events, distributes width evenly
- **Apple Calendar aesthetic**: Liberation Sans font stack (`"Liberation Sans", sans-serif`), specific color tokens (#007aff blue, #ff3b30 red time indicator, #f5f5f7 sidebar bg), 4px border-radius on events, 11px event text

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla JS, no framework | One view (week), moderate interactivity. Avoids build tooling and bundle size. Migrate to Preact later if needed. |
| JSON not SQLite | Personal calendar = small dataset. JSON is human-readable and doubles as the interchange format. |
| NaiveDate/NaiveTime | Offline-only, single timezone. Avoids timezone DB complexity. |
| Mutex not RwLock | Single-user desktop app, writes hit disk on every mutation. Low contention. |
| Atomic writes | Write to .tmp then rename. Prevents data corruption on crash. |
| Simple i18n | Two languages (sv/en), plain JS object. No framework — string map + `t()` lookup. |

## Risk Areas

- **Overlapping events**: Need collision detection to render side-by-side
- **Recurrence expansion**: Start with daily/weekly only, defer monthly/yearly edge cases
- **WebKitGTK dependency**: Required for Tauri on Linux; AppImage should bundle it
- **Large file performance**: Unlikely issue for personal use; debounced writes if needed later

## Verification

After each sprint:
1. `cargo tauri dev` — app builds and opens
2. Manual testing of the sprint's demo scenario
3. Verify persistence: close app, reopen, data intact
4. Check JSON file: `cat ~/.local/share/com.ordning.app/ordning-data.json | python3 -m json.tool`
