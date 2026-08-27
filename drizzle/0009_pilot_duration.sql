ALTER TABLE merchants ADD COLUMN pilot_started_at TEXT;
ALTER TABLE merchants ADD COLUMN pilot_ends_at TEXT;

UPDATE merchants
SET pilot_started_at = COALESCE(
      pilot_started_at,
      (SELECT MIN(a.accepted_at) FROM merchant_pilot_acceptances a WHERE a.merchant_id = merchants.id),
      terms_accepted_at
    ),
    pilot_ends_at = COALESCE(
      pilot_ends_at,
      datetime(COALESCE(
        (SELECT MIN(a.accepted_at) FROM merchant_pilot_acceptances a WHERE a.merchant_id = merchants.id),
        terms_accepted_at
      ), '+60 days')
    )
WHERE pilot_started_at IS NULL OR pilot_ends_at IS NULL;
