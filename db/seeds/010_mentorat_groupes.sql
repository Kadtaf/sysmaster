-- Mentorat et groupes d'étude (Phase 5) : un profil de mentor et un groupe public de démonstration.
-- Rejouable ; ne fait rien si les utilisateurs de démonstration (001) sont absents.

INSERT INTO community.mentor_profiles (user_id, bio, topics, accepting, max_mentees)
SELECT '00000000-0000-4000-8000-000000000004',
       E'Administratrice systèmes Linux depuis dix ans. J’aide à construire une méthode de diagnostic : observer, formuler une hypothèse, vérifier avant d’agir.',
       ARRAY['linux', 'réseau', 'docker'], true, 3
 WHERE EXISTS (SELECT 1 FROM iam.users WHERE id = '00000000-0000-4000-8000-000000000004')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO community.study_groups (id, name, description, owner_id, goal, is_public, max_members)
SELECT '7c0e1a52-5d0c-4b8e-9a51-000000000201', 'Révisions Linux Administrator',
       'On se retrouve chaque semaine pour refaire un lab ensemble et s’expliquer les questions ratées en quiz.',
       '00000000-0000-4000-8000-000000000004', 'Obtenir la certification Linux Administrator', true, 12
 WHERE EXISTS (SELECT 1 FROM iam.users WHERE id = '00000000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO community.study_group_members (group_id, user_id, role)
SELECT '7c0e1a52-5d0c-4b8e-9a51-000000000201', u.id, CASE WHEN u.id = '00000000-0000-4000-8000-000000000004' THEN 'owner' ELSE 'member' END
  FROM iam.users u
 WHERE u.id IN ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003')
   AND EXISTS (SELECT 1 FROM community.study_groups WHERE id = '7c0e1a52-5d0c-4b8e-9a51-000000000201')
ON CONFLICT DO NOTHING;
