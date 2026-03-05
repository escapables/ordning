use crate::models::AppData;
use crate::storage::json_store::JsonStore;

pub(super) fn persist_imported_data(
    store: &JsonStore,
    updated_data: &AppData,
    import_was_encrypted: bool,
    import_password: Option<&str>,
) -> Result<(), String> {
    if import_was_encrypted && !store.status().encrypted {
        let password = import_password
            .filter(|candidate| !candidate.trim().is_empty())
            .ok_or_else(|| "password is required for encrypted import".to_owned())?;
        store
            .enable_encryption(updated_data, password)
            .map_err(|err| format!("failed to enable encryption during import: {err}"))?;
        return Ok(());
    }

    store
        .save(updated_data)
        .map_err(|err| format!("failed to persist import: {err}"))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;
    use crate::storage::json_store::{LoadState, StorageStatus};

    fn unique_temp_file() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        std::env::temp_dir().join(format!("ordning-import-persist-{nanos}.json"))
    }

    fn cleanup(path: &PathBuf) {
        if path.exists() {
            fs::remove_file(path).expect("cleanup temp file");
        }
    }

    #[test]
    fn encrypted_import_into_plaintext_store_enables_encryption() {
        let path = unique_temp_file();
        let store = JsonStore::from_path_for_tests(path.clone());
        let initial = match store.load_or_create().expect("bootstrap store") {
            LoadState::Ready(app_data) => app_data,
            LoadState::Locked => panic!("new store should not start locked"),
        };
        let mut updated = initial.clone();
        updated.settings.lang = "en".to_owned();

        persist_imported_data(&store, &updated, true, Some("import secret"))
            .expect("encrypted import should enable encryption");

        assert_eq!(
            store.status(),
            StorageStatus {
                encrypted: true,
                locked: false,
            }
        );

        let reloaded = JsonStore::from_path_for_tests(path.clone());
        let loaded = reloaded.load_or_create().expect("reload should succeed");
        assert!(matches!(loaded, LoadState::Locked));

        let unlocked = reloaded
            .unlock("import secret")
            .expect("import password should unlock the new encrypted store");
        assert_eq!(unlocked.settings.lang, "en");

        cleanup(&path);
    }

    #[test]
    fn encrypted_import_into_encrypted_store_keeps_existing_store_password() {
        let path = unique_temp_file();
        let store = JsonStore::from_path_for_tests(path.clone());
        let initial = match store.load_or_create().expect("bootstrap store") {
            LoadState::Ready(app_data) => app_data,
            LoadState::Locked => panic!("new store should not start locked"),
        };
        store
            .enable_encryption(&initial, "store secret")
            .expect("initial encryption should succeed");

        let mut updated = initial.clone();
        updated.settings.timezone = "UTC".to_owned();

        persist_imported_data(&store, &updated, true, Some("import secret"))
            .expect("import should persist using existing store key");

        assert_eq!(
            store.status(),
            StorageStatus {
                encrypted: true,
                locked: false,
            }
        );

        let reloaded = JsonStore::from_path_for_tests(path.clone());
        let loaded = reloaded.load_or_create().expect("reload should succeed");
        assert!(matches!(loaded, LoadState::Locked));

        let wrong_password_error = reloaded
            .unlock("import secret")
            .expect_err("import password should not replace store password");
        assert!(wrong_password_error
            .to_string()
            .contains("invalid password"));

        let unlocked = reloaded
            .unlock("store secret")
            .expect("existing store password should still unlock");
        assert_eq!(unlocked.settings.timezone, "UTC");

        cleanup(&path);
    }
}
