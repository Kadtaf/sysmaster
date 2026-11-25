-- Communauté (Phase 5) : descriptions et ordre des catégories, badge d'entraide, deux sujets de démonstration.
-- Rejouable.

INSERT INTO community.categories (slug, name, platform, description, position) VALUES
  ('linux','Linux','linux','Services, disques, droits, journaux : l’administration au quotidien.',1),
  ('windows','Windows','windows','Postes et serveurs Windows, Active Directory, PowerShell.',2),
  ('reseau','Réseau','network','DNS, routage, pare-feu, VPN : quand les paquets se perdent.',3),
  ('docker-kubernetes','Docker & Kubernetes','kubernetes','Conteneurs, images, compose et orchestration.',4),
  ('securite','Sécurité','security','Durcissement, droits, journaux d’authentification, bonnes pratiques.',5),
  ('certifications','Certifications',NULL,'Préparer un examen, partager sa méthode de révision (jamais les questions).',6)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position;

INSERT INTO gamification.badges (code, name, description, icon, rarity, criteria) VALUES
  ('helper','Coup de main','Une de ses réponses a été acceptée dans la communauté.','hand-helping','common','{"answers_accepted":1}'),
  ('mentor_10','Pilier de la communauté','Dix réponses acceptées dans la communauté.','users','epic','{"answers_accepted":10}')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, rarity = EXCLUDED.rarity, criteria = EXCLUDED.criteria;

-- Démo : une question résolue et une question en attente (utilisateurs de démonstration de 001).
INSERT INTO community.threads (id, category_id, author_id, kind, title, body_md, tags, created_at, last_activity_at)
SELECT v.id::uuid, c.id, v.author::uuid, 'question', v.title, v.body, v.tags, now() - v.age, now() - v.age
  FROM (VALUES
    ('7c0e1a52-5d0c-4b8e-9a51-000000000001', 'linux', '00000000-0000-4000-8000-000000000003',
     'nginx refuse de démarrer après un changement de configuration',
     E'Après avoir ajouté un bloc `server`, `systemctl restart nginx` échoue :\n\n```\nJob for nginx.service failed because the control process exited with error code.\n```\n\nJ’ai déjà vérifié que le port 80 est libre. Où regarder ensuite ?',
     ARRAY['nginx','systemd'], interval '3 days'),
    ('7c0e1a52-5d0c-4b8e-9a51-000000000002', 'reseau', '00000000-0000-4000-8000-000000000003',
     'Le serveur ping 8.8.8.8 mais ne résout aucun nom de domaine',
     E'`ping 8.8.8.8` répond, mais `ping debian.org` donne « Temporary failure in name resolution ». C’est une VM fraîchement clonée. Une idée de ce qu’il faut vérifier en premier ?',
     ARRAY['dns'], interval '5 hours')
  ) AS v(id, cat, author, title, body, tags, age)
  JOIN community.categories c ON c.slug = v.cat
  WHERE EXISTS (SELECT 1 FROM iam.users u WHERE u.id = v.author::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO community.posts (id, thread_id, author_id, body_md, score, created_at)
SELECT '7c0e1a52-5d0c-4b8e-9a51-000000000101', '7c0e1a52-5d0c-4b8e-9a51-000000000001', '00000000-0000-4000-8000-000000000004',
       E'Avant de redémarrer, fais valider la configuration : `nginx -t`. Elle indique le fichier et la ligne fautive.\n\nEnsuite, `journalctl -u nginx -n 50` montre pourquoi le démarrage a échoué. Le plus souvent : un point-virgule oublié ou deux blocs `server` qui écoutent le même `server_name`.',
       3, now() - interval '2 days'
 WHERE EXISTS (SELECT 1 FROM community.threads WHERE id = '7c0e1a52-5d0c-4b8e-9a51-000000000001')
   AND EXISTS (SELECT 1 FROM iam.users WHERE id = '00000000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

UPDATE community.threads t
   SET accepted_post_id = '7c0e1a52-5d0c-4b8e-9a51-000000000101', accept_rewarded = true,
       post_count = (SELECT count(*) FROM community.posts p WHERE p.thread_id = t.id), last_activity_at = now() - interval '2 days'
 WHERE t.id = '7c0e1a52-5d0c-4b8e-9a51-000000000001' AND t.accepted_post_id IS NULL
   AND EXISTS (SELECT 1 FROM community.posts WHERE id = '7c0e1a52-5d0c-4b8e-9a51-000000000101');
