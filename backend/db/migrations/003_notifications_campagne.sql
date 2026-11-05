BEGIN;

SET search_path TO notation, public;

-- Notifications liées à une campagne (ouverture, rappel, réouverture)
ALTER TABLE notification
    ADD COLUMN IF NOT EXISTS campagne_id uuid REFERENCES campagne(id);

CREATE INDEX IF NOT EXISTS ix_notification_campagne ON notification (campagne_id);

ALTER TABLE notification
    DROP CONSTRAINT IF EXISTS ck_notification_objet;
ALTER TABLE notification
    ADD CONSTRAINT ck_notification_objet
    CHECK (alerte_id IS NOT NULL OR saisie_id IS NOT NULL OR campagne_id IS NOT NULL);

COMMIT;
