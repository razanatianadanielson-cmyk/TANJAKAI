-- =============================================================================
--  TANJAKAI — Plateforme de Suivi et de Notation Pondérée des Pôles
--  Schéma PostgreSQL (>= 13) dérivé du diagramme de classes
--
--  Conventions
--   * tables et colonnes en snake_case, clés primaires uuid (gen_random_uuid)
--   * composition UML (losange plein)  -> clé étrangère ON DELETE CASCADE
--   * association simple               -> clé étrangère ON DELETE RESTRICT
--   * « MoteurNotation » est un service applicatif : il n'a pas de table
--   * ouverture de campagne : SELECT fn_ouvrir_campagne(exercice, trimestre, grille, date_limite, user)
--     (gèle la grille, le périmètre des pôles et les cibles)
--   * contexte applicatif à positionner par transaction (pour l'audit) :
--         SET LOCAL app.user_id = '<uuid de l'utilisateur>';
--         SET LOCAL app.motif   = '<motif de la dérogation>';
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- fonctions de hachage / uuid
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- contrainte d'exclusion sur les périodes
CREATE EXTENSION IF NOT EXISTS citext;       -- e-mail insensible à la casse

CREATE SCHEMA IF NOT EXISTS notation;
SET search_path TO notation, public;

-- =============================================================================
-- 1. TYPES ÉNUMÉRÉS
-- =============================================================================
CREATE TYPE role_utilisateur   AS ENUM ('RESPONSABLE_POLE','CONTROLE_GESTION','DIRECTION_GENERALE','ADMINISTRATEUR');
CREATE TYPE statut_pole        AS ENUM ('ACTIF','SUSPENDU');
CREATE TYPE type_axe           AS ENUM ('FINANCIER','HUMAIN','QUALITE');
CREATE TYPE sens_optimisation  AS ENUM ('MAXIMISER','MINIMISER');
CREATE TYPE statut_grille      AS ENUM ('BROUILLON','VALIDEE');
CREATE TYPE statut_campagne    AS ENUM ('OUVERTE','CLOTUREE','ROUVERTE');
CREATE TYPE statut_saisie      AS ENUM ('BROUILLON','SOUMISE','RENVOYEE','VALIDEE');
CREATE TYPE source_saisie      AS ENUM ('ESPACE','API');
CREATE TYPE type_alerte        AS ENUM ('VIGILANCE','DIRECTION','DEGRADATION');
CREATE TYPE statut_alerte      AS ENUM ('ACTIVE','ACCUSEE','CLOTUREE');
CREATE TYPE statut_plan        AS ENUM ('A_FAIRE','EN_COURS','TERMINE');
CREATE TYPE canal_notification AS ENUM ('APPLICATION','EMAIL');
CREATE TYPE type_synthese      AS ENUM ('POLE','COMPARATIVE');
CREATE TYPE statut_synthese    AS ENUM ('BROUILLON','VALIDEE');

-- =============================================================================
-- 2. MODULE 2.6 — SÉCURITÉ
-- =============================================================================
CREATE TABLE utilisateur (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                   text        NOT NULL,
    prenom                text        NOT NULL,
    email                 citext      NOT NULL UNIQUE,
    mot_de_passe_hash     text        NOT NULL,                  -- jamais de mot de passe en clair
    role                  role_utilisateur NOT NULL,
    actif                 boolean     NOT NULL DEFAULT true,
    second_facteur_actif  boolean     NOT NULL DEFAULT false,
    tentatives_echec      integer     NOT NULL DEFAULT 0 CHECK (tentatives_echec >= 0),
    verrouille_jusqua     timestamptz,
    cree_le               timestamptz NOT NULL DEFAULT now(),
    -- 2FA obligatoire pour la direction et l'administration (compte actif)
    CONSTRAINT ck_utilisateur_2fa CHECK (
        role NOT IN ('DIRECTION_GENERALE','ADMINISTRATEUR') OR NOT actif OR second_facteur_actif
    )
);

-- =============================================================================
-- 3. MODULE 2.1 — RÉFÉRENTIEL DES PÔLES
-- =============================================================================
CREATE TABLE famille_activite (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    libelle      text NOT NULL UNIQUE,
    description  text
);

CREATE TABLE pole (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code               text        NOT NULL UNIQUE,
    intitule           text        NOT NULL,
    famille_id         uuid        NOT NULL REFERENCES famille_activite(id),
    responsable_id     uuid        REFERENCES utilisateur(id),   -- association « responsable »
    effectif           integer     CHECK (effectif >= 0),
    implantation       text,
    date_rattachement  date        NOT NULL,
    statut             statut_pole NOT NULL DEFAULT 'ACTIF'
);

CREATE TABLE suspension_pole (                                    -- composition Pole ◆— SuspensionPole
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pole_id     uuid NOT NULL REFERENCES pole(id) ON DELETE CASCADE,
    motif       text NOT NULL,
    date_debut  date NOT NULL,
    date_fin    date NOT NULL,
    CONSTRAINT ck_suspension_dates CHECK (date_fin >= date_debut),
    CONSTRAINT ex_suspension_chevauchement
        EXCLUDE USING gist (pole_id WITH =, daterange(date_debut, date_fin, '[]') WITH &&)
);

CREATE TABLE cle_service (                                        -- clés dédiées aux systèmes clients
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pole_id        uuid NOT NULL REFERENCES pole(id),
    libelle        text,
    empreinte_cle  text NOT NULL UNIQUE,                          -- empreinte (hash) de la clé, jamais la clé
    droits         text[] NOT NULL DEFAULT ARRAY['saisie:ecriture'],
    active         boolean NOT NULL DEFAULT true,
    date_creation  timestamptz NOT NULL DEFAULT now(),
    -- droits limités à l'écriture des saisies du pôle
    CONSTRAINT ck_cle_service_droits CHECK (droits <@ ARRAY['saisie:ecriture']::text[])
);

-- =============================================================================
-- 4. MODULE 2.1 — AXES, CRITÈRES, GRILLE, CIBLES
-- =============================================================================
CREATE TABLE axe (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code     type_axe NOT NULL UNIQUE,
    libelle  text     NOT NULL
);

CREATE TABLE critere (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    axe_id               uuid NOT NULL REFERENCES axe(id),
    intitule             text NOT NULL,
    definition           text NOT NULL,
    unite                text NOT NULL,
    sens_optimisation    sens_optimisation NOT NULL,
    source_donnee        text NOT NULL,
    justificatif_requis  boolean NOT NULL DEFAULT false,
    valide               boolean NOT NULL DEFAULT false,          -- validé par le contrôle de gestion avant activation
    valide_par           uuid REFERENCES utilisateur(id),
    date_validation      date,
    UNIQUE (axe_id, intitule),
    CONSTRAINT ck_critere_validation CHECK (NOT valide OR (valide_par IS NOT NULL AND date_validation IS NOT NULL))
);

CREATE TABLE grille_notation (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version           integer NOT NULL UNIQUE CHECK (version > 0),
    statut            statut_grille NOT NULL DEFAULT 'BROUILLON',
    date_validation   date,
    valide_par        uuid REFERENCES utilisateur(id),
    motif_changement  text,
    CONSTRAINT ck_grille_validee   CHECK (statut = 'BROUILLON' OR (date_validation IS NOT NULL AND valide_par IS NOT NULL)),
    CONSTRAINT ck_grille_motif     CHECK (version = 1 OR motif_changement IS NOT NULL)
);

CREATE TABLE ponderation_axe (                                    -- composition Grille ◆— PonderationAxe
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grille_id   uuid NOT NULL REFERENCES grille_notation(id) ON DELETE CASCADE,
    axe_id      uuid NOT NULL REFERENCES axe(id),
    famille_id  uuid REFERENCES famille_activite(id),             -- NULL = pondération par défaut
    poids       numeric(5,2) NOT NULL CHECK (poids > 0 AND poids <= 100),
    motif       text,
    CONSTRAINT ck_pond_axe_motif CHECK (famille_id IS NULL OR motif IS NOT NULL)   -- différenciation motivée
);
CREATE UNIQUE INDEX ux_pond_axe
    ON ponderation_axe (grille_id, axe_id, COALESCE(famille_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE ponderation_critere (                                -- composition Grille ◆— PonderationCritere
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grille_id    uuid NOT NULL REFERENCES grille_notation(id) ON DELETE CASCADE,
    critere_id   uuid NOT NULL REFERENCES critere(id),
    famille_id   uuid REFERENCES famille_activite(id),
    poids        numeric(5,2) NOT NULL CHECK (poids >= 0 AND poids <= 100),
    applicable   boolean NOT NULL DEFAULT true,
    motif        text,
    CONSTRAINT ck_pond_crit_motif CHECK (famille_id IS NULL OR motif IS NOT NULL)
);
CREATE UNIQUE INDEX ux_pond_critere
    ON ponderation_critere (grille_id, critere_id, COALESCE(famille_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE bareme (                                             -- composition PonderationCritere ◆— Bareme (1—1)
    ponderation_critere_id  uuid PRIMARY KEY REFERENCES ponderation_critere(id) ON DELETE CASCADE,
    plancher                numeric NOT NULL,
    plafond                 numeric NOT NULL,
    CONSTRAINT ck_bareme_bornes CHECK (plancher < plafond)
);

CREATE TABLE cible (                                              -- cible d'un pôle, par critère et par exercice
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pole_id          uuid NOT NULL REFERENCES pole(id),
    critere_id       uuid NOT NULL REFERENCES critere(id),
    exercice         integer NOT NULL CHECK (exercice BETWEEN 2000 AND 2100),
    valeur_cible     numeric NOT NULL,
    date_validation  date,
    valide_par       uuid REFERENCES utilisateur(id),
    CONSTRAINT uq_cible UNIQUE (pole_id, critere_id, exercice)
);

-- =============================================================================
-- 5. MODULE 2.2 — CAMPAGNE ET SAISIE
-- =============================================================================
CREATE TABLE campagne (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exercice        integer  NOT NULL CHECK (exercice BETWEEN 2000 AND 2100),
    trimestre       smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
    grille_id       uuid     NOT NULL REFERENCES grille_notation(id),   -- « version gelée »
    date_ouverture  date     NOT NULL,
    date_limite     date     NOT NULL,
    date_cloture    timestamptz,
    statut          statut_campagne NOT NULL DEFAULT 'OUVERTE',
    ouverte_par     uuid REFERENCES utilisateur(id),
    CONSTRAINT uq_campagne UNIQUE (exercice, trimestre),
    CONSTRAINT ck_campagne_dates   CHECK (date_limite >= date_ouverture),
    CONSTRAINT ck_campagne_cloture CHECK (statut <> 'CLOTUREE' OR date_cloture IS NOT NULL)
);

CREATE TABLE reouverture (                                        -- composition Campagne ◆— Reouverture
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id   uuid NOT NULL REFERENCES campagne(id) ON DELETE CASCADE,
    motif         text NOT NULL CHECK (length(btrim(motif)) > 0),
    date          timestamptz NOT NULL DEFAULT now(),
    reouvert_par  uuid NOT NULL REFERENCES utilisateur(id)
);

-- Gel à l'ouverture : périmètre des pôles et cibles retenues pour la campagne.
-- Ces deux tables sont remplies uniquement par fn_ouvrir_campagne() puis verrouillées.
CREATE TABLE campagne_pole (                                      -- composition Campagne ◆— CampagnePole
    campagne_id  uuid NOT NULL REFERENCES campagne(id) ON DELETE CASCADE,
    pole_id      uuid NOT NULL REFERENCES pole(id),
    date_gel     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (campagne_id, pole_id)
);

CREATE TABLE campagne_cible (                                     -- composition CampagnePole ◆— CampagneCible
    campagne_id   uuid NOT NULL,
    pole_id       uuid NOT NULL,
    critere_id    uuid NOT NULL REFERENCES critere(id),
    valeur_cible  numeric NOT NULL,                               -- copie figée de cible.valeur_cible
    PRIMARY KEY (campagne_id, pole_id, critere_id),
    FOREIGN KEY (campagne_id, pole_id) REFERENCES campagne_pole (campagne_id, pole_id) ON DELETE CASCADE
);

CREATE TABLE saisie (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id          uuid NOT NULL REFERENCES campagne(id),
    pole_id              uuid NOT NULL REFERENCES pole(id),
    critere_id           uuid NOT NULL REFERENCES critere(id),
    valeur_realisee      numeric,
    commentaire          text,
    motif_non_renseigne  text,
    statut               statut_saisie NOT NULL DEFAULT 'BROUILLON',
    source               source_saisie NOT NULL,
    cle_idempotence      text,
    date_soumission      timestamptz,
    saisi_par            uuid REFERENCES utilisateur(id),             -- saisie via l'espace
    cle_service_id       uuid REFERENCES cle_service(id),             -- saisie via l'API
    valide_par           uuid REFERENCES utilisateur(id),
    date_validation      timestamptz,
    -- unicité du triplet pôle / critère / campagne : aucune double saisie
    CONSTRAINT uq_saisie_pole_critere_campagne UNIQUE (pole_id, critere_id, campagne_id),
    -- seul un pôle du périmètre gelé, et un critère doté d'une cible gelée, peuvent être saisis
    CONSTRAINT fk_saisie_perimetre   FOREIGN KEY (campagne_id, pole_id)
        REFERENCES campagne_pole (campagne_id, pole_id),
    CONSTRAINT fk_saisie_cible_gelee FOREIGN KEY (campagne_id, pole_id, critere_id)
        REFERENCES campagne_cible (campagne_id, pole_id, critere_id),
    -- aucune valeur estimée : un critère sans valeur porte son motif
    CONSTRAINT ck_saisie_valeur_ou_motif CHECK (
        valeur_realisee IS NOT NULL OR motif_non_renseigne IS NOT NULL OR statut = 'BROUILLON'),
    CONSTRAINT ck_saisie_source CHECK (
        (source = 'ESPACE' AND saisi_par IS NOT NULL AND cle_service_id IS NULL) OR
        (source = 'API'    AND cle_service_id IS NOT NULL AND saisi_par IS NULL)),
    -- séparation des fonctions : l'auteur ne valide pas sa propre saisie
    CONSTRAINT ck_saisie_separation CHECK (valide_par IS NULL OR saisi_par IS NULL OR valide_par <> saisi_par),
    CONSTRAINT ck_saisie_validee  CHECK (statut <> 'VALIDEE' OR (valide_par IS NOT NULL AND date_validation IS NOT NULL)),
    CONSTRAINT ck_saisie_soumise  CHECK (statut = 'BROUILLON' OR date_soumission IS NOT NULL)
);
-- idempotence de l'API : un renvoi avec la même clé ne crée pas de doublon
CREATE UNIQUE INDEX ux_saisie_idempotence ON saisie (cle_service_id, cle_idempotence) WHERE cle_idempotence IS NOT NULL;

CREATE TABLE piece_justificative (                                -- composition Saisie ◆— PieceJustificative
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    saisie_id   uuid NOT NULL REFERENCES saisie(id) ON DELETE CASCADE,
    nom_fichier text NOT NULL,
    type_mime   text NOT NULL,
    chemin      text NOT NULL
);

CREATE TABLE renvoi_correction (                                  -- composition Saisie ◆— RenvoiCorrection
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    saisie_id    uuid NOT NULL REFERENCES saisie(id) ON DELETE CASCADE,
    motif        text NOT NULL CHECK (length(btrim(motif)) > 0),
    date         timestamptz NOT NULL DEFAULT now(),
    renvoye_par  uuid NOT NULL REFERENCES utilisateur(id)
);

-- =============================================================================
-- 6. MODULE 2.3 — SCORES HISTORISÉS (copies figées, pas de simples références)
-- =============================================================================
CREATE TABLE score_pole (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pole_id          uuid NOT NULL REFERENCES pole(id),
    campagne_id      uuid NOT NULL REFERENCES campagne(id),
    version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
    grille_id        uuid NOT NULL REFERENCES grille_notation(id),
    score_consolide  numeric(5,2) CHECK (score_consolide BETWEEN 0 AND 100),
    partiel          boolean NOT NULL DEFAULT false,
    date_calcul      timestamptz NOT NULL DEFAULT now(),
    fige             boolean NOT NULL DEFAULT false,
    CONSTRAINT uq_score_pole UNIQUE (pole_id, campagne_id, version),
    CONSTRAINT fk_score_pole_perimetre FOREIGN KEY (campagne_id, pole_id)
        REFERENCES campagne_pole (campagne_id, pole_id)
);

CREATE TABLE score_axe (                                          -- composition ScorePole ◆— ScoreAxe (1—3)
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    score_pole_id  uuid NOT NULL REFERENCES score_pole(id) ON DELETE CASCADE,
    axe_id         uuid NOT NULL REFERENCES axe(id),
    note           numeric(5,2) CHECK (note BETWEEN 0 AND 100),
    poids          numeric(5,2) NOT NULL CHECK (poids >= 0 AND poids <= 100),
    UNIQUE (score_pole_id, axe_id)
);

CREATE TABLE score_critere (                                      -- composition ScoreAxe ◆— ScoreCritere
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    score_axe_id       uuid NOT NULL REFERENCES score_axe(id) ON DELETE CASCADE,
    critere_id         uuid NOT NULL REFERENCES critere(id),
    valeur_saisie      numeric,
    valeur_cible       numeric NOT NULL,
    taux_atteinte      numeric(10,4) CHECK (taux_atteinte >= 0),
    note               numeric(5,2) CHECK (note BETWEEN 0 AND 100),
    poids              numeric(5,2) NOT NULL CHECK (poids >= 0 AND poids <= 100),
    plancher           numeric NOT NULL,
    plafond            numeric NOT NULL,
    sens_optimisation  sens_optimisation NOT NULL,                -- copié pour garantir le recalcul à l'identique
    UNIQUE (score_axe_id, critere_id),
    CONSTRAINT ck_score_critere_bornes CHECK (plancher < plafond),
    CONSTRAINT ck_score_critere_note   CHECK (valeur_saisie IS NOT NULL OR note IS NULL)  -- pas de note sans valeur
);

-- =============================================================================
-- 7. MODULE 2.4 — ALERTES ET TRAJECTOIRE
-- =============================================================================
CREATE TABLE seuil_critique (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    axe_id            uuid REFERENCES axe(id),                    -- NULL = seuil global
    valeur            numeric(5,2) NOT NULL CHECK (valeur BETWEEN 0 AND 100),
    ecart_degradation numeric(5,2) CHECK (ecart_degradation > 0),
    date_effet        date NOT NULL
);
CREATE UNIQUE INDEX ux_seuil_axe_date
    ON seuil_critique (COALESCE(axe_id, '00000000-0000-0000-0000-000000000000'::uuid), date_effet);

CREATE TABLE alerte (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type            type_alerte NOT NULL,
    pole_id         uuid NOT NULL REFERENCES pole(id),
    score_pole_id   uuid NOT NULL REFERENCES score_pole(id),      -- « déclenchée par »
    seuil_id        uuid NOT NULL REFERENCES seuil_critique(id),  -- « seuil franchi »
    date_creation   timestamptz NOT NULL DEFAULT now(),
    statut          statut_alerte NOT NULL DEFAULT 'ACTIVE',
    message         text NOT NULL,
    accuse_par      uuid REFERENCES utilisateur(id),
    date_accuse     timestamptz,
    CONSTRAINT uq_alerte UNIQUE (score_pole_id, type),            -- une seule alerte de chaque type par score
    CONSTRAINT ck_alerte_accuse CHECK (statut = 'ACTIVE' OR (accuse_par IS NOT NULL AND date_accuse IS NOT NULL))
);

CREATE TABLE plan_action (                                        -- composition Alerte ◆— PlanAction
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alerte_id   uuid NOT NULL REFERENCES alerte(id) ON DELETE CASCADE,
    description text NOT NULL,
    echeance    date NOT NULL,
    statut      statut_plan NOT NULL DEFAULT 'A_FAIRE'
);

CREATE TABLE notification (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alerte_id        uuid NOT NULL REFERENCES alerte(id),
    destinataire_id  uuid NOT NULL REFERENCES utilisateur(id),
    canal            canal_notification NOT NULL,
    message          text NOT NULL,
    lue              boolean NOT NULL DEFAULT false,
    date_envoi       timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 8. MODULE 2.5 — SYNTHÈSE ASSISTÉE
-- =============================================================================
CREATE TABLE synthese_trimestrielle (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campagne_id              uuid NOT NULL REFERENCES campagne(id),
    pole_id                  uuid REFERENCES pole(id),            -- NULL pour la synthèse comparative
    type                     type_synthese NOT NULL,
    contenu                  text,
    generee_automatiquement  boolean NOT NULL DEFAULT true,
    statut                   statut_synthese NOT NULL DEFAULT 'BROUILLON',
    valide_par               uuid REFERENCES utilisateur(id),     -- « validée par » (relecture obligatoire)
    date_validation          timestamptz,
    cree_le                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_synthese_validee CHECK (statut <> 'VALIDEE' OR (valide_par IS NOT NULL AND date_validation IS NOT NULL)),
    CONSTRAINT ck_synthese_type    CHECK ((type = 'POLE' AND pole_id IS NOT NULL) OR (type = 'COMPARATIVE' AND pole_id IS NULL))
);

CREATE TABLE journal_cout_ia (                                    -- composition Synthese ◆— JournalCoutIA
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    synthese_id    uuid NOT NULL REFERENCES synthese_trimestrielle(id) ON DELETE CASCADE,
    modele         text NOT NULL,
    tokens_entree  integer NOT NULL CHECK (tokens_entree >= 0),
    tokens_sortie  integer NOT NULL CHECK (tokens_sortie >= 0),
    cout           numeric(12,6) NOT NULL CHECK (cout >= 0),
    date           timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 9. MODULE 2.6 — JOURNAL D'AUDIT (append-only)
-- =============================================================================
CREATE TABLE journal_audit (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    date              timestamptz NOT NULL DEFAULT now(),
    utilisateur_id    uuid REFERENCES utilisateur(id),            -- NULL = système / clé de service
    action            text NOT NULL,
    entite            text NOT NULL,
    entite_id         text,
    ancienne_valeur   jsonb,
    nouvelle_valeur   jsonb,
    motif             text,
    adresse_ip        inet
);

-- =============================================================================
-- 10. INDEX SUR LES CLÉS ÉTRANGÈRES ET LES RECHERCHES FRÉQUENTES
-- =============================================================================
CREATE INDEX ix_pole_famille        ON pole (famille_id);
CREATE INDEX ix_pole_responsable    ON pole (responsable_id);
CREATE INDEX ix_cle_service_pole    ON cle_service (pole_id);
CREATE INDEX ix_critere_axe         ON critere (axe_id);
CREATE INDEX ix_cible_critere       ON cible (critere_id);
CREATE INDEX ix_campagne_grille     ON campagne (grille_id);
CREATE INDEX ix_campagne_pole_pole  ON campagne_pole (pole_id);
CREATE INDEX ix_campagne_cible_crit ON campagne_cible (critere_id);
CREATE INDEX ix_saisie_campagne     ON saisie (campagne_id);
CREATE INDEX ix_saisie_critere      ON saisie (critere_id);
CREATE INDEX ix_saisie_statut       ON saisie (campagne_id, statut);
CREATE INDEX ix_score_pole_campagne ON score_pole (campagne_id);
CREATE INDEX ix_score_axe_score     ON score_axe (score_pole_id);
CREATE INDEX ix_score_critere_axe   ON score_critere (score_axe_id);
CREATE INDEX ix_alerte_pole         ON alerte (pole_id, date_creation DESC);
CREATE INDEX ix_plan_action_alerte  ON plan_action (alerte_id);
CREATE INDEX ix_notification_dest   ON notification (destinataire_id, lue);
CREATE INDEX ix_synthese_campagne   ON synthese_trimestrielle (campagne_id);
CREATE INDEX ix_audit_entite        ON journal_audit (entite, entite_id);
CREATE INDEX ix_audit_date          ON journal_audit (date DESC);

-- =============================================================================
-- 11. FONCTIONS ET TRIGGERS MÉTIER
-- =============================================================================

-- 11.1  Journal d'audit : lecture seule ---------------------------------------
CREATE FUNCTION fn_audit_immuable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Le journal d''audit est en ajout seul : % interdit', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER trg_audit_immuable
    BEFORE UPDATE OR DELETE ON journal_audit
    FOR EACH ROW EXECUTE FUNCTION fn_audit_immuable();

-- 11.2  Audit automatique (saisies, validations, grille, cibles, seuils...) ----
CREATE FUNCTION fn_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_user uuid;
    v_id   text;
    v_old  jsonb;
    v_new  jsonb;
BEGIN
    v_user := NULLIF(current_setting('app.user_id', true), '')::uuid;
    IF TG_OP IN ('UPDATE','DELETE') THEN
        v_old := to_jsonb(OLD) - 'mot_de_passe_hash' - 'empreinte_cle';
    END IF;
    IF TG_OP IN ('INSERT','UPDATE') THEN
        v_new := to_jsonb(NEW) - 'mot_de_passe_hash' - 'empreinte_cle';
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

-- 11.3  Le responsable d'un pôle doit avoir le rôle RESPONSABLE_POLE ----------
CREATE FUNCTION fn_pole_responsable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.responsable_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM utilisateur WHERE id = NEW.responsable_id AND role = 'RESPONSABLE_POLE') THEN
        RAISE EXCEPTION 'Le responsable du pôle % doit avoir le rôle RESPONSABLE_POLE', NEW.code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_pole_responsable
    BEFORE INSERT OR UPDATE OF responsable_id ON pole
    FOR EACH ROW EXECUTE FUNCTION fn_pole_responsable();

-- 11.4  Grille : validation (poids = 100 %) puis gel ---------------------------
CREATE FUNCTION fn_grille_validation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.statut = 'VALIDEE' THEN
            RAISE EXCEPTION 'Une grille validée ne peut pas être supprimée (version %)', OLD.version
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.statut = 'VALIDEE' THEN
        RAISE EXCEPTION 'Grille v% figée : créer une nouvelle version', OLD.version
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.statut = 'VALIDEE' THEN
        -- les 3 axes doivent être pondérés, somme = 100 pour chaque périmètre (défaut / famille)
        IF NOT EXISTS (SELECT 1 FROM ponderation_axe WHERE grille_id = NEW.id) THEN
            RAISE EXCEPTION 'Grille sans pondération d''axe' USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (SELECT 1 FROM ponderation_axe WHERE grille_id = NEW.id
                   GROUP BY famille_id HAVING SUM(poids) <> 100) THEN
            RAISE EXCEPTION 'La somme des pondérations d''axes doit être égale à 100 %%'
                USING ERRCODE = 'check_violation';
        END IF;
        -- critères applicables : somme = 100 dans chaque axe et chaque périmètre
        IF EXISTS (SELECT 1 FROM ponderation_critere pc JOIN critere c ON c.id = pc.critere_id
                   WHERE pc.grille_id = NEW.id AND pc.applicable
                   GROUP BY pc.famille_id, c.axe_id HAVING SUM(pc.poids) <> 100) THEN
            RAISE EXCEPTION 'La somme des pondérations de critères doit être égale à 100 %% dans chaque axe'
                USING ERRCODE = 'check_violation';
        END IF;
        -- chaque critère applicable doit avoir son barème
        IF EXISTS (SELECT 1 FROM ponderation_critere pc
                   LEFT JOIN bareme b ON b.ponderation_critere_id = pc.id
                   WHERE pc.grille_id = NEW.id AND pc.applicable AND b.ponderation_critere_id IS NULL) THEN
            RAISE EXCEPTION 'Critère applicable sans barème' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_grille_validation
    BEFORE UPDATE OR DELETE ON grille_notation
    FOR EACH ROW EXECUTE FUNCTION fn_grille_validation();

-- 11.5  Pondérations et barèmes d'une grille validée : immuables ---------------
CREATE FUNCTION fn_pond_axe_figee() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_grille uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN v_grille := OLD.grille_id; ELSE v_grille := NEW.grille_id; END IF;
    IF EXISTS (SELECT 1 FROM grille_notation WHERE id = v_grille AND statut = 'VALIDEE') THEN
        RAISE EXCEPTION 'Grille validée : pondérations immuables (créer une nouvelle version)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_pond_axe_figee
    BEFORE INSERT OR UPDATE OR DELETE ON ponderation_axe
    FOR EACH ROW EXECUTE FUNCTION fn_pond_axe_figee();
CREATE TRIGGER trg_pond_critere_figee
    BEFORE INSERT OR UPDATE OR DELETE ON ponderation_critere
    FOR EACH ROW EXECUTE FUNCTION fn_pond_axe_figee();

CREATE FUNCTION fn_bareme_fige() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_pc uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN v_pc := OLD.ponderation_critere_id; ELSE v_pc := NEW.ponderation_critere_id; END IF;
    IF EXISTS (SELECT 1 FROM ponderation_critere pc JOIN grille_notation g ON g.id = pc.grille_id
               WHERE pc.id = v_pc AND g.statut = 'VALIDEE') THEN
        RAISE EXCEPTION 'Grille validée : barèmes immuables (créer une nouvelle version)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_bareme_fige
    BEFORE INSERT OR UPDATE OR DELETE ON bareme
    FOR EACH ROW EXECUTE FUNCTION fn_bareme_fige();

-- 11.6  Campagne : grille validée et gelée, clôture, réouverture motivée -------
CREATE FUNCTION fn_campagne_controles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.statut <> 'OUVERTE' THEN
            RAISE EXCEPTION 'Une campagne est créée au statut OUVERTE' USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM grille_notation WHERE id = NEW.grille_id AND statut = 'VALIDEE') THEN
            RAISE EXCEPTION 'La campagne doit reposer sur une grille validée' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- gel de la grille à l'ouverture
    IF NEW.grille_id <> OLD.grille_id THEN
        RAISE EXCEPTION 'La version de grille est gelée à l''ouverture de la campagne'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.statut = 'CLOTUREE' AND NEW.statut = 'CLOTUREE' THEN
        RAISE EXCEPTION 'Campagne clôturée : valeurs verrouillées' USING ERRCODE = 'check_violation';
    END IF;

    -- réouverture : motif tracé obligatoire (ligne dans reouverture postérieure à la clôture)
    IF OLD.statut = 'CLOTUREE' AND NEW.statut <> 'CLOTUREE' THEN
        IF NEW.statut <> 'ROUVERTE' OR NOT EXISTS (
            SELECT 1 FROM reouverture r WHERE r.campagne_id = NEW.id AND r.date >= OLD.date_cloture) THEN
            RAISE EXCEPTION 'Réouverture impossible sans motif enregistré' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- clôture : plus aucune saisie en attente de contrôle
    IF NEW.statut = 'CLOTUREE' AND OLD.statut <> 'CLOTUREE' THEN
        IF EXISTS (SELECT 1 FROM saisie WHERE campagne_id = NEW.id AND statut = 'SOUMISE') THEN
            RAISE EXCEPTION 'Clôture impossible : des saisies soumises ne sont pas encore validées'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.date_cloture := now();
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_campagne_controles
    BEFORE INSERT OR UPDATE ON campagne
    FOR EACH ROW EXECUTE FUNCTION fn_campagne_controles();

-- 11.6b Gel du périmètre et des cibles à l'ouverture ---------------------------
CREATE FUNCTION fn_gel_perimetre() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- seul fn_ouvrir_campagne() positionne ce drapeau (transaction locale)
    IF COALESCE(current_setting('app.ouverture', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Périmètre des pôles et cibles gelés à l''ouverture de la campagne'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_campagne_pole_gel
    BEFORE INSERT OR UPDATE OR DELETE ON campagne_pole
    FOR EACH ROW EXECUTE FUNCTION fn_gel_perimetre();
CREATE TRIGGER trg_campagne_cible_gel
    BEFORE INSERT OR UPDATE OR DELETE ON campagne_cible
    FOR EACH ROW EXECUTE FUNCTION fn_gel_perimetre();

-- Critères effectivement notés pour chaque pôle du périmètre : la pondération de la famille
-- d'activité l'emporte sur la pondération par défaut ; seuls les critères applicables sont retenus.
CREATE FUNCTION fn_criteres_effectifs(p_campagne_id uuid, p_grille_id uuid, p_exercice integer)
RETURNS TABLE (pole_id uuid, critere_id uuid, valeur_cible numeric, date_validation date)
LANGUAGE sql STABLE AS $$
    SELECT cp.pole_id, x.critere_id, ci.valeur_cible, ci.date_validation
    FROM campagne_pole cp
    JOIN pole p ON p.id = cp.pole_id
    CROSS JOIN LATERAL (
        SELECT DISTINCT ON (pc.critere_id) pc.critere_id, pc.applicable
        FROM ponderation_critere pc
        WHERE pc.grille_id = p_grille_id
          AND (pc.famille_id = p.famille_id OR pc.famille_id IS NULL)
        ORDER BY pc.critere_id, (pc.famille_id IS NULL)          -- la famille d'abord
    ) x
    LEFT JOIN cible ci ON ci.pole_id = cp.pole_id AND ci.critere_id = x.critere_id AND ci.exercice = p_exercice
    WHERE cp.campagne_id = p_campagne_id AND x.applicable
$$;

-- Ouverture d'une campagne : crée la campagne, fige la grille (campagne.grille_id),
-- le périmètre des pôles (campagne_pole) et les cibles (campagne_cible).
CREATE FUNCTION fn_ouvrir_campagne(
    p_exercice integer, p_trimestre smallint, p_grille_id uuid,
    p_date_limite date, p_ouverte_par uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
    v_id          uuid;
    v_nb_poles    integer;
    v_non_valides integer;
    v_manquantes  integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM utilisateur WHERE id = p_ouverte_par AND role = 'CONTROLE_GESTION' AND actif) THEN
        RAISE EXCEPTION 'Seul le contrôle de gestion ouvre une campagne' USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM set_config('app.ouverture', 'on', true);

    INSERT INTO campagne (exercice, trimestre, grille_id, date_ouverture, date_limite, ouverte_par)
    VALUES (p_exercice, p_trimestre, p_grille_id, current_date, p_date_limite, p_ouverte_par)
    RETURNING id INTO v_id;

    -- périmètre : pôles actifs, hors suspension de notation en cours
    INSERT INTO campagne_pole (campagne_id, pole_id)
    SELECT v_id, p.id
    FROM pole p
    WHERE p.statut = 'ACTIF'
      AND NOT EXISTS (SELECT 1 FROM suspension_pole s
                      WHERE s.pole_id = p.id AND current_date BETWEEN s.date_debut AND s.date_fin);
    GET DIAGNOSTICS v_nb_poles = ROW_COUNT;
    IF v_nb_poles = 0 THEN
        RAISE EXCEPTION 'Aucun pôle à noter pour cette campagne' USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) FILTER (WHERE valeur_cible IS NOT NULL AND date_validation IS NULL),
           count(*) FILTER (WHERE valeur_cible IS NULL)
      INTO v_non_valides, v_manquantes
      FROM fn_criteres_effectifs(v_id, p_grille_id, p_exercice);

    IF v_non_valides > 0 THEN
        RAISE EXCEPTION '% cible(s) non validée(s) par la direction : ouverture impossible', v_non_valides
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_manquantes > 0 THEN
        RAISE NOTICE '% couple(s) pôle/critère sans cible : critère exclu de la notation du pôle', v_manquantes;
    END IF;

    -- gel des cibles
    INSERT INTO campagne_cible (campagne_id, pole_id, critere_id, valeur_cible)
    SELECT v_id, e.pole_id, e.critere_id, e.valeur_cible
    FROM fn_criteres_effectifs(v_id, p_grille_id, p_exercice) e
    WHERE e.valeur_cible IS NOT NULL;

    PERFORM set_config('app.ouverture', 'off', true);
    RETURN v_id;
END $$;

-- 11.7  Saisie : campagne ouverte, critère applicable, rôles, clé de service ---
CREATE FUNCTION fn_saisie_controles() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_camp      campagne%ROWTYPE;
    v_resp      uuid;
    v_cle_pole  uuid;
    v_cle_actif boolean;
BEGIN
    SELECT * INTO v_camp FROM campagne WHERE id = NEW.campagne_id;
    IF v_camp.statut = 'CLOTUREE' THEN
        RAISE EXCEPTION 'Campagne clôturée : saisie verrouillée' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM critere WHERE id = NEW.critere_id AND valide) THEN
        RAISE EXCEPTION 'Critère non validé par le contrôle de gestion' USING ERRCODE = 'check_violation';
    END IF;
    -- (périmètre des pôles et cibles : garantis par les clés étrangères composites de la table)

    IF NEW.source = 'ESPACE' THEN
        SELECT responsable_id INTO v_resp FROM pole WHERE id = NEW.pole_id;
        IF v_resp IS DISTINCT FROM NEW.saisi_par THEN
            RAISE EXCEPTION 'Seul le responsable du pôle peut saisir ses indicateurs' USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        SELECT pole_id, active INTO v_cle_pole, v_cle_actif FROM cle_service WHERE id = NEW.cle_service_id;
        IF v_cle_pole IS DISTINCT FROM NEW.pole_id OR NOT COALESCE(v_cle_actif, false) THEN
            RAISE EXCEPTION 'Clé de service inactive ou rattachée à un autre pôle' USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    IF NEW.valide_par IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM utilisateur WHERE id = NEW.valide_par AND role = 'CONTROLE_GESTION') THEN
        RAISE EXCEPTION 'Seul le contrôle de gestion valide une saisie' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_saisie_controles
    BEFORE INSERT OR UPDATE ON saisie
    FOR EACH ROW EXECUTE FUNCTION fn_saisie_controles();

-- 11.8  Scores historisés : jamais modifiables une fois figés ------------------
CREATE FUNCTION fn_score_pole_fige() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE','DELETE') AND OLD.fige THEN
        RAISE EXCEPTION 'Score historisé : modification interdite (créer une nouvelle version)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP IN ('INSERT','UPDATE') AND NEW.fige AND NOT EXISTS (
        SELECT 1 FROM campagne WHERE id = NEW.campagne_id AND statut = 'CLOTUREE') THEN
        RAISE EXCEPTION 'Un score ne se fige qu''à la clôture de la campagne' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_score_pole_fige
    BEFORE INSERT OR UPDATE OR DELETE ON score_pole
    FOR EACH ROW EXECUTE FUNCTION fn_score_pole_fige();

CREATE FUNCTION fn_score_axe_fige() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_sp uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN v_sp := OLD.score_pole_id; ELSE v_sp := NEW.score_pole_id; END IF;
    IF EXISTS (SELECT 1 FROM score_pole WHERE id = v_sp AND fige) THEN
        RAISE EXCEPTION 'Score historisé : détail par axe immuable' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_score_axe_fige
    BEFORE INSERT OR UPDATE OR DELETE ON score_axe
    FOR EACH ROW EXECUTE FUNCTION fn_score_axe_fige();

CREATE FUNCTION fn_score_critere_fige() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_axe uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN v_axe := OLD.score_axe_id; ELSE v_axe := NEW.score_axe_id; END IF;
    IF EXISTS (SELECT 1 FROM score_axe sa JOIN score_pole sp ON sp.id = sa.score_pole_id
               WHERE sa.id = v_axe AND sp.fige) THEN
        RAISE EXCEPTION 'Score historisé : détail par critère immuable' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_score_critere_fige
    BEFORE INSERT OR UPDATE OR DELETE ON score_critere
    FOR EACH ROW EXECUTE FUNCTION fn_score_critere_fige();

-- 11.9  Branchement du journal d'audit sur les tables sensibles ----------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'utilisateur','pole','suspension_pole','cle_service','critere','grille_notation',
        'ponderation_axe','ponderation_critere','bareme','cible','campagne','reouverture',
        'campagne_pole','saisie','renvoi_correction','score_pole','seuil_critique','alerte','plan_action',
        'synthese_trimestrielle'] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_zz_audit AFTER INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION fn_audit()', t);
    END LOOP;
END $$;

-- =============================================================================
-- 12. VUES D'AGRÉGATION (restitution et alertes)
-- =============================================================================

-- Dernière version de score de chaque pôle et de chaque campagne
CREATE VIEW v_score_courant AS
SELECT DISTINCT ON (sp.pole_id, sp.campagne_id)
       sp.id AS score_pole_id, sp.pole_id, sp.campagne_id, sp.version, sp.grille_id,
       sp.score_consolide, sp.partiel, sp.fige, sp.date_calcul,
       c.exercice, c.trimestre,
       p.code AS pole_code, p.intitule AS pole_intitule, p.famille_id
FROM score_pole sp
JOIN campagne c ON c.id = sp.campagne_id
JOIN pole     p ON p.id = sp.pole_id
ORDER BY sp.pole_id, sp.campagne_id, sp.version DESC;

-- Classement de direction : global et au sein de la famille d'activité
CREATE VIEW v_classement_direction AS
SELECT v.*,
       RANK() OVER (PARTITION BY v.exercice, v.trimestre
                    ORDER BY v.score_consolide DESC NULLS LAST)                     AS rang_global,
       RANK() OVER (PARTITION BY v.exercice, v.trimestre, v.famille_id
                    ORDER BY v.score_consolide DESC NULLS LAST)                     AS rang_famille
FROM v_score_courant v;

-- Règle centrale : pôles sous le seuil critique deux trimestres consécutifs
CREATE VIEW v_alerte_direction_a_declencher AS
WITH t AS (
    SELECT v.score_pole_id, v.pole_id, v.campagne_id, v.exercice, v.trimestre, v.score_consolide,
           s.id AS seuil_id, s.valeur AS seuil,
           (v.score_consolide < s.valeur) AS sous_seuil,
           (v.exercice * 4 + v.trimestre) AS rang_trimestre
    FROM v_score_courant v
    JOIN campagne c ON c.id = v.campagne_id
    JOIN LATERAL (
        SELECT id, valeur FROM seuil_critique
        WHERE axe_id IS NULL AND date_effet <= c.date_ouverture
        ORDER BY date_effet DESC LIMIT 1
    ) s ON true
), p AS (
    SELECT t.*,
           LAG(t.sous_seuil)      OVER w AS sous_seuil_prec,
           LAG(t.rang_trimestre)  OVER w AS rang_prec
    FROM t
    WINDOW w AS (PARTITION BY t.pole_id ORDER BY t.exercice, t.trimestre)
)
SELECT score_pole_id, pole_id, campagne_id, exercice, trimestre, score_consolide, seuil_id, seuil
FROM p
WHERE sous_seuil AND sous_seuil_prec AND (rang_trimestre - rang_prec) = 1;

-- =============================================================================
-- 13. DONNÉES DE RÉFÉRENCE
-- =============================================================================
INSERT INTO axe (code, libelle) VALUES
    ('FINANCIER', 'Objectifs financiers'),
    ('HUMAIN',    'Objectifs humains'),
    ('QUALITE',   'Objectifs de qualité');

-- =============================================================================
-- 14. (OPTIONNEL) CLOISONNEMENT PAR PÔLE — Row Level Security
--     À activer avec un rôle applicatif distinct du propriétaire des tables.
--     L'API positionne : SET LOCAL app.role = '...'; SET LOCAL app.pole_id = '...';
-- =============================================================================
-- ALTER TABLE saisie      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE score_pole  ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY cloisonnement_saisie ON saisie USING (
--     current_setting('app.role', true) IN ('CONTROLE_GESTION','DIRECTION_GENERALE','ADMINISTRATEUR')
--     OR pole_id = NULLIF(current_setting('app.pole_id', true), '')::uuid);
-- CREATE POLICY cloisonnement_score ON score_pole USING (
--     current_setting('app.role', true) IN ('CONTROLE_GESTION','DIRECTION_GENERALE','ADMINISTRATEUR')
--     OR pole_id = NULLIF(current_setting('app.pole_id', true), '')::uuid);

COMMIT;
