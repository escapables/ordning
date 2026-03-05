use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::state::AppState;

pub(super) fn resolve_dialog_directory(
    state: &State<'_, AppState>,
    default_path: Option<String>,
) -> PathBuf {
    default_path
        .map(|path| path.trim().to_owned())
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| state.launch_directory.clone())
}

pub(super) fn get_pending_import_path(
    state: &State<'_, AppState>,
) -> Result<Option<PathBuf>, String> {
    let pending = state
        .pending_import_path
        .lock()
        .map_err(|err| format!("failed to lock pending import path: {err}"))?;
    Ok(pending.clone())
}

pub(super) fn set_pending_import_path(
    state: &State<'_, AppState>,
    path: &Path,
) -> Result<(), String> {
    let mut pending = state
        .pending_import_path
        .lock()
        .map_err(|err| format!("failed to lock pending import path: {err}"))?;
    *pending = Some(path.to_path_buf());
    Ok(())
}

pub(super) fn clear_pending_import_path(state: &State<'_, AppState>) -> Result<(), String> {
    let mut pending = state
        .pending_import_path
        .lock()
        .map_err(|err| format!("failed to lock pending import path: {err}"))?;
    *pending = None;
    Ok(())
}

pub(super) fn pick_import_file(app: &AppHandle, directory: PathBuf) -> Result<PathBuf, String> {
    let file_path = app
        .dialog()
        .file()
        .set_title("Import Ordning JSON")
        .set_directory(directory)
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
        .ok_or_else(|| "import canceled".to_owned())?;

    match file_path {
        tauri_plugin_dialog::FilePath::Path(path) => Ok(path),
        tauri_plugin_dialog::FilePath::Url(url) => url
            .to_file_path()
            .map_err(|_| "unsupported import target URL".to_owned()),
    }
}
