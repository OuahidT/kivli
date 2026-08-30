ALTER TABLE merchants ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;

UPDATE merchants
SET is_demo = 1
WHERE id = 'm_demo_kivli'
  AND business_name = 'Kivli Demo'
  AND email = 'demo@kivli.fr';
