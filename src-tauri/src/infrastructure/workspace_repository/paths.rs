use super::*;

pub(super) fn source_media_output_root(layout: &StorageLayout, source: &SourceProfile) -> PathBuf {
    resolved_source_media_output_root_for_provider(layout, &source.provider, &source.handle, None)
}
pub(super) fn resolved_source_media_output_root_for_provider(
    layout: &StorageLayout,
    provider: &str,
    handle: &str,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    if provider.eq_ignore_ascii_case("instagram") {
        return resolve_instagram_profile_root_for_account(
            layout,
            &sanitize_source_handle("instagram", handle),
            settings,
        );
    }

    layout
        .media_root
        .join(sanitize_path_segment(provider))
        .join(sanitize_path_segment(handle))
}
pub(super) fn resolved_source_media_output_root(
    layout: &StorageLayout,
    source: &SourceProfile,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    if source.provider.eq_ignore_ascii_case("instagram") {
        let options = source_instagram_sync_options(source);
        return resolve_instagram_profile_root_with_options(
            layout,
            source,
            settings,
            Some(&options),
        );
    }

    if source.provider.eq_ignore_ascii_case("twitter") {
        return resolve_twitter_profile_root(layout, source, settings);
    }

    if source.provider.eq_ignore_ascii_case("tiktok") {
        return resolve_tiktok_profile_root(layout, source, settings);
    }

    resolved_source_media_output_root_for_provider(
        layout,
        &source.provider,
        &source.handle,
        settings,
    )
}
/// Resolve a pasta de mídia de um perfil TikTok: specialPath (absoluto, por
/// perfil) > `tiktok.account.mediaPath` da conta + handle > media_root global.
pub(super) fn resolve_tiktok_profile_root(
    layout: &StorageLayout,
    source: &SourceProfile,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    let options = source_tiktok_sync_options(source);
    if let Some(special) = options
        .special_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(special);
    }

    let sanitized_handle = sanitize_source_handle("tiktok", &source.handle);
    if let Some(media_path) =
        settings.and_then(|map| setting_value(map, "tiktok.account.mediaPath"))
    {
        return PathBuf::from(media_path).join(&sanitized_handle);
    }

    layout
        .media_root
        .join(sanitize_path_segment("tiktok"))
        .join(sanitize_path_segment(&sanitized_handle))
}
/// Resolve a pasta de mídia de um perfil Twitter: specialPath (absoluto, por
/// perfil) > `twitter.account.mediaPath` da conta + handle > media_root global
/// + twitter + handle.
pub(super) fn resolve_twitter_profile_root(
    layout: &StorageLayout,
    source: &SourceProfile,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    let options = source_twitter_sync_options(source);
    if let Some(special) = options
        .special_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(special);
    }

    let sanitized_handle = sanitize_source_handle("twitter", &source.handle);
    if let Some(media_path) =
        settings.and_then(|map| setting_value(map, "twitter.account.mediaPath"))
    {
        return PathBuf::from(media_path).join(&sanitized_handle);
    }

    layout
        .media_root
        .join(sanitize_path_segment("twitter"))
        .join(sanitize_path_segment(&sanitized_handle))
}
pub(super) fn resolved_source_media_output_root_with_connection(
    connection: &Connection,
    layout: &StorageLayout,
    source: &SourceProfile,
) -> Result<PathBuf, String> {
    let account_settings = source
        .account_id
        .as_deref()
        .map(|id| load_provider_account_settings_map(connection, id))
        .transpose()?;
    Ok(resolved_source_media_output_root(
        layout,
        source,
        account_settings.as_ref(),
    ))
}
pub(super) fn instagram_media_base_root(
    layout: &StorageLayout,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    settings
        .and_then(|values| setting_value(values, "instagram.account.mediaPath"))
        .map(PathBuf::from)
        .unwrap_or_else(|| layout.media_root.join("instagram"))
}
pub(super) fn resolve_instagram_profile_root_with_options(
    layout: &StorageLayout,
    source: &SourceProfile,
    settings: Option<&HashMap<String, String>>,
    options: Option<&InstagramSourceSyncOptions>,
) -> PathBuf {
    if let Some(path_override) = options.and_then(instagram_special_path) {
        let override_path = PathBuf::from(path_override);
        if override_path.is_absolute() {
            return override_path;
        }

        return instagram_media_base_root(layout, settings).join(override_path);
    }

    resolve_instagram_profile_root_for_account(
        layout,
        &sanitize_source_handle("instagram", &source.handle),
        settings,
    )
}
pub(super) fn resolve_instagram_profile_root_for_account(
    layout: &StorageLayout,
    handle: &str,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    let sanitized_handle = sanitize_path_segment(handle.trim().trim_start_matches('@'));
    instagram_media_base_root(layout, settings).join(sanitized_handle)
}
pub(super) fn resolve_instagram_saved_posts_root(
    layout: &StorageLayout,
    settings: Option<&HashMap<String, String>>,
) -> PathBuf {
    settings
        .and_then(|values| setting_value(values, "instagram.account.savedPostsPath"))
        .map(PathBuf::from)
        .unwrap_or_else(|| instagram_media_base_root(layout, settings).join("!Saved"))
}
pub(super) fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .trim()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            value if value.is_control() => '_',
            value => value,
        })
        .collect::<String>();

    if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    }
}
pub(super) fn normalize_instagram_relative_media_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
        .trim()
        .trim_start_matches('/')
        .to_ascii_lowercase()
}
