BEGIN;

SET search_path TO notation, public;

-- Synthèses assistées (2.5.3 / 4.3) : traçabilité de ce qui a été envoyé, du mode (assisté / dégradé) et de la relecture.
ALTER TABLE synthese_trimestrielle
    ADD COLUMN IF NOT EXISTS donnees           jsonb,         -- faits chiffrés agrégés (c'est tout ce que reçoit le service d'assistance)
    ADD COLUMN IF NOT EXISTS mode              text NOT NULL DEFAULT 'DEGRADE',
    ADD COLUMN IF NOT EXISTS motif_degrade     text,
    ADD COLUMN IF NOT EXISTS modele            text,
    ADD COLUMN IF NOT EXISTS contenu_origine   text,          -- texte tel que produit, avant relecture
    ADD COLUMN IF NOT EXISTS genere_par        uuid REFERENCES utilisateur(id),
    ADD COLUMN IF NOT EXISTS modifie_par       uuid REFERENCES utilisateur(id),
    ADD COLUMN IF NOT EXISTS date_modification timestamptz;

ALTER TABLE synthese_trimestrielle
    DROP CONSTRAINT IF EXISTS ck_synthese_mode;
ALTER TABLE synthese_trimestrielle
    ADD CONSTRAINT ck_synthese_mode CHECK (mode IN ('ASSISTE','DEGRADE'));

-- Une seule synthèse en brouillon par campagne et par pôle (ou comparative)
CREATE UNIQUE INDEX IF NOT EXISTS ux_synthese_brouillon
    ON synthese_trimestrielle (campagne_id, type, COALESCE(pole_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE statut = 'BROUILLON';

-- Aucune publication automatique : seule la relecture du contrôle de gestion valide, et une synthèse validée ne bouge plus.
CREATE OR REPLACE FUNCTION fn_synthese_controles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE','DELETE') AND OLD.statut = 'VALIDEE' THEN
        RAISE EXCEPTION 'Synthèse validée : modification interdite' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.statut = 'VALIDEE' AND NOT EXISTS (
        SELECT 1 FROM utilisateur WHERE id = NEW.valide_par AND role = 'CONTROLE_GESTION') THEN
        RAISE EXCEPTION 'Seul le contrôle de gestion valide une synthèse' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_synthese_controles ON synthese_trimestrielle;
CREATE TRIGGER trg_synthese_controles
    BEFORE UPDATE OR DELETE OR INSERT ON synthese_trimestrielle
    FOR EACH ROW EXECUTE FUNCTION fn_synthese_controles();

CREATE INDEX IF NOT EXISTS ix_cout_ia_date ON journal_cout_ia (date DESC);

COMMIT;
