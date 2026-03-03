<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Ordning">
</p>

<h1 align="center">Ordning</h1>

<p align="center">
  Offline calendar for Linux. Fast, private, portable.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-linux-informational" alt="Platform: Linux">
  <img src="https://img.shields.io/badge/tauri-v2-blue" alt="Tauri v2">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="License: GPL-3.0">
</p>

---

Ordning is a desktop calendar application built for users who want full control over their data. No accounts, no cloud sync, no telemetry. Your calendar lives as a single file next to the application binary.

## Features

**Calendar Management**
- Multiple color-coded calendars with optional grouping
- Weekly view with drag-to-create, drag-to-move, and drag-to-resize
- Recurring events (weekly and monthly) with per-instance editing
- Multi-day and all-day event support
- Overlapping events rendered in side-by-side columns
- Multi-select with Ctrl+click for batch operations

**Privacy**
- Dual descriptions per event: private (personal notes) and public (shareable)
- Full export includes everything; public export strips private descriptions
- Optional AES-256-GCM encryption of local data with Argon2id key derivation
- Encrypted exports with password protection

**Data Portability**
- JSON-based storage — human-readable, version-controlled, portable
- Import/export with merge-by-UUID conflict resolution
- Portable AppImage ships as a single file with no installation required

**Interface**
- Apple Calendar-inspired week view
- Keyboard shortcuts (Delete, Ctrl+wheel zoom, arrow navigation)
- Mini-month navigator with week highlight
- Context menus, template search, print-to-PDF
- Swedish and English language support

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Ordning                       │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           Frontend (WebKitGTK)            │   │
│  │  Vanilla JS · ES Modules · CSS Grid       │   │
│  │  No framework · No build step             │   │
│  └──────────────┬───────────────────────────┘   │
│                 │ IPC (Tauri commands)           │
│  ┌──────────────┴───────────────────────────┐   │
│  │           Backend (Rust)                  │   │
│  │  Commands · Models · Storage · Recurrence │   │
│  │  Encryption · Import/Export               │   │
│  └──────────────┬───────────────────────────┘   │
│                 │ Atomic write (.tmp → rename)   │
│  ┌──────────────┴───────────────────────────┐   │
│  │         ordning-data.json                 │   │
│  │  Calendars · Events · Settings            │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

| Layer | Technology | Role |
|-------|-----------|------|
| Shell | Tauri v2 | Window management, native dialogs, IPC bridge |
| Frontend | Vanilla JS, CSS | UI rendering, user interaction, state management |
| Backend | Rust | Business logic, data validation, persistence |
| Storage | JSON file | Single-file portable data store |
| Encryption | Argon2id + AES-256-GCM | Optional at-rest encryption with password unlock |

The frontend uses no frameworks or build tools. All source files are ES modules served directly by Tauri's custom protocol. The backend exposes thin Tauri commands that delegate to typed Rust modules for calendar CRUD, event management, recurrence expansion, import/export, and encryption.

Data is persisted via atomic writes (write to `.tmp`, then rename) to prevent corruption on crash.

## Building from Source

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) (v18+)
- Linux system dependencies for Tauri v2:

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel

# Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg
```

### Development

```bash
git clone https://github.com/escapables/ordning.git
cd ordning
npm install
cargo tauri dev
```

### Production Build

```bash
cargo tauri build
```

The AppImage will be at `src-tauri/target/release/bundle/appimage/`.

For portable AppImage builds with cross-machine compatibility:

```bash
bin/build-appimage
```

This applies software rendering defaults and removes GPU-specific libraries for maximum portability across different Linux hardware.

### Running Tests

```bash
# Rust unit tests (50+)
cargo test --workspace

# Lint
cargo clippy --workspace -- -D warnings

# Format check
cargo fmt --all -- --check

# End-to-end tests (88+)
npx playwright test
```

## Project Structure

```
ordning/
├── frontend/                  # UI layer (vanilla JS + CSS)
│   ├── index.html
│   └── src/
│       ├── main.js            # Application bootstrap
│       ├── state.js           # Reactive pub/sub state store
│       ├── i18n/              # Swedish + English string maps
│       ├── components/        # UI components (week view, dialogs, sidebar)
│       ├── styles/            # CSS (variables, layout, components)
│       └── utils/             # Date math, keyboard handling, printing
├── src-tauri/                 # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── commands/          # Tauri IPC command handlers
│       ├── models/            # Calendar, Event, RecurrenceRule, AppData
│       ├── storage/           # JSON persistence + encryption
│       ├── recurrence/        # Weekly/monthly event expansion
│       └── import_export/     # Merge/replace import, full/public export
├── bin/                       # Build and validation scripts
├── docs/                      # Architecture, style guide, portability
└── CONTRIBUTING.md            # Contribution guidelines
```

## Data Storage

All data lives in a single `ordning-data.json` file located next to the application binary. No external databases, no hidden config directories, no cloud services.

When encryption is enabled, the file is stored as a versioned envelope (`ordning-encrypted-1`) containing an Argon2id-derived salt, AES-256-GCM nonce, and ciphertext. The password is held in memory only for the active session and zeroized on lock or exit.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, quality gates, and PR workflow.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
