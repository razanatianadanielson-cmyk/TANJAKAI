BEGIN;

SET search_path TO notation, public;

-- ---------------------------------------------------------------------------
-- Second facteur (TOTP) : le secret est chiffré par l'application (AES-256-GCM), jamais stocké en clair.
-- second_facteur_actif = « le compte est soumis au second facteur » (imposé à la direction et à l'administration).
-- totp_secret          = « le compte a enrôlé son application d'authentification ».
-- ---------------------------------------------------------------------------
ALTER TABLE utilisateur
    ADD COLUMN IF NOT EXISTS totp_secret          text,
    ADD COLUMN IF NOT EXISTS totp_secret_attente  text,
    ADD COLUMN IF NOT EXISTS totp_dernier_pas     bigint,
    ADD COLUMN IF NOT EXISTS mdp_modifie_le       timestamptz;

-- Codes de secours à usage unique (empreinte SHA-256 uniquement)
CREATE TABLE IF NOT EXISTS code_secours (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id  uuid NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    code_hash       text NOT NULL,
    utilise_le      timestamptz,
    UNIQUE (utilisateur_id, code_hash)
);

-- Sessions : un jeton de rafraîchissement opaque par session, stocké sous forme d'empreinte, révocable.
-- « famille » relie les jetons issus de la même connexion (rotation) : la réutilisation d'un jeton
-- déjà remplacé révoque toute la famille.
CREATE TABLE IF NOT EXISTS session_utilisateur (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id     uuid NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    famille            uuid NOT NULL,
    token_hash         text NOT NULL UNIQUE,
    cree_le            timestamptz NOT NULL DEFAULT now(),
    derniere_activite  timestamptz NOT NULL DEFAULT now(),
    expire_le          timestamptz NOT NULL,
    revoque_le         timestamptz,
    motif_revocation   text,
    remplace_par       uuid,
    ip                 text,
    user_agent         text
);
CREATE INDEX IF NOT EXISTS ix_session_utilisateur ON session_utilisateur (utilisateur_id) WHERE revoque_le IS NULL;
CREATE INDEX IF NOT EXISTS ix_session_famille ON session_utilisateur (famille);

-- Journal des connexions : append-only (aucune modification ni suppression possible)
CREATE TABLE IF NOT EXISTS journal_connexion (
    id              bigserial PRIMARY KEY,
    utilisateur_id  uuid REFERENCES utilisateur(id),
    email           text,
    evenement       text NOT NULL,
    ip              text,
    user_agent      text,
    detail          text,
    date            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_journal_connexion_date ON journal_connexion (date DESC);
CREATE INDEX IF NOT EXISTS ix_journal_connexion_user ON journal_connexion (utilisateur_id, date DESC);

CREATE OR REPLACE FUNCTION fn_journal_connexion_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Le journal des connexions est immuable' USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_journal_connexion_immuable ON journal_connexion;
CREATE TRIGGER trg_journal_connexion_immuable
    BEFORE UPDATE OR DELETE ON journal_connexion
    FOR EACH ROW EXECUTE FUNCTION fn_journal_connexion_immuable();

-- L'audit général ne doit jamais recopier les secrets du second facteur ni les empreintes de jetons
CREATE OR REPLACE FUNCTION fn_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user uuid;
    v_id   text;
    v_old  jsonb;
    v_new  jsonb;
BEGIN
    v_user := NULLIF(current_setting('app.user_id', true), '')::uuid;
    IF TG_OP IN ('UPDATE','DELETE') THEN
        v_old := to_jsonb(OLD) - 'mot_de_passe_hash' - 'empreinte_cle' - 'totp_secret' - 'totp_secret_attente' - 'totp_dernier_pas';
    END IF;
    IF TG_OP IN ('INSERT','UPDATE') THEN
        v_new := to_jsonb(NEW) - 'mot_de_passe_hash' - 'empreinte_cle' - 'totp_secret' - 'totp_secret_attente' - 'totp_dernier_pas';
    END IF;
    v_id := COALESCE(v_new->>'id', v_old->>'id', v_new->>'ponderation_critere_id', v_old->>'ponderation_critere_id',
                     concat_ws(':', COALESCE(v_new->>'campagne_id', v_old->>'campagne_id'),
                                    COALESCE(v_new->>'pole_id', v_old->>'pole_id')));
    INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id,
                               ancienne_valeur, nouvelle_valeur, motif)
    VALUES (v_user, TG_OP, TG_TABLE_NAME, v_id, v_old, v_new,
            NULLIF(current_setting('app.motif', true), ''));
    RETURN NULL;
END $$;

COMMIT;
