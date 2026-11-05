BEGIN;

SET search_path TO notation, public;

-- Seuil critique global par défaut (paramétrable ensuite par le contrôle de gestion) :
-- score consolidé < 50 /100 ; dégradation rapide = chute de plus de 15 points d'un trimestre à l'autre.
INSERT INTO seuil_critique (axe_id, valeur, ecart_degradation, date_effet)
SELECT NULL, 50, 15, DATE '2020-01-01'
WHERE NOT EXISTS (SELECT 1 FROM seuil_critique WHERE axe_id IS NULL);

CREATE INDEX IF NOT EXISTS ix_alerte_statut ON alerte (statut, date_creation DESC);

COMMIT;
