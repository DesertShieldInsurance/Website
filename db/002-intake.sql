CREATE TABLE IF NOT EXISTS intake_verifications (
  id uuid PRIMARY KEY,
  email_hash text NOT NULL,
  email_encrypted text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  ticket_hash text UNIQUE,
  verified_at timestamptz,
  used_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS intake_submissions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  intake_type text NOT NULL CHECK (intake_type IN ('trucking','personal','business')),
  schema_version text NOT NULL,
  private_encrypted text NOT NULL,
  pdf_encrypted text NOT NULL,
  email_encrypted text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  token_revoked boolean NOT NULL DEFAULT false,
  prospect_email_status text NOT NULL DEFAULT 'pending',
  agency_email_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS intake_audit (
  id bigserial PRIMARY KEY,
  submission_id uuid REFERENCES intake_submissions(id),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intake_created_idx ON intake_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS intake_verification_expiry_idx ON intake_verifications(expires_at);
GRANT SELECT, INSERT, UPDATE ON intake_verifications, intake_submissions, intake_audit TO referral_app;
GRANT USAGE, SELECT ON SEQUENCE intake_audit_id_seq TO referral_app;
