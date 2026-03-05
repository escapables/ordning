use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};
use serde_json::Value;

use crate::models::AppData;
use crate::storage::encryption::{EncryptedEnvelope, EncryptionContext, ENCRYPTED_FORMAT};

const DATA_FILE_NAME: &str = "ordning-data.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StorageStatus {
    pub encrypted: bool,
    pub locked: bool,
}

pub enum LoadState {
    Ready(AppData),
    Locked,
}

enum StoreMode {
    Plaintext,
    Locked(EncryptedEnvelope),
    Encrypted(EncryptionContext),
}

pub struct JsonStore {
    data_path: PathBuf,
    mode: Mutex<StoreMode>,
}

impl JsonStore {
    pub fn new() -> Result<Self> {
        let base_dir = if let Ok(appimage) = std::env::var("APPIMAGE") {
            PathBuf::from(appimage)
                .parent()
                .context("failed to resolve AppImage parent directory")?
                .to_path_buf()
        } else {
            let exe_path = std::env::current_exe().context("failed to resolve executable path")?;
            exe_path
                .parent()
                .context("failed to resolve executable directory")?
                .to_path_buf()
        };
        let data_path = base_dir.join(DATA_FILE_NAME);
        Ok(Self::from_path(data_path))
    }

    pub fn load_or_create(&self) -> Result<LoadState> {
        if !self.data_path.exists() {
            let default_data = AppData::default();
            self.write_plaintext(&default_data)?;
            self.set_mode(StoreMode::Plaintext)?;
            return Ok(LoadState::Ready(default_data));
        }

        let content = fs::read_to_string(&self.data_path)
            .with_context(|| format!("failed to read {}", self.data_path.display()))?;
        let value = serde_json::from_str::<Value>(&content)
            .with_context(|| format!("failed to parse {}", self.data_path.display()))?;

        match value.get("format").and_then(Value::as_str) {
            Some(ENCRYPTED_FORMAT) => {
                let envelope = serde_json::from_value::<EncryptedEnvelope>(value)
                    .with_context(|| format!("failed to parse {}", self.data_path.display()))?;
                envelope.validate()?;
                self.set_mode(StoreMode::Locked(envelope))?;
                Ok(LoadState::Locked)
            }
            Some(other) => Err(anyhow!("unsupported storage format '{other}'")),
            None => {
                let app_data = serde_json::from_value::<AppData>(value)
                    .with_context(|| format!("failed to parse {}", self.data_path.display()))?;
                self.set_mode(StoreMode::Plaintext)?;
                Ok(LoadState::Ready(app_data))
            }
        }
    }

    pub fn save(&self, app_data: &AppData) -> Result<()> {
        let mode = self
            .mode
            .lock()
            .map_err(|_| anyhow!("failed to lock store mode"))?;

        match &*mode {
            StoreMode::Plaintext => self.write_plaintext(app_data),
            StoreMode::Locked(_) => Err(anyhow!("unlock encrypted data before saving")),
            StoreMode::Encrypted(context) => self.write_encrypted(app_data, context),
        }
    }

    pub fn enable_encryption(&self, app_data: &AppData, password: &str) -> Result<()> {
        let context = {
            let mode = self
                .mode
                .lock()
                .map_err(|_| anyhow!("failed to lock store mode"))?;
            match &*mode {
                StoreMode::Plaintext => EncryptionContext::derive_new(password)?,
                StoreMode::Locked(_) | StoreMode::Encrypted(_) => {
                    return Err(anyhow!("data file is already encrypted"));
                }
            }
        };

        self.write_encrypted(app_data, &context)?;
        self.set_mode(StoreMode::Encrypted(context))?;
        Ok(())
    }

    pub fn disable_encryption(&self, app_data: &AppData, password: &str) -> Result<()> {
        {
            let mode = self
                .mode
                .lock()
                .map_err(|_| anyhow!("failed to lock store mode"))?;
            match &*mode {
                StoreMode::Plaintext => return Err(anyhow!("data file is not encrypted")),
                StoreMode::Locked(_) => {
                    return Err(anyhow!("unlock encrypted data before disabling encryption"));
                }
                StoreMode::Encrypted(context) => {
                    if !context.verify_password(password)? {
                        return Err(anyhow!("invalid password"));
                    }
                }
            }
        }

        self.write_plaintext(app_data)?;
        self.set_mode(StoreMode::Plaintext)?;
        Ok(())
    }

