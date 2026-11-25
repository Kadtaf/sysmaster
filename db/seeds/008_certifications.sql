-- =============================================================================
-- Certifications : conditions d’examen et labs exigés (les banques de questions sont dans le seed 012).
-- Rejouable : les mises à jour réécrivent les mêmes valeurs.
-- =============================================================================

-- Banques et labs exigés des certifications pour lesquelles des contenus existent déjà.
UPDATE assessment.certifications SET exam_platforms = ARRAY['linux']::platform.os_platform[], exam_question_count = 10, exam_time_limit_s = 1200,
       required_labs = ARRAY['linux-disque-plein-nginx', 'linux-port-80-occupe'] WHERE code = 'LINUX-ADMIN';
UPDATE assessment.certifications SET exam_platforms = ARRAY['network']::platform.os_platform[],
       required_labs = ARRAY['reseau-dns-interne', 'reseau-route-par-defaut'] WHERE code = 'NET-SPEC';
UPDATE assessment.certifications SET exam_platforms = ARRAY['docker']::platform.os_platform[],
       required_labs = ARRAY['docker-variable-renommee', 'docker-port-deja-alloue'] WHERE code = 'DOCKER-SPEC';
UPDATE assessment.certifications SET exam_platforms = ARRAY['security']::platform.os_platform[],
       required_labs = ARRAY['cyber-ssh-force-brute', 'cyber-secrets-lisibles'] WHERE code = 'CYBER-SPEC';
UPDATE assessment.certifications SET exam_platforms = ARRAY['windows']::platform.os_platform[] WHERE code IN ('WIN-TECH', 'WIN-ADMIN');
UPDATE assessment.certifications SET exam_platforms = ARRAY['linux']::platform.os_platform[] WHERE code = 'LINUX-EXPERT';
UPDATE assessment.certifications SET exam_platforms = ARRAY['devops', 'kubernetes']::platform.os_platform[] WHERE code = 'DEVOPS-SPEC';
UPDATE assessment.certifications SET exam_platforms = ARRAY['postgresql']::platform.os_platform[] WHERE code = 'PG-SPEC';
UPDATE assessment.certifications SET exam_platforms = ARRAY['windows', 'linux', 'network']::platform.os_platform[], exam_question_count = 40,
       exam_time_limit_s = 3600 WHERE code = 'SYSMASTER-EXPERT';

-- La banque Linux de départ, insérée ici à l'origine, est désormais générée avec les autres
-- banques d'examen depuis db/content/exam-banks.mjs (seed 012, mêmes identifiants).
