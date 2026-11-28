-- Licence de démonstration (docs/03 §2.11) pour l'école créée par 001_demo.sql : 120 sièges.
-- Nadia (mentor@) en est propriétaire, Alice et Bob membres. Sert aussi à l'audit d'accessibilité (apps/web/a11y).
-- Rejouable : une licence déjà réglée n'est pas modifiée.
UPDATE iam.organizations
   SET licence_starts_at = '2026-09-01T00:00:00Z', licence_ends_at = '2036-08-31T23:59:59Z', updated_at = now()
 WHERE id = '00000000-0000-4000-8100-000000000001' AND licence_ends_at IS NULL;

INSERT INTO iam.memberships (organization_id, user_id, role_code) VALUES
  ('00000000-0000-4000-8100-000000000001', '00000000-0000-4000-8000-000000000004', 'org_owner'),
  ('00000000-0000-4000-8100-000000000001', '00000000-0000-4000-8000-000000000002', 'member')
ON CONFLICT DO NOTHING;
