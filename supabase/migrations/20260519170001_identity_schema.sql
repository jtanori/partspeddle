-- T2.1 + T2.1A — Identity Database Schema
-- Creates the identity bounded context tables with constraints and indexes.
-- VINTRACK owns identity.users as the system-of-record.
--
-- Owning domain: Identity
-- Emits: identity.user_created, identity.seller_activated, identity.seller_suspended
-- Consuming workflows: Marketplace (seller activation), Search (profile indexing)

CREATE SCHEMA IF NOT EXISTS identity;

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE identity.user_status AS ENUM ('active', 'suspended', 'deactivated');
CREATE TYPE identity.seller_status AS ENUM ('draft', 'pending_review', 'active', 'suspended');
CREATE TYPE identity.onboarding_step_type AS ENUM ('identity', 'banking', 'tax', 'terms');

-- ─── Users ────────────────────────────────────────────────────────────────────
-- Canonical user identity owned by VINTRACK.
-- id is initially the Supabase Auth user UUID (zero mapping overhead).
-- auth_provider future-proofs multi-provider expansion.
CREATE TABLE identity.users (
  id UUID PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT 'supabase',
  email TEXT NOT NULL,
  status identity.user_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email)
);

COMMENT ON TABLE identity.users IS 'Canonical user identity. VINTRACK system-of-record for user lifecycle.';

-- ─── Profiles ─────────────────────────────────────────────────────────────────
-- One-to-one with identity.users. Created lazily on first authenticated request
-- or via webhook reconciliation.
CREATE TABLE identity.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_user_id_unique UNIQUE (user_id)
);

COMMENT ON TABLE identity.profiles IS 'Public user profile, owned by Identity domain.';

-- ─── Buyer Profiles ───────────────────────────────────────────────────────────
-- Lazy-created on first buyer action. Minimal footprint.
CREATE TABLE identity.buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT buyer_profiles_user_id_unique UNIQUE (user_id)
);

COMMENT ON TABLE identity.buyer_profiles IS 'Buyer-specific profile, lazy-created.';

-- ─── Seller Profiles ──────────────────────────────────────────────────────────
-- Tracks seller lifecycle with state machine enforcement at application layer.
CREATE TABLE identity.seller_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  status identity.seller_status NOT NULL DEFAULT 'draft',
  stripe_connect_account_id TEXT,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT seller_profiles_user_id_unique UNIQUE (user_id),
  CONSTRAINT seller_profiles_stripe_unique UNIQUE (stripe_connect_account_id)
);

COMMENT ON TABLE identity.seller_profiles IS 'Seller profile with onboarding state machine.';

-- ─── Onboarding Steps ─────────────────────────────────────────────────────────
-- Tracks completion of mandatory seller onboarding steps.
CREATE TABLE identity.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_profile_id UUID NOT NULL REFERENCES identity.seller_profiles(id) ON DELETE CASCADE,
  step identity.onboarding_step_type NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT onboarding_steps_unique UNIQUE (seller_profile_id, step)
);

COMMENT ON TABLE identity.onboarding_steps IS 'Individual onboarding step completions per seller.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_users_email ON identity.users(email);
CREATE INDEX idx_profiles_user_id ON identity.profiles(user_id);
CREATE INDEX idx_buyer_profiles_user_id ON identity.buyer_profiles(user_id);
CREATE INDEX idx_seller_profiles_user_id ON identity.seller_profiles(user_id);
CREATE INDEX idx_seller_profiles_status ON identity.seller_profiles(status) WHERE status != 'draft';
CREATE INDEX idx_onboarding_steps_seller ON identity.onboarding_steps(seller_profile_id);