    pub fn unlock(&self, password: &str) -> Result<AppData> {
        let envelope = {
            let mode = self
                .mode
                .lock()
                .map_err(|_| anyhow!("failed to lock store mode"))?;
            match &*mode {
                StoreMode::Plaintext => return Err(anyhow!("data file is not encrypted")),
                StoreMode::Locked(envelope) => envelope.clone(),
                StoreMode::Encrypted(_) => return Err(anyhow!("data file is already unlocked")),
            }
        };

        let (context, app_data) = EncryptionContext::unlock(&envelope, password)?;
        self.set_mode(StoreMode::Encrypted(context))?;
        Ok(app_data)
    }

    pub fn status(&self) -> StorageStatus {
        let mode = self
            .mode
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match &*mode {
            StoreMode::Plaintext => StorageStatus {
                encrypted: false,
                locked: false,
            },
            StoreMode::Locked(_) => StorageStatus {
                encrypted: true,
                locked: true,
            },
            StoreMode::Encrypted(_) => StorageStatus {
                encrypted: true,
                locked: false,
            },
        }
    }

    fn from_path(data_path: PathBuf) -> Self {
        Self {
            data_path,
            mode: Mutex::new(StoreMode::Plaintext),
        }
    }

    fn set_mode(&self, next_mode: StoreMode) -> Result<()> {
        let mut mode = self
            .mode
            .lock()
            .map_err(|_| anyhow!("failed to lock store mode"))?;
        *mode = next_mode;
        Ok(())
    }

    fn write_plaintext(&self, app_data: &AppData) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(app_data).context("failed to serialize app data")?;
        self.write_payload(&bytes)
    }

    fn write_encrypted(&self, app_data: &AppData, context: &EncryptionContext) -> Result<()> {
        let envelope = context.encrypt(app_data)?;
        let bytes = serde_json::to_vec_pretty(&envelope)
            .context("failed to serialize encrypted app data")?;
        self.write_payload(&bytes)
    }

    fn write_payload(&self, bytes: &[u8]) -> Result<()> {
        let parent = self
            .data_path
            .parent()
            .context("data path missing parent directory")?;

        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;

        let temp_path = self.data_path.with_extension("json.tmp");
        fs::write(&temp_path, bytes)
            .with_context(|| format!("failed to write {}", temp_path.display()))?;

        fs::rename(&temp_path, &self.data_path).or_else(|rename_err| {
            if rename_err.kind() == io::ErrorKind::CrossesDevices {
                fs::copy(&temp_path, &self.data_path)
                    .with_context(|| {
                        format!(
                            "failed to copy temp store from {} to {}",
                            temp_path.display(),
                            self.data_path.display()
                        )
                    })
                    .and_then(|_| {
                        fs::remove_file(&temp_path)
                            .with_context(|| format!("failed to cleanup {}", temp_path.display()))
                    })
            } else {
                Err(rename_err.into())
            }
        })?;
        set_owner_only_permissions(&self.data_path)?;

        Ok(())
    }
}

#[cfg(unix)]
fn set_owner_only_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .with_context(|| format!("failed to set permissions on {}", path.display()))
}

