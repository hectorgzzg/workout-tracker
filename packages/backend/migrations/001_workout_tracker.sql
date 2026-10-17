CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, role)
);

CREATE UNIQUE INDEX users_email_case_insensitive_unique ON users (lower(email));

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  default_unit text NOT NULL DEFAULT 'kg' CHECK (default_unit IN ('kg', 'lb')),
  bodyweight_kg numeric(8, 3) CHECK (bodyweight_kg >= 0),
  rest_durations_seconds jsonb NOT NULL DEFAULT
    '{"upper_compound":120,"lower_compound":180,"upper_isolation":90,"lower_isolation":90,"core":60}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE gym_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gym_id uuid NOT NULL,
  name text NOT NULL,
  load_type text NOT NULL CHECK (load_type IN ('external', 'dumbbell', 'bodyweight', 'assisted')),
  min_load_kg numeric(8, 3) NOT NULL CHECK (min_load_kg >= 0),
  max_load_kg numeric(8, 3) NOT NULL CHECK (max_load_kg >= min_load_kg),
  increment_kg numeric(8, 3) NOT NULL CHECK (increment_kg > 0),
  available_loads_kg numeric(8, 3)[] NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id, gym_id) REFERENCES gyms(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, id)
);

CREATE TABLE gym_bars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gym_id uuid NOT NULL,
  name text NOT NULL,
  weight_kg numeric(8, 3) NOT NULL CHECK (weight_kg > 0),
  FOREIGN KEY (user_id, gym_id) REFERENCES gyms(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, id)
);

CREATE TABLE gym_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gym_id uuid NOT NULL,
  weight_kg numeric(8, 3) NOT NULL CHECK (weight_kg > 0),
  quantity integer NOT NULL CHECK (quantity >= 0),
  FOREIGN KEY (user_id, gym_id) REFERENCES gyms(user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, gym_id, weight_kg),
  UNIQUE (user_id, id)
);

CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_url text,
  load_type text NOT NULL CHECK (load_type IN ('external', 'dumbbell', 'bodyweight', 'assisted')),
  rest_category text CHECK (
    rest_category IN ('upper_compound', 'lower_compound', 'upper_isolation', 'lower_isolation', 'core')
  ),
  bodyweight_factor numeric(8, 5) CHECK (bodyweight_factor > 0),
  assistance_ratio numeric(8, 5) CHECK (assistance_ratio > 0),
  dumbbell_count smallint CHECK (dumbbell_count IN (1, 2)),
  is_test_fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX exercises_name_unique ON exercises (lower(name));

CREATE TABLE exercise_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  unit_override text CHECK (unit_override IN ('kg', 'lb')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

CREATE TABLE exercise_muscles (
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('primary', 'secondary', 'tertiary')),
  muscle text NOT NULL,
  PRIMARY KEY (exercise_id, role, muscle)
);

CREATE TABLE program_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE TABLE program_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid NOT NULL,
  week_number integer NOT NULL CHECK (week_number > 0),
  week_type text NOT NULL CHECK (week_type IN ('training', 'deload')),
  UNIQUE (user_id, template_id, week_number),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, template_id) REFERENCES program_templates(user_id, id) ON DELETE CASCADE
);

CREATE TABLE program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_id uuid NOT NULL,
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 7),
  day_type text NOT NULL CHECK (day_type IN ('workout', 'rest')),
  name text,
  UNIQUE (user_id, week_id, slot_number),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, week_id) REFERENCES program_weeks(user_id, id) ON DELETE CASCADE
);

CREATE TABLE program_day_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_id uuid NOT NULL,
  exercise_id uuid NOT NULL REFERENCES exercises(id),
  sort_order smallint NOT NULL CHECK (sort_order > 0),
  prescription_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, day_id, sort_order),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, day_id) REFERENCES program_days(user_id, id) ON DELETE CASCADE
);

CREATE TABLE program_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_exercise_id uuid NOT NULL,
  set_number smallint NOT NULL CHECK (set_number > 0),
  set_type text NOT NULL CHECK (set_type IN ('standard', 'warmup', 'failure')),
  rep_min integer NOT NULL CHECK (rep_min > 0),
  rep_max integer CHECK (rep_max >= rep_min),
  target_rir smallint NOT NULL CHECK (target_rir BETWEEN 0 AND 10),
  UNIQUE (user_id, day_exercise_id, set_number),
  FOREIGN KEY (user_id, day_exercise_id)
    REFERENCES program_day_exercises(user_id, id) ON DELETE CASCADE,
  CHECK (set_type <> 'failure' OR target_rir = 0)
);

