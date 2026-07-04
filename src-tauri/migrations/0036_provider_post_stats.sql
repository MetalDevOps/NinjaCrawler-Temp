ALTER TABLE provider_sync_post_ledger ADD COLUMN view_count INTEGER;
ALTER TABLE provider_sync_post_ledger ADD COLUMN like_count INTEGER;
ALTER TABLE provider_sync_post_ledger ADD COLUMN comment_count INTEGER;
ALTER TABLE provider_sync_post_ledger ADD COLUMN share_count INTEGER;
ALTER TABLE provider_sync_post_ledger ADD COLUMN stats_updated_at TEXT;
