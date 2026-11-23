-- =============================================================================
-- Données de démo : cas de référence du diagnostic
-- =============================================================================
-- Rejoués à chaque proposition de modification d'une cause (back-office). Si une modification
-- fait perdre la première place à la cause attendue, le relecteur le voit avant d'approuver.
INSERT INTO diagnostic.reference_cases (name, platform, description, symptoms, evidence, expected_cause) VALUES
  ('Redémarre en jeu et chauffe', 'windows', 'Mon PC redémarre seul, surtout en jeu, et il chauffe', '{}', '', 'overheating'),
  ('Redémarre en jeu, journal Kernel-Power 41', 'windows', 'Mon PC redémarre seul, surtout en jeu', '{}',
   'Event ID 41 Kernel-Power : le système a redémarré sans arrêt correct', 'psu_failure'),
  ('Écran bleu après mise à jour de pilote', 'windows', '', '{bsod,after_driver_update}', '', 'driver_fault'),
  ('Écran bleu MEMORY_MANAGEMENT et gels', 'windows', '', '{bsod,random_freeze}', 'BugCheck code MEMORY_MANAGEMENT', 'ram_fault'),
  ('Bips au démarrage après réglage du BIOS', 'windows', '', '{after_bios_change,no_display_beep}', '', 'bios_settings'),
  ('Redémarrage nocturne par Windows Update', 'windows', '', '{unexpected_reboot}',
   'Event ID 1074 : TrustedInstaller a lancé le redémarrage (Windows Update)', 'windows_update')
ON CONFLICT (name) DO NOTHING;

-- Lacune trouvée par ces cas : aucune règle ne reliait « pas d'affichage, bips » aux réglages
-- BIOS. Après un changement de réglage (XMP, fréquences, tensions), c'est pourtant le premier suspect.
INSERT INTO diagnostic.rules (symptom_code, cause_code, likelihood, rationale) VALUES
  ('no_display_beep', 'bios_settings', 0.600,
   'Un réglage mémoire (profil XMP, fréquence) ou de tension trop agressif empêche le démarrage : la carte mère l''annonce par des bips.')
ON CONFLICT (symptom_code, cause_code) DO NOTHING;

-- Lacune trouvée par ces cas : le motif « BugCheck » renforçait un pilote défaillant pour TOUT écran
-- bleu, y compris MEMORY_MANAGEMENT (mémoire). Seul un fichier pilote nommé (.sys) désigne un pilote.
UPDATE diagnostic.evidence_patterns SET pattern = '[A-Za-z0-9_]+\.sys\b'
 WHERE name = 'BugCheck pilote' AND pattern = '(BugCheck|\.sys)';
