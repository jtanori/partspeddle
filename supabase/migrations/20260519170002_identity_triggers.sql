-- T2.1 + T2.1A — Identity Triggers
-- Auto-timestamp triggers for the identity schema.
-- NOTE: No auth sync trigger here. User provisioning is lazy (API middleware)
-- or async (webhook reconciliation). See ADR-002.

-- ─── Auto-update timestamp function ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION identity.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Apply updated_at triggers to all identity tables ─────────────────────────
CREATE TRIGGER set_timestamp_users
  BEFORE UPDATE ON identity.users
  FOR EACH ROW
  EXECUTE FUNCTION identity.trigger_set_timestamp();

CREATE TRIGGER set_timestamp_profiles
  BEFORE UPDATE ON identity.profiles
  FOR EACH ROW
  EXECUTE FUNCTION identity.trigger_set_timestamp();

CREATE TRIGGER set_timestamp_buyer_profiles
  BEFORE UPDATE ON identity.buyer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION identity.trigger_set_timestamp();

CREATE TRIGGER set_timestamp_seller_profiles
  BEFORE UPDATE ON identity.seller_profiles
  FOR EACH ROW
  EXECUTE FUNCTION identity.trigger_set_timestamp();

CREATE TRIGGER set_timestamp_onboarding_steps
  BEFORE UPDATE ON identity.onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION identity.trigger_set_timestamp();
