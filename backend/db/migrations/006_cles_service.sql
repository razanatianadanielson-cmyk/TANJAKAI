BEGIN;

SET search_path TO notation, public;

-- Gestion des clés de service : repère non secret (début de la clé) et traçabilité de la révocation.
ALTER TABLE cle_service
    ADD COLUMN IF NOT EXISTS prefixe         text,
    ADD COLUMN IF NOT EXISTS date_revocation timestamptz,
    ADD COLUMN IF NOT EXISTS revoquee_par    uuid REFERENCES utilisateur(id);

-- Mémoire d'idempotence de l'API : chaque Idempotency-Key utilisée est conservée, même après correction de la saisie,
-- afin qu'un renvoi tardif d'une ancienne requête ne réécrive jamais une valeur plus récente.
CREATE TABLE IF NOT EXISTS idempotence_service (
    cle_service_id  uuid NOT NULL REFERENCES cle_service(id),
    cle_idempotence text NOT NULL,
    saisie_id       uuid NOT NULL REFERENCES saisie(id) ON DELETE CASCADE,
    date_creation   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cle_service_id, cle_idempotence)
);
CREATE INDEX IF NOT EXISTS ix_idempotence_saisie ON idempotence_service (saisie_id);

COMMIT;
