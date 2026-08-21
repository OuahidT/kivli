ALTER TABLE merchants ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE merchants ADD COLUMN terms_version TEXT;

ALTER TABLE customers ADD COLUMN marketing_consent_version TEXT;
ALTER TABLE customers ADD COLUMN marketing_consent_source TEXT;
ALTER TABLE customers ADD COLUMN marketing_withdrawn_at TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_marketing_consent ON customers(merchant_id, marketing_consent);
