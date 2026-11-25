-- Partage de scripts (Phase 5) : un script relu de démonstration. Rejouable.

INSERT INTO community.threads (id, category_id, author_id, kind, title, body_md, tags, created_at, last_activity_at)
SELECT '7c0e1a52-5d0c-4b8e-9a51-000000000301', c.id, '00000000-0000-4000-8000-000000000004', 'script_share',
       'Qui remplit le disque ? Un état des lieux sans rien supprimer',
       E'Quand `df -h` affiche 100 %, j’utilise ce script avant toute suppression : il montre où est la place, rien de plus.',
       ARRAY['disque', 'diagnostic'], now() - interval '1 day', now() - interval '1 day'
  FROM community.categories c
 WHERE c.slug = 'linux' AND EXISTS (SELECT 1 FROM iam.users WHERE id = '00000000-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO community.shared_scripts (thread_id, language, code, explanation, risk_level, reviewed, reviewed_by, reviewed_at)
SELECT '7c0e1a52-5d0c-4b8e-9a51-000000000301', 'bash',
       E'#!/bin/bash\n# Lecture seule : aucune suppression.\nset -euo pipefail\ndf -h /\necho "--- Dossiers les plus lourds sous /var"\ndu -xh /var --max-depth=2 2>/dev/null | sort -rh | head -15\necho "--- Fichiers supprimés mais encore ouverts"\nlsof +L1 2>/dev/null | head -20 || true\necho "--- Journal systemd"\njournalctl --disk-usage',
       E'Affiche l’occupation de la racine, les 15 dossiers les plus lourds sous `/var` (sans traverser d’autres systèmes de fichiers grâce à `-x`), les fichiers supprimés que des processus gardent ouverts (la place n’est libérée qu’au redémarrage du processus) et la taille du journal systemd.\n\nÀ utiliser avant de supprimer quoi que ce soit. Limites : `du` peut être lent sur de très gros volumes, et `lsof` doit être installé.',
       'none', true, '00000000-0000-4000-8000-000000000001', now()
 WHERE EXISTS (SELECT 1 FROM community.threads WHERE id = '7c0e1a52-5d0c-4b8e-9a51-000000000301')
ON CONFLICT (thread_id) DO NOTHING;
