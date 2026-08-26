CREATE TABLE IF NOT EXISTS legal_document_versions (
  document_key TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  canonical_content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_key, version)
);

CREATE TABLE IF NOT EXISTS merchant_pilot_acceptances (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  declaration_text TEXT NOT NULL,
  pilot_terms_version TEXT NOT NULL,
  pilot_terms_sha256 TEXT NOT NULL,
  data_processing_version TEXT NOT NULL,
  data_processing_sha256 TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_acceptance_current
  ON merchant_pilot_acceptances (
    merchant_id,
    pilot_terms_version,
    pilot_terms_sha256,
    data_processing_version,
    data_processing_sha256
  );

CREATE INDEX IF NOT EXISTS idx_pilot_acceptance_merchant_date
  ON merchant_pilot_acceptances (merchant_id, accepted_at);

CREATE TRIGGER IF NOT EXISTS legal_document_versions_no_update
BEFORE UPDATE ON legal_document_versions
BEGIN
  SELECT RAISE(ABORT, 'legal document versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS legal_document_versions_no_delete
BEFORE DELETE ON legal_document_versions
BEGIN
  SELECT RAISE(ABORT, 'legal document versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS merchant_pilot_acceptances_no_update
BEFORE UPDATE ON merchant_pilot_acceptances
BEGIN
  SELECT RAISE(ABORT, 'pilot acceptances are immutable');
END;

CREATE TRIGGER IF NOT EXISTS merchant_pilot_acceptances_no_delete
BEFORE DELETE ON merchant_pilot_acceptances
BEGIN
  SELECT RAISE(ABORT, 'pilot acceptances are immutable');
END;
