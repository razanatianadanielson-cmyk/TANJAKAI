BEGIN;

SET search_path TO notation, public;

ALTER TABLE critere
    ADD COLUMN valeur_min numeric,
    ADD COLUMN valeur_max numeric,
    ADD COLUMN variation_max_pct numeric;

ALTER TABLE piece_justificative
    ADD COLUMN taille_octets integer NOT NULL DEFAULT 0,
    ADD COLUMN depose_par uuid REFERENCES utilisateur(id),
    ADD COLUMN depose_le timestamptz NOT NULL DEFAULT now();

ALTER TABLE notification
    ALTER COLUMN alerte_id DROP NOT NULL,
    ADD COLUMN saisie_id uuid REFERENCES saisie(id);

CREATE INDEX IF NOT EXISTS ix_notification_saisie
    ON notification (saisie_id);

CREATE OR REPLACE FUNCTION fn_saisie_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.statut IS DISTINCT FROM OLD.statut THEN
        IF NOT (
            (OLD.statut = 'BROUILLON' AND NEW.statut = 'SOUMISE')
            OR
            (OLD.statut = 'SOUMISE' AND NEW.statut IN ('VALIDEE', 'RENVOYEE'))
            OR
            (OLD.statut = 'VALIDEE' AND NEW.statut = 'RENVOYEE')
            OR
            (OLD.statut = 'RENVOYEE' AND NEW.statut IN ('SOUMISE', 'BROUILLON'))
        ) THEN
            RAISE EXCEPTION
                'Transition de statut interdite : % -> %',
                OLD.statut,
                NEW.statut
                USING ERRCODE = 'check_violation';
        END IF;

    ELSIF OLD.statut IN ('SOUMISE', 'VALIDEE')
        AND (
            NEW.valeur_realisee IS DISTINCT FROM OLD.valeur_realisee
            OR NEW.commentaire IS DISTINCT FROM OLD.commentaire
            OR NEW.motif_non_renseigne IS DISTINCT FROM OLD.motif_non_renseigne
        ) THEN
        RAISE EXCEPTION
            'Saisie soumise ou validee : valeur et commentaire non modifiables'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saisie_transition ON saisie;

CREATE TRIGGER trg_saisie_transition
    BEFORE UPDATE ON saisie
    FOR EACH ROW
    EXECUTE FUNCTION fn_saisie_transition();

CREATE OR REPLACE FUNCTION fn_piece_editable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_saisie uuid;
    v_statut statut_saisie;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_saisie := OLD.saisie_id;
    ELSE
        v_saisie := NEW.saisie_id;
    END IF;

    SELECT statut
    INTO v_statut
    FROM saisie
    WHERE id = v_saisie;

    IF v_statut IN ('SOUMISE', 'VALIDEE') THEN
        RAISE EXCEPTION
            'Pieces non modifiables sur une saisie soumise ou validee'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_piece_editable ON piece_justificative;

CREATE TRIGGER trg_piece_editable
    BEFORE INSERT OR UPDATE OR DELETE
    ON piece_justificative
    FOR EACH ROW
    EXECUTE FUNCTION fn_piece_editable();

COMMIT;
