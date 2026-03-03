use aes_gcm::{
    aead::{
        rand_core::{OsRng, RngCore},
        Aead, AeadCore, KeyInit,
    },
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Context, Result};
use argon2::{Algorithm, Argon2, ParamsBuilder, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use zeroize::Zeroize;

use crate::models::AppData;

pub const ENCRYPTED_FORMAT: &str = "ordning-encrypted-1";

const AES_ALGORITHM: &str = "aes-256-gcm";
const ARGON2_ALGORITHM: &str = "argon2id";
const ARGON2_M_COST: u32 = 65_536;
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 1;
const ARGON2_VERSION: u32 = 19;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EncryptedEnvelope {
    pub format: String,
    pub kdf: KdfMetadata,
    pub cipher: CipherMetadata,
    pub ciphertext_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KdfMetadata {
    pub algorithm: String,
    pub version: u32,
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    pub salt_b64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CipherMetadata {
    pub algorithm: String,
    pub nonce_b64: String,
}

pub struct EncryptionContext {
    key_material: [u8; KEY_LEN],
    kdf: KdfMetadata,
}

impl EncryptionContext {
    pub fn derive_new(password: &str) -> Result<Self> {
        let kdf = KdfMetadata::new_random()?;
        let key_material = derive_key_material(password, &kdf)?;
        Ok(Self { key_material, kdf })
    }

    pub fn unlock(envelope: &EncryptedEnvelope, password: &str) -> Result<(Self, AppData)> {
        envelope.validate()?;
        let key_material = derive_key_material(password, &envelope.kdf)?;
        let context = Self {
            key_material,
            kdf: envelope.kdf.clone(),
        };
        let app_data = context.decrypt_json(envelope, "decrypted app data")?;
        Ok((context, app_data))
    }

    pub fn encrypt(&self, app_data: &AppData) -> Result<EncryptedEnvelope> {
        self.encrypt_json(app_data, "encrypted app data")
    }

    pub fn encrypt_json<T: Serialize>(&self, value: &T, label: &str) -> Result<EncryptedEnvelope> {
        let mut plaintext = serde_json::to_vec_pretty(value)
            .with_context(|| format!("failed to serialize {label}"))?;
        let envelope = self.encrypt_bytes(&plaintext)?;
        plaintext.zeroize();
        Ok(envelope)
    }

    pub fn decrypt_json<T: DeserializeOwned>(
        &self,
        envelope: &EncryptedEnvelope,
        label: &str,
    ) -> Result<T> {
        let mut plaintext = self.decrypt_bytes(envelope)?;
        let value = serde_json::from_slice::<T>(&plaintext)
            .with_context(|| format!("failed to parse {label}"))?;
        plaintext.zeroize();
        Ok(value)
    }

    pub fn decrypt_json_with_password<T: DeserializeOwned>(
        envelope: &EncryptedEnvelope,
        password: &str,
        label: &str,
    ) -> Result<T> {
        envelope.validate()?;
        let key_material = derive_key_material(password, &envelope.kdf)?;
        let context = Self {
            key_material,
            kdf: envelope.kdf.clone(),
        };
        context.decrypt_json(envelope, label)
    }

    pub fn verify_password(&self, password: &str) -> Result<bool> {
        let mut candidate = derive_key_material(password, &self.kdf)?;
        let is_match = candidate == self.key_material;
        candidate.zeroize();
        Ok(is_match)
    }

    fn encrypt_bytes(&self, plaintext: &[u8]) -> Result<EncryptedEnvelope> {
        let cipher = self.cipher()?;
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, plaintext)
            .map_err(|_| anyhow!("failed to encrypt data"))?;

        Ok(EncryptedEnvelope {
            format: ENCRYPTED_FORMAT.to_owned(),
            kdf: self.kdf.clone(),
            cipher: CipherMetadata {
                algorithm: AES_ALGORITHM.to_owned(),
                nonce_b64: STANDARD.encode(nonce.as_slice()),
            },
            ciphertext_b64: STANDARD.encode(ciphertext),
        })
    }

    fn decrypt_bytes(&self, envelope: &EncryptedEnvelope) -> Result<Vec<u8>> {
        let cipher = self.cipher()?;
        let nonce = envelope.cipher.decode_nonce()?;
        let mut ciphertext = decode_base64(&envelope.ciphertext_b64, "ciphertext")?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| anyhow!("invalid password or corrupted encrypted data"))?;
        ciphertext.zeroize();
        Ok(plaintext)
    }

    fn cipher(&self) -> Result<Aes256Gcm> {
        Aes256Gcm::new_from_slice(&self.key_material)
            .map_err(|_| anyhow!("invalid AES-256-GCM key"))
    }
}

impl Drop for EncryptionContext {
    fn drop(&mut self) {
        self.key_material.zeroize();
    }
}

impl KdfMetadata {
    fn new_random() -> Result<Self> {
        let mut salt = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut salt);

        Ok(Self {
            algorithm: ARGON2_ALGORITHM.to_owned(),
            version: ARGON2_VERSION,
            m_cost: ARGON2_M_COST,
            t_cost: ARGON2_T_COST,
            p_cost: ARGON2_P_COST,
            salt_b64: STANDARD.encode(salt),
        })
    }

    fn params(&self) -> Result<argon2::Params> {
        if self.algorithm != ARGON2_ALGORITHM {
            return Err(anyhow!("unsupported KDF algorithm '{}'", self.algorithm));
        }
        if self.version != ARGON2_VERSION {
            return Err(anyhow!("unsupported Argon2 version '{}'", self.version));
        }

        let mut builder = ParamsBuilder::new();
        builder.m_cost(self.m_cost);
        builder.t_cost(self.t_cost);
        builder.p_cost(self.p_cost);
        builder.output_len(KEY_LEN);
        builder
            .build()
            .map_err(|err| anyhow!("invalid Argon2 parameters: {err}"))
    }

    fn decode_salt(&self) -> Result<[u8; SALT_LEN]> {
        let salt = decode_fixed::<SALT_LEN>(&self.salt_b64, "salt")?;
        Ok(salt)
    }
}

