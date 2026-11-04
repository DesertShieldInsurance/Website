-- Partner referral tables (reconstructed from the production schema; already applied on 2026-09-23).
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  token_revoked boolean NOT NULL DEFAULT false,
  company text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','contacted','info_needed','quoted','bound','closed')),
  public_note text NOT NULL DEFAULT 'Your referral is with our team. We will contact the carrier.',
  private_encrypted text NOT NULL,
  coverage_date date,
  vehicle_count integer NOT NULL DEFAULT 0,
  driver_count integer NOT NULL DEFAULT 0,
  packet_complete boolean NOT NULL DEFAULT false,
  reward_status text NOT NULL DEFAULT 'not_eligible' CHECK (reward_status IN ('not_eligible','pending_review','approved','sent','declined')),
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','accepted','failed')),
  email_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS referrals_created ON referrals(created_at DESC);
CREATE TABLE IF NOT EXISTS referral_events (
  id bigserial PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text NOT NULL,
  actor text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS referral_audit (
  id bigserial PRIMARY KEY,
  referral_id uuid REFERENCES referrals(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS referral_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS referral_rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 1,
  resets_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS referral_totp_used (
  step bigint PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
