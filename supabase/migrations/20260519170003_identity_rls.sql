-- T2.1 + T2.1A — Identity Row-Level Security (Minimal)
--
-- VINTRACK's security model is service-backend-owned, NOT RLS-dependent.
-- API middleware verifies JWT, lazy-provisions users, and repositories scope queries.
--
-- RLS here is a defense-in-depth deny-all fallback. Application code is the
-- primary authorization mechanism. See ADR-002.

-- ─── Enable RLS on all identity tables ────────────────────────────────────────
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- ─── Deny-all fallback policies ───────────────────────────────────────────────
-- Service role (backend) bypasses RLS by default. These policies block
-- direct client connections that somehow bypass application logic.
CREATE POLICY users_deny_all ON identity.users FOR ALL USING (FALSE);
CREATE POLICY profiles_deny_all ON identity.profiles FOR ALL USING (FALSE);
CREATE POLICY buyer_profiles_deny_all ON identity.buyer_profiles FOR ALL USING (FALSE);
CREATE POLICY seller_profiles_deny_all ON identity.seller_profiles FOR ALL USING (FALSE);
CREATE POLICY onboarding_steps_deny_all ON identity.onboarding_steps FOR ALL USING (FALSE);

-- ─── Force RLS for table owners ───────────────────────────────────────────────
ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.buyer_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.seller_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.onboarding_steps FORCE ROW LEVEL SECURITY;
