ALTER TABLE wallet_notification_campaigns ADD COLUMN request_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_notification_campaign_request
  ON wallet_notification_campaigns(merchant_id, request_key)
  WHERE request_key IS NOT NULL;
