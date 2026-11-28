-- Notifications par e-mail (docs/03 §2.9). Une ligne channel = 'email' est une notification à
-- envoyer : sent_at reste vide tant qu'elle n'est pas partie. Les essais ratés sont espacés et
-- limités ; aucun message d'erreur n'est gardé (il pourrait contenir l'adresse).
ALTER TABLE notification.notifications ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
ALTER TABLE notification.notifications ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS notifications_email_pending_idx ON notification.notifications (next_attempt_at NULLS FIRST, created_at)
  WHERE channel = 'email' AND sent_at IS NULL;
