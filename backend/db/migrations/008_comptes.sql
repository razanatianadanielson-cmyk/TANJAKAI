BEGIN;

SET search_path TO notation, public;

-- Compte créé par l'administrateur : mot de passe provisoire à changer dès la première connexion.
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS mdp_a_changer boolean NOT NULL DEFAULT false;

COMMIT;