CREATE TABLE program_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, template_id) REFERENCES program_templates(user_id, id)
);

CREATE UNIQUE INDEX program_runs_one_active_per_user
  ON program_runs (user_id) WHERE status = 'active';

CREATE TABLE program_run_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  template_day_id uuid NOT NULL,
  week_number integer NOT NULL CHECK (week_number > 0),
  slot_number smallint NOT NULL CHECK (slot_number BETWEEN 1 AND 7),
  day_type text NOT NULL CHECK (day_type IN ('workout', 'rest')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'partial', 'skipped', 'rest_done')),
  resolved_at timestamptz,
  UNIQUE (user_id, run_id, week_number, slot_number),
  UNIQUE (user_id, id),
  UNIQUE (user_id, id, run_id),
  FOREIGN KEY (user_id, run_id) REFERENCES program_runs(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, template_day_id) REFERENCES program_days(user_id, id)
);

CREATE TABLE workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_run_id uuid,
  program_run_day_id uuid,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed', 'partial', 'discarded')),
  has_performance boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  started_timezone text NOT NULL DEFAULT 'UTC',
  started_local_date date NOT NULL,
  finished_at timestamptz,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, program_run_id) REFERENCES program_runs(user_id, id),
  FOREIGN KEY (user_id, program_run_day_id, program_run_id)
    REFERENCES program_run_days(user_id, id, run_id),
  CHECK ((program_run_id IS NULL) = (program_run_day_id IS NULL)),
  CHECK (status NOT IN ('draft', 'discarded') OR NOT has_performance)
);

CREATE UNIQUE INDEX workout_sessions_one_performance_per_local_date
  ON workout_sessions (user_id, started_local_date)
  WHERE status IN ('completed', 'partial') AND has_performance;

CREATE UNIQUE INDEX workout_sessions_one_active_draft_per_user
  ON workout_sessions (user_id) WHERE status = 'draft';

CREATE TABLE session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  exercise_id uuid NOT NULL REFERENCES exercises(id),
  name_snapshot text NOT NULL,
  exercise_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  prescription_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  bodyweight_kg numeric(8, 3) CHECK (bodyweight_kg >= 0),
  bodyweight_factor numeric(8, 5) CHECK (bodyweight_factor > 0),
  assistance_ratio numeric(8, 5) CHECK (assistance_ratio > 0),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, session_id) REFERENCES workout_sessions(user_id, id) ON DELETE CASCADE
);

CREATE TABLE session_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_exercise_id uuid NOT NULL,
  set_number smallint NOT NULL CHECK (set_number > 0),
  set_type text NOT NULL CHECK (set_type IN ('standard', 'warmup', 'failure')),
  prescription_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_load_kg numeric(8, 3) CHECK (actual_load_kg >= 0),
  effective_load_kg numeric(8, 3) CHECK (effective_load_kg >= 0),
  actual_reps integer CHECK (actual_reps > 0),
  actual_rir smallint CHECK (actual_rir BETWEEN 0 AND 10),
  checked_at timestamptz,
  UNIQUE (user_id, id),
  UNIQUE (user_id, session_exercise_id, set_number),
  FOREIGN KEY (user_id, session_exercise_id) REFERENCES session_exercises(user_id, id) ON DELETE CASCADE,
  CHECK (
    checked_at IS NULL OR
    (actual_load_kg IS NOT NULL AND actual_reps IS NOT NULL AND actual_rir IS NOT NULL)
  ),
  CHECK (set_type <> 'failure' OR checked_at IS NULL OR actual_rir = 0)
);

CREATE TABLE session_set_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_set_id uuid NOT NULL,
  corrected_load_kg numeric(8, 3) NOT NULL CHECK (corrected_load_kg >= 0),
  corrected_reps integer NOT NULL CHECK (corrected_reps > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, session_set_id) REFERENCES session_sets(user_id, id) ON DELETE CASCADE
);

CREATE INDEX session_set_corrections_latest_first
  ON session_set_corrections (user_id, session_set_id, created_at DESC);

CREATE FUNCTION prevent_finished_session_set_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_status text;
BEGIN
  SELECT sessions.status INTO session_status
  FROM session_exercises AS exercises
  JOIN workout_sessions AS sessions
    ON sessions.user_id = exercises.user_id
   AND sessions.id = exercises.session_id
  WHERE exercises.user_id = OLD.user_id
    AND exercises.id = OLD.session_exercise_id;

  IF session_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Finished session set values are immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER session_sets_finished_immutable
  BEFORE UPDATE OR DELETE ON session_sets
  FOR EACH ROW EXECUTE FUNCTION prevent_finished_session_set_mutation();