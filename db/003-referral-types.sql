-- Personal and business referrals share the trucking referral pipeline.
-- Additive only: existing rows are trucking referrals.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referral_type text NOT NULL DEFAULT 'trucking';
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referral_type_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_referral_type_check CHECK (referral_type IN ('trucking','personal','business'));
ALTER TABLE referrals ALTER COLUMN public_note SET DEFAULT 'Your referral is with our team. We will reach out to make the introduction.';
