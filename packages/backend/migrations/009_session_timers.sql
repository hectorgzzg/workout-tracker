ALTER TABLE workout_sessions
  ADD COLUMN timer_state jsonb NOT NULL DEFAULT '{}'::jsonb;