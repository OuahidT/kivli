ALTER TABLE wallet_notification_settings ADD COLUMN near_reward_message TEXT NOT NULL DEFAULT 'Plus que {reste} {unité} avant votre prochaine récompense 🎁';
ALTER TABLE wallet_notification_settings ADD COLUMN reactivation_message TEXT NOT NULL DEFAULT 'Cela fait un moment — {commerce} serait ravi de vous revoir 🧡';
ALTER TABLE wallet_notification_settings ADD COLUMN nearby_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_notification_settings ADD COLUMN nearby_address TEXT;
ALTER TABLE wallet_notification_settings ADD COLUMN nearby_latitude REAL;
ALTER TABLE wallet_notification_settings ADD COLUMN nearby_longitude REAL;
ALTER TABLE wallet_notification_settings ADD COLUMN nearby_relevant_text TEXT NOT NULL DEFAULT 'Votre carte est disponible à proximité.';
ALTER TABLE wallet_notification_settings ADD COLUMN nearby_location_confirmed_at TEXT;

CREATE TABLE IF NOT EXISTS wallet_geocoding_rate_limit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_allowed_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'
);

INSERT OR IGNORE INTO wallet_geocoding_rate_limit (id) VALUES (1);
