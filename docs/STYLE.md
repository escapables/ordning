---
summary: 'Coding conventions for this project.'
read_when:
  - Writing new code.
  - Reviewing a pull request.
---

# Style

## Formatting

- All Rust code must pass `cargo fmt`. No exceptions.
- Run `cargo fmt --all` before committing.
- All Rust code must pass `cargo clippy -- -D warnings`. No exceptions.

## Naming

### Rust (src-tauri/)

- **Modules:** lowercase, single word (`models`, `commands`, `storage`)
- **Types:** PascalCase (`Calendar`, `AppData`, `RecurrenceRule`)
- **Functions:** snake_case (`create_event`, `get_week_events`)
- **Constants:** SCREAMING_SNAKE_CASE (`MAX_EVENTS`, `DEFAULT_COLOR`)
- **Acronyms in types:** PascalCase (`JsonStore`, not `JSONStore`)
- **Derive order:** `Debug, Clone, Serialize, Deserialize` (alpha after Debug/Clone)

### JavaScript (src/)

- **Files:** kebab-case (`week-grid.js`, `date-utils.js`)
- **Functions:** camelCase (`renderWeekGrid`, `formatTime`)
- **Classes/Components:** PascalCase (`EventModal`, `CalendarList`)
- **Constants:** SCREAMING_SNAKE_CASE (`PIXELS_PER_HOUR`, `HOUR_COUNT`)
- **CSS classes:** kebab-case (`event-block`, `time-indicator`)

## Error Handling

### Rust

- Use `anyhow` for error propagation in Tauri commands.
- Return `Result<T>`, don't `unwrap()` or `panic!` except in tests.
- Provide context with `.context("doing X")`.

### JavaScript

- Use try/catch around `invoke()` calls.
- Show user-facing errors in the UI, not just console.

## File Size

- Keep files under ~500 LOC (Rust, JS, and CSS). Split/refactor when approaching the limit.

## Project Layout

- `src/` — frontend (Vanilla JS + CSS)
- `src-tauri/src/` — backend (Rust, Tauri commands)
- `src-tauri/src/models/` — data structs
- `src-tauri/src/commands/` — Tauri IPC commands
- `src-tauri/src/storage/` — persistence
- Keep Tauri commands thin — business logic in models/storage

## Imports

### Rust

Group and separate with blank lines:

```rust
use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::models::event::Event;
```

Order: std, external crates, internal crates.

### JavaScript

```javascript
// Tauri API
import { invoke } from '@tauri-apps/api/core';

// Local modules
import { state } from '../state.js';
import { formatTime } from '../utils/date-utils.js';
```

## Testing

- Rust tests in the same file (`#[cfg(test)] mod tests`) or in `tests/`
- Use `#[test]` with descriptive names: `fn create_event_sets_updated_at()`
- Playwright e2e tests in `frontend/test/e2e/`: `npx playwright test`
- Add regression tests for bugs

## Comments

- Don't over-comment obvious code
- Do comment: public API (rustdoc `///`), non-obvious algorithms, edge cases
- Use `///` for public Rust items, `//` for internal notes
- Use `/** */` for JS function docs
