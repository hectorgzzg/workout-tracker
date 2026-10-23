CREATE TABLE workout_session_requests (
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  operation text NOT NULL CHECK (operation IN ('start', 'save')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid NOT NULL,
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key),
  FOREIGN KEY (user_id, session_id)
    REFERENCES workout_sessions(user_id, id) ON DELETE CASCADE
);
