use std::sync::Mutex;

use crate::models::AppData;
use crate::storage::json_store::JsonStore;

pub struct AppState {
    pub data: Mutex<AppData>,
    pub persisted: Mutex<AppData>,
    pub store: JsonStore,
}