impl CipherMetadata {
    fn decode_nonce(&self) -> Result<[u8; 12]> {
        if self.algorithm != AES_ALGORITHM {
            return Err(anyhow!("unsupported cipher algorithm '{}'", self.algorithm));
        }

        decode_fixed::<12>(&self.nonce_b64, "nonce")
    }
}

impl EncryptedEnvelope {
    pub fn validate(&self) -> Result<()> {
        if self.format != ENCRYPTED_FORMAT {
            return Err(anyhow!("unsupported encrypted format '{}'", self.format));
        }

        self.kdf.params()?;
        self.kdf.decode_salt()?;
        self.cipher.decode_nonce()?;
        decode_base64(&self.ciphertext_b64, "ciphertext")?;
        Ok(())
    }
}

fn derive_key_material(password: &str, kdf: &KdfMetadata) -> Result<[u8; KEY_LEN]> {
    let params = kdf.params()?;
    let salt = kdf.decode_salt()?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key_material = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), &salt, &mut key_material)
        .map_err(|err| anyhow!("failed to derive encryption key: {err}"))?;
    Ok(key_material)
}

fn decode_fixed<const N: usize>(value: &str, label: &str) -> Result<[u8; N]> {
    let decoded = decode_base64(value, label)?;
    if decoded.len() != N {
        return Err(anyhow!(
            "{label} length mismatch: expected {N} bytes, found {}",
            decoded.len()
        ));
    }

    let mut bytes = [0u8; N];
    bytes.copy_from_slice(&decoded);
    Ok(bytes)
}

fn decode_base64(value: &str, label: &str) -> Result<Vec<u8>> {
    STANDARD
        .decode(value)
        .with_context(|| format!("failed to decode {label}"))
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, NaiveTime};
    use uuid::Uuid;

    use super::*;
    use crate::models::{AppSettings, Calendar, Event};

    fn sample_app_data() -> AppData {
        let calendar_id = Uuid::new_v4();
        AppData {
            version: 1,
            settings: AppSettings {
                lang: "en".to_owned(),
                timezone: "Europe/Stockholm".to_owned(),
            },
            lang: "sv".to_owned(),
            calendars: vec![Calendar {
                id: calendar_id,
                name: "Work".to_owned(),
                color: "#007aff".to_owned(),
                group: Some("Team".to_owned()),
                visible: true,
                created_at: "2026-03-03T08:00:00Z".to_owned(),
                updated_at: "2026-03-03T08:00:00Z".to_owned(),
            }],
            events: vec![Event {
                id: Uuid::new_v4(),
                calendar_id,
                title: "Planning".to_owned(),
                start_date: NaiveDate::from_ymd_opt(2026, 3, 3).expect("valid date"),
                end_date: NaiveDate::from_ymd_opt(2026, 3, 3).expect("valid date"),
                start_time: Some(NaiveTime::from_hms_opt(9, 0, 0).expect("valid time")),
                end_time: Some(NaiveTime::from_hms_opt(10, 0, 0).expect("valid time")),
                all_day: false,
                description_private: "private".to_owned(),
                description_public: "public".to_owned(),
                location: Some("Room A".to_owned()),
                recurrence: None,
                recurrence_parent_id: None,
                created_at: "2026-03-03T08:00:00Z".to_owned(),
                updated_at: "2026-03-03T08:00:00Z".to_owned(),
            }],
        }
    }

    #[test]
    fn encrypt_then_unlock_round_trip() {
        let app_data = sample_app_data();
        let context = EncryptionContext::derive_new("top secret").expect("derive key");
        let envelope = context.encrypt(&app_data).expect("encrypt data");

        let (_, decrypted) = EncryptionContext::unlock(&envelope, "top secret").expect("unlock");

        assert_eq!(decrypted, app_data);
        assert_eq!(envelope.format, ENCRYPTED_FORMAT);
        assert_eq!(envelope.kdf.algorithm, ARGON2_ALGORITHM);
        assert_eq!(envelope.kdf.version, ARGON2_VERSION);
        assert_eq!(envelope.kdf.m_cost, ARGON2_M_COST);
        assert_eq!(envelope.kdf.t_cost, ARGON2_T_COST);
        assert_eq!(envelope.kdf.p_cost, ARGON2_P_COST);
        assert_eq!(envelope.cipher.algorithm, AES_ALGORITHM);
    }

    #[test]
    fn unlock_rejects_wrong_password() {
        let context = EncryptionContext::derive_new("top secret").expect("derive key");
        let envelope = context
            .encrypt(&sample_app_data())
            .expect("encrypt sample data");

        let error = match EncryptionContext::unlock(&envelope, "wrong password") {
            Ok(_) => panic!("wrong password should fail"),
            Err(error) => error,
        };

        assert!(error.to_string().contains("invalid password"));
    }
}
