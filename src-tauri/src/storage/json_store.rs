use std::fs;
use std::io;
use std::path::PathBuf;

use anyhow::{Context, Result};

use crate::models::AppData;

const DATA_FILE_NAME: &str = "ordning-data.json";

#[derive(Debug, Clone)]
pub struct JsonStore {
    data_path: PathBuf,
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
        Ok(Self { data_path })
    }

    pub fn load_or_create(&self) -> Result<AppData> {
        if !self.data_path.exists() {
            let default_data = AppData::default();
            self.save(&default_data)?;
            return Ok(default_data);
        }

        let content = fs::read_to_string(&self.data_path)
            .with_context(|| format!("failed to read {}", self.data_path.display()))?;

        let app_data = serde_json::from_str::<AppData>(&content)
            .with_context(|| format!("failed to parse {}", self.data_path.display()))?;

        Ok(app_data)
    }

    pub fn save(&self, app_data: &AppData) -> Result<()> {
        let parent = self
            .data_path
            .parent()
            .context("data path missing parent directory")?;

        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;

        let temp_path = self.data_path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(app_data).context("failed to serialize app data")?;

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

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn unique_temp_file() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("ordning-json-store-{nanos}.json"))
    }

    #[test]
    fn save_then_load_round_trip() {
        let path = unique_temp_file();
        let store = JsonStore {
            data_path: path.clone(),
        };

        let original = AppData::default();
        store.save(&original).unwrap();

        let loaded = store.load_or_create().unwrap();
        assert_eq!(loaded, original);

        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }

    #[test]
    fn load_or_create_writes_default_file_when_missing() {
        let path = unique_temp_file();
        let store = JsonStore {
            data_path: path.clone(),
        };

        let loaded = store.load_or_create().unwrap();
        assert_eq!(loaded, AppData::default());
        assert!(path.exists());

        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }
}
