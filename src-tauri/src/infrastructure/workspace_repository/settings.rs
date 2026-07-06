use super::*;

pub fn upsert_app_setting(input: AppSettingUpsert) -> Result<WorkspaceSnapshot, String> {
    with_workspace(|connection, layout| {
        let now = now_timestamp();
        connection
            .execute(
                "INSERT INTO app_settings (key, value, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = excluded.updated_at",
                params![input.key, input.value, now],
            )
            .map_err(|error| error.to_string())?;
        load_snapshot(connection, layout)
    })
}
pub(super) fn load_app_setting_value(
    connection: &Connection,
    key: &str,
) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1 LIMIT 1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}
pub(super) fn migrate_media_root_setting_to_scrawler_pattern(
    connection: &Connection,
) -> Result<(), String> {
    let scrawler_media_root = PathBuf::from(r"F:\SCrawler\Data");
    if !scrawler_media_root.exists() {
        return Ok(());
    }

    let Some(current_value) = load_app_setting_value(connection, "storage.media_root")? else {
        return Ok(());
    };
    let current_trimmed = current_value.trim();
    if current_trimmed.is_empty() {
        return Ok(());
    }

    let Some(user_profile) = std::env::var_os("USERPROFILE").map(PathBuf::from) else {
        return Ok(());
    };
    let legacy_default = user_profile.join("Pictures").join("NinjaCrawler");
    if !paths_match_case_insensitive(&PathBuf::from(current_trimmed), &legacy_default) {
        return Ok(());
    }

    connection
        .execute(
            "UPDATE app_settings
             SET value = ?2, updated_at = ?3
             WHERE key = ?1",
            params![
                "storage.media_root",
                scrawler_media_root.display().to_string(),
                now_timestamp()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
pub(super) fn parse_bool_setting_from_keys(
    settings: &HashMap<String, String>,
    keys: &[&str],
    default: bool,
) -> bool {
    for key in keys {
        if let Some(raw) = settings.get(*key) {
            return parse_bool_setting(Some(raw.as_str()), default);
        }
    }

    default
}
pub(super) fn parse_u64_provider_setting(
    settings: &HashMap<String, String>,
    key: &str,
    default: u64,
) -> u64 {
    settings
        .get(key)
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}
pub(super) fn upsert_app_setting_value(
    connection: &Connection,
    key: &str,
    value: &str,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at",
            params![key, value, now_timestamp()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
pub(super) fn load_app_settings_map(
    connection: &Connection,
) -> Result<HashMap<String, String>, String> {
    Ok(load_app_settings(connection)?
        .into_iter()
        .map(|setting| (setting.key, setting.value))
        .collect())
}
pub(super) fn parse_bool_setting(value: Option<&str>, default: bool) -> bool {
    value
        .map(|raw| match raw.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => true,
            "0" | "false" | "no" | "off" => false,
            _ => default,
        })
        .unwrap_or(default)
}
pub(super) fn bool_setting_value(value: bool) -> &'static str {
    if value {
        "true"
    } else {
        "false"
    }
}
pub(super) fn setting_value(settings: &HashMap<String, String>, key: &str) -> Option<String> {
    settings
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
pub(super) fn migrate_legacy_setting_keys(connection: &Connection) -> Result<(), String> {
    let mappings = [
        ("yt_dlp_path", "tool.yt-dlp.path"),
        ("gallery_dl_path", "tool.gallery-dl.path"),
        ("media_root", "storage.media_root"),
        ("notification_mode", "policy.notifications.default"),
    ];

    for (legacy_key, canonical_key) in mappings {
        let legacy_value = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1 LIMIT 1",
                params![legacy_key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        let Some(value) = legacy_value else {
            continue;
        };

        let now = now_timestamp();
        connection
            .execute(
                "INSERT INTO app_settings (key, value, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = excluded.updated_at",
                params![canonical_key, value, now],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "DELETE FROM app_settings WHERE key = ?1",
                params![legacy_key],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}
pub(super) fn seed_missing_app_settings(
    connection: &Connection,
    layout: &StorageLayout,
) -> Result<(), String> {
    let now = now_timestamp();
    let defaults = [
        ("tool.yt-dlp.path", "yt-dlp".to_string()),
        ("tool.gallery-dl.path", "gallery-dl".to_string()),
        ("tool.instaloader.path", "instaloader".to_string()),
        ("policy.notifications.default", "summary".to_string()),
        (
            "naming.instagram.media_file_pattern_mode",
            "preset_new_default".to_string(),
        ),
        (
            "naming.instagram.media_file_pattern_template",
            "{datetime} {provider_media_key}.{ext}".to_string(),
        ),
        (DESKTOP_CLOSE_TO_TRAY_SETTING_KEY, "true".to_string()),
        (DESKTOP_SILENT_MODE_SETTING_KEY, "false".to_string()),
        ("policy.session_import.enabled", "true".to_string()),
        (DUPLICATE_USER_ID_BLOCK_SETTING_KEY, "true".to_string()),
        (SYNC_DELAY_BETWEEN_PROFILES_SETTING_KEY, "0".to_string()),
        (
            "instagram.sync.globalPreset1",
            r#"{"enabled":false,"label":"Preset 1","sections":{"timeline":true,"reels":false,"stories":false,"storiesUser":false,"tagged":false}}"#
                .to_string(),
        ),
        (
            "instagram.sync.globalPreset2",
            r#"{"enabled":false,"label":"Preset 2","sections":{"timeline":true,"reels":false,"stories":false,"storiesUser":false,"tagged":false}}"#
                .to_string(),
        ),
        (
            "storage.media_root",
            layout.media_root.display().to_string(),
        ),
    ];

    for (key, value) in defaults {
        connection
            .execute(
                "INSERT INTO app_settings (key, value, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO NOTHING",
                params![key, value, now.clone()],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}
pub(super) fn load_app_settings(connection: &Connection) -> Result<Vec<AppSetting>, String> {
    let mut statement = connection
        .prepare("SELECT key, value FROM app_settings ORDER BY key")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(AppSetting {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}
