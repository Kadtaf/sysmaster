-- Badges de la Phase 2 (rejouable)
INSERT INTO gamification.badges (code, name, description, icon, rarity, criteria) VALUES
  ('first_lesson','Premier pas','A validé sa première leçon.','footprints','common','{"lessons_completed":1}'),
  ('ten_lessons','Assidu','A validé 10 leçons.','book-open-check','rare','{"lessons_completed":10}'),
  ('first_diagnostic','Premier diagnostic','A mené un premier diagnostic jusqu''au bout.','stethoscope','common','{"diagnostics_completed":1}'),
  ('path_completed','Parcours terminé','A terminé un parcours complet.','graduation-cap','epic','{"paths_completed":1}'),
  ('streak_7','Une semaine d''affilée','7 jours consécutifs d''apprentissage.','flame','rare','{"streak_days":7}'),
  ('streak_30','30 jours d''affilée','30 jours consécutifs d''apprentissage.','flame','legendary','{"streak_days":30}')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, rarity = EXCLUDED.rarity, criteria = EXCLUDED.criteria;

-- Démo : les statistiques de 001 précèdent les compteurs de la migration 004 ; on les rend cohérentes.
UPDATE gamification.user_stats SET longest_streak = greatest(longest_streak, streak_days)
 WHERE user_id IN ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');
