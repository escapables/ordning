use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub fn has_unsaved_changes(state: State<'_, AppState>) -> Result<bool, String> {
    let current = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?
        .clone();
    let persisted = state
        .persisted
        .lock()
        .map_err(|err| format!("failed to lock persisted state: {err}"))?
        .clone();
    Ok(current != persisted)
}

#[tauri::command]
pub fn persist_snapshot(state: State<'_, AppState>) -> Result<(), String> {
    let snapshot = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?
        .clone();

    state
        .store
        .save(&snapshot)
        .map_err(|err| format!("failed to persist snapshot: {err}"))?;

    let mut persisted = state
        .persisted
        .lock()
        .map_err(|err| format!("failed to lock persisted state: {err}"))?;
    *persisted = snapshot;

    Ok(())
}

#[tauri::command]
pub fn discard_unsaved_changes(state: State<'_, AppState>) -> Result<(), String> {
    let snapshot = state
        .persisted
        .lock()
        .map_err(|err| format!("failed to lock persisted state: {err}"))?
        .clone();
    let mut current = state
        .data
        .lock()
        .map_err(|err| format!("failed to lock app state: {err}"))?;
    *current = snapshot;
    Ok(())
}

#[tauri::command]
pub fn request_app_close(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
