CREATE TABLE registration_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES users(id),
  CHECK (expires_at > created_at),
  CHECK ((redeemed_at IS NULL) = (redeemed_by IS NULL))
);

CREATE INDEX registration_invitations_expiration_idx
  ON registration_invitations (expires_at)
  WHERE redeemed_at IS NULL;