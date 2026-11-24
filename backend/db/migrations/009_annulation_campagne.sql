-- 009 : annulation d'une campagne ouverte par erreur.
-- Le périmètre et les cibles gelés ne se suppriment que sous le contrôle de cette fonction : elle refuse toute campagne
-- qui a déjà servi (saisie, score, synthèse). Rien d'autre ne peut défaire le gel.
CREATE OR REPLACE FUNCTION fn_annuler_campagne(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_saisies integer; v_scores integer; v_syntheses integer;
BEGIN
    SELECT count(*) INTO v_saisies FROM saisie WHERE campagne_id = p_id;
    SELECT count(*) INTO v_scores FROM score_pole WHERE campagne_id = p_id;
    SELECT count(*) INTO v_syntheses FROM synthese_trimestrielle WHERE campagne_id = p_id;
    IF v_saisies + v_scores + v_syntheses > 0 THEN
        RAISE EXCEPTION 'Campagne déjà utilisée : annulation impossible' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.ouverture', 'on', true);
    DELETE FROM notification WHERE campagne_id = p_id;
    DELETE FROM campagne WHERE id = p_id;
    PERFORM set_config('app.ouverture', '', true);
END $$;
