-- =============================================================================
-- 003 — Une leçon est adressée par /cours/<cours>/<leçon> : son slug doit être unique
-- dans tout le cours, pas seulement dans son module. Contrainte inter-tables → déclencheur.
-- =============================================================================
CREATE OR REPLACE FUNCTION learning.check_lesson_slug_unique_in_course() RETURNS trigger AS $$
DECLARE
  v_course uuid;
BEGIN
  SELECT course_id INTO v_course FROM learning.modules WHERE id = NEW.module_id;
  -- Verrou par cours : deux insertions concurrentes ne peuvent pas passer le contrôle en même temps.
  PERFORM pg_advisory_xact_lock(hashtext('learning.course:' || v_course::text));
  IF EXISTS (
    SELECT 1 FROM learning.lessons l JOIN learning.modules m ON m.id = l.module_id
     WHERE m.course_id = v_course AND l.slug = NEW.slug AND l.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Le slug de leçon « % » existe déjà dans ce cours', NEW.slug USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lessons_slug_unique_in_course
  BEFORE INSERT OR UPDATE OF slug, module_id ON learning.lessons
  FOR EACH ROW EXECUTE FUNCTION learning.check_lesson_slug_unique_in_course();