#[cfg(not(unix))]
fn set_owner_only_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn unique_temp_file() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        std::env::temp_dir().join(format!("ordning-json-store-{nanos}.json"))
    }

    fn cleanup(path: &PathBuf) {
        if path.exists() {
            fs::remove_file(path).expect("cleanup temp file");
        }
    }

    #[test]
    fn save_then_load_round_trip() {
        let path = unique_temp_file();
        let store = JsonStore::from_path(path.clone());
        let original = AppData::default();
        store.save(&original).expect("save should succeed");

        let reloaded = JsonStore::from_path(path.clone());
        let loaded = reloaded.load_or_create().expect("load should succeed");
        match loaded {
            LoadState::Ready(app_data) => assert_eq!(app_data, original),
            LoadState::Locked => panic!("expected plaintext file to load immediately"),
        }

        assert_eq!(
            reloaded.status(),
            StorageStatus {
                encrypted: false,
                locked: false,
            }
        );
        cleanup(&path);
    }

    #[test]
    fn load_or_create_writes_default_file_when_missing() {
        let path = unique_temp_file();
        let store = JsonStore::from_path(path.clone());

        let loaded = store.load_or_create().expect("load should succeed");
        match loaded {
            LoadState::Ready(app_data) => assert_eq!(app_data, AppData::default()),
            LoadState::Locked => panic!("new files should start plaintext"),
        }

        assert!(path.exists());
        cleanup(&path);
    }

    #[test]
    fn enable_encryption_then_unlock_round_trip() {
        let path = unique_temp_file();
        let store = JsonStore::from_path(path.clone());
        let original = match store.load_or_create().expect("bootstrap should succeed") {
            LoadState::Ready(app_data) => app_data,
            LoadState::Locked => panic!("new file should not start locked"),
        };
        store
            .enable_encryption(&original, "top secret")
            .expect("encrypt store");

        assert_eq!(
            store.status(),
            StorageStatus {
                encrypted: true,
                locked: false,
            }
        );

        let reloaded = JsonStore::from_path(path.clone());
        let state = reloaded.load_or_create().expect("reload should succeed");
        assert!(matches!(state, LoadState::Locked));
        assert_eq!(
            reloaded.status(),
            StorageStatus {
                encrypted: true,
                locked: true,
            }
        );

        let unlocked = reloaded
            .unlock("top secret")
            .expect("unlock should succeed");
        assert_eq!(unlocked, original);
        assert_eq!(
            reloaded.status(),
            StorageStatus {
                encrypted: true,
                locked: false,
            }
        );

        cleanup(&path);
    }

    #[test]
    fn unlock_rejects_wrong_password() {
        let path = unique_temp_file();
        let store = JsonStore::from_path(path.clone());
        let original = match store.load_or_create().expect("bootstrap should succeed") {
            LoadState::Ready(app_data) => app_data,
            LoadState::Locked => panic!("new file should not start locked"),
        };
        store
            .enable_encryption(&original, "top secret")
            .expect("encrypt store");

        let reloaded = JsonStore::from_path(path.clone());
        let state = reloaded.load_or_create().expect("reload should succeed");
        assert!(matches!(state, LoadState::Locked));

        let error = reloaded
            .unlock("wrong password")
            .expect_err("wrong password should fail");
        assert!(error.to_string().contains("invalid password"));

        cleanup(&path);
    }

    #[test]
    fn disable_encryption_restores_plaintext_round_trip() {
        let path = unique_temp_file();
        let store = JsonStore::from_path(path.clone());
        let original = match store.load_or_create().expect("bootstrap should succeed") {
            LoadState::Ready(app_data) => app_data,
            LoadState::Locked => panic!("new file should not start locked"),
        };
        store
            .enable_encryption(&original, "top secret")
            .expect("encrypt store");
        store
            .disable_encryption(&original, "top secret")
            .expect("disable encryption");

        assert_eq!(
            store.status(),
            StorageStatus {
                encrypted: false,
                locked: false,
            }
        );

        let reloaded = JsonStore::from_path(path.clone());
        let loaded = reloaded.load_or_create().expect("reload should succeed");
        match loaded {
            LoadState::Ready(app_data) => assert_eq!(app_data, original),
            LoadState::Locked => panic!("disabled encryption should restore plaintext storage"),
        }

        cleanup(&path);
    }

    #[cfg(unix)]
    #[test]
    fn load_or_create_and_save_set_owner_only_permissions() {
        let path = unique_temp_file();
        let store = JsonStore::from_path(path.clone());

        let _ = store.load_or_create().expect("load should succeed");
        let mode_after_create = fs::metadata(&path)
            .expect("metadata after create")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode_after_create, 0o600);

        store
            .save(&AppData::default())
            .expect("save should succeed");
        let mode_after_save = fs::metadata(&path)
            .expect("metadata after save")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode_after_save, 0o600);

        cleanup(&path);
    }
}
