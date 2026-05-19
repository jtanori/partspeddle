# VINTRACK — Identity Domain Database Schema

## Storage

Postgres (via Supabase). All tables use `uuid` primary keys and `timestamptz` for temporal fields.

Naming convention: `snake_case_plural` per ubiquitous language.

---

## Table: `users`

Synchronized from Supabase Auth. The Identity domain treats this as read-mostly with controlled mutations for operational fields.

```sql
CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deactivated');

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role user_role NOT NULL DEFAULT 'buyer',
    status user_status NOT NULL DEFAULT 'active',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sign_in_at TIMESTAMPTZ,

    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_phone_unique UNIQUE (phone),
    CONSTRAINT users_id_fk_auth_users FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status) WHERE status != 'active';
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
```

### Notes

* `id` is a foreign key to `auth.users(id)` ensuring referential integrity.
* `email` and `phone` are unique to prevent duplicate identity records.
* `status` is indexed with a partial index for active exclusion queries (common for listing eligibility checks).

---

## Table: `profiles`

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT,
    location JSONB,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    locale VARCHAR(10) NOT NULL DEFAULT 'en-US',
    notification_preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT profiles_user_id_unique UNIQUE (user_id),
    CONSTRAINT profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_display_name_check CHECK (
        display_name IS NULL OR (
            LENGTH(display_name) >= 1 AND
            LENGTH(display_name) <= 100 AND
            display_name !~ '[\x00-\x1F\x7F]'
        )
    ),
    CONSTRAINT profiles_avatar_url_check CHECK (
        avatar_url IS NULL OR (
            avatar_url ~ '^https://' AND
            LENGTH(avatar_url) <= 2048
        )
    )
);

CREATE INDEX idx_profiles_display_name ON profiles(display_name);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
```

---

## Table: `buyer_profiles`

```sql
CREATE TABLE buyer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    default_shipping_address JSONB,
    purchase_count INTEGER NOT NULL DEFAULT 0,
    total_spend_cents INTEGER NOT NULL DEFAULT 0,
    preferred_payment_method VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT buyer_profiles_user_id_unique UNIQUE (user_id),
    CONSTRAINT buyer_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT buyer_profiles_purchase_count_nonnegative CHECK (purchase_count >= 0),
    CONSTRAINT buyer_profiles_spend_nonnegative CHECK (total_spend_cents >= 0)
);

CREATE INDEX idx_buyer_profiles_user_id ON buyer_profiles(user_id);
```

---

## Table: `seller_profiles`

```sql
CREATE TYPE seller_status AS ENUM ('pending', 'onboarding', 'review', 'active', 'suspended');

CREATE TABLE seller_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status seller_status NOT NULL DEFAULT 'pending',
    stripe_connect_account_id VARCHAR(255),
    payout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    listing_count INTEGER NOT NULL DEFAULT 0,
    total_sales_cents INTEGER NOT NULL DEFAULT 0,
    rating_average DECIMAL(2,1),
    verified_identity BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,

    CONSTRAINT seller_profiles_user_id_unique UNIQUE (user_id),
    CONSTRAINT seller_profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT seller_profiles_stripe_account_unique UNIQUE (stripe_connect_account_id),
    CONSTRAINT seller_profiles_listing_count_nonnegative CHECK (listing_count >= 0),
    CONSTRAINT seller_profiles_sales_nonnegative CHECK (total_sales_cents >= 0),
    CONSTRAINT seller_profiles_rating_range CHECK (
        rating_average IS NULL OR (rating_average >= 0.0 AND rating_average <= 5.0)
    )
);

CREATE INDEX idx_seller_profiles_status ON seller_profiles(status);
CREATE INDEX idx_seller_profiles_user_id ON seller_profiles(user_id);
CREATE INDEX idx_seller_profiles_stripe_account ON seller_profiles(stripe_connect_account_id);
```

---

## Table: `onboarding_states`

```sql
CREATE TABLE onboarding_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_profile_id UUID NOT NULL,
    step_identity BOOLEAN NOT NULL DEFAULT FALSE,
    step_payout BOOLEAN NOT NULL DEFAULT FALSE,
    step_terms BOOLEAN NOT NULL DEFAULT FALSE,
    step_profile BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT onboarding_states_seller_profile_id_unique UNIQUE (seller_profile_id),
    CONSTRAINT onboarding_states_seller_profile_id_fk FOREIGN KEY (seller_profile_id) REFERENCES seller_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_onboarding_states_seller_profile ON onboarding_states(seller_profile_id);
CREATE INDEX idx_onboarding_states_completed ON onboarding_states(completed_at) WHERE completed_at IS NOT NULL;
```

---

## Table: `user_sessions`

```sql
CREATE TYPE session_type AS ENUM ('web', 'mobile', 'api');
CREATE TYPE revoke_reason AS ENUM ('logout', 'expiry', 'admin_action', 'suspension', 'security');

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_type session_type NOT NULL,
    ip_address INET,
    user_agent TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_reason revoke_reason,

    CONSTRAINT user_sessions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT user_sessions_temporal_check CHECK (
        ended_at IS NULL OR ended_at >= started_at
    ),
    CONSTRAINT user_sessions_revocation_check CHECK (
        (revoked = FALSE AND ended_at IS NULL AND revoked_reason IS NULL) OR
        (revoked = TRUE AND ended_at IS NOT NULL AND revoked_reason IS NOT NULL)
    )
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_started_at ON user_sessions(started_at);
CREATE INDEX idx_user_sessions_active ON user_sessions(user_id, started_at) WHERE ended_at IS NULL;
```

### Retention

Automated purge: sessions older than 90 days are deleted via scheduled job.

```sql
-- Retention purge (runs daily via pg_cron or queue worker)
DELETE FROM user_sessions WHERE started_at < NOW() - INTERVAL '90 days';
```

---

## Row-Level Security (RLS)

All Identity tables enforce RLS. The service role bypasses RLS for queue workers and event emitters.

### `users`

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own record
CREATE POLICY users_self_select ON users
    FOR SELECT USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY users_admin_select ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Service role can manage all (bypass via supabase service_key)
```

### `profiles`

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_select ON profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY profiles_self_update ON profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY profiles_public_select ON profiles
    FOR SELECT USING (TRUE); -- Profiles are public for marketplace discovery
```

### `buyer_profiles`

```sql
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyer_profiles_self_all ON buyer_profiles
    FOR ALL USING (auth.uid() = user_id);
```

### `seller_profiles`

```sql
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY seller_profiles_self_select ON seller_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY seller_profiles_public_select ON seller_profiles
    FOR SELECT USING (status = 'active');

CREATE POLICY seller_profiles_admin_all ON seller_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );
```

### `onboarding_states`

```sql
ALTER TABLE onboarding_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_states_self_all ON onboarding_states
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM seller_profiles sp
            WHERE sp.id = onboarding_states.seller_profile_id
            AND sp.user_id = auth.uid()
        )
    );
```

### `user_sessions`

```sql
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_sessions_self_select ON user_sessions
    FOR SELECT USING (auth.uid() = user_id);
```

---

## Database Functions & Triggers

### Auto-Update `updated_at`

```sql
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_profiles BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_buyer_profiles BEFORE UPDATE ON buyer_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_seller_profiles BEFORE UPDATE ON seller_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER set_timestamp_onboarding_states BEFORE UPDATE ON onboarding_states
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
```

### User Creation Trigger

When a user is created in `auth.users`, sync to `users` and auto-create `profile`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, email_verified, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.email_confirmed_at IS NOT NULL,
        NEW.created_at,
        NEW.updated_at
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Onboarding Completion Trigger

When all onboarding steps are complete, transition `seller_profiles.status` to `review`:

```sql
CREATE OR REPLACE FUNCTION public.handle_onboarding_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.step_identity AND NEW.step_payout AND NEW.step_terms AND NEW.step_profile THEN
        IF NEW.completed_at IS NULL THEN
            NEW.completed_at = NOW();

            UPDATE seller_profiles
            SET status = 'review', updated_at = NOW()
            WHERE id = NEW.seller_profile_id
              AND status = 'onboarding';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER onboarding_completion
    BEFORE UPDATE ON onboarding_states
    FOR EACH ROW EXECUTE FUNCTION public.handle_onboarding_completion();
```

---

## Indexes Summary

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `users` | `idx_users_email` | B-tree | Login lookups |
| `users` | `idx_users_status` | Partial B-tree | Active exclusion queries |
| `profiles` | `idx_profiles_display_name` | B-tree | Search/discovery |
| `seller_profiles` | `idx_seller_profiles_status` | B-tree | Listing eligibility filters |
| `seller_profiles` | `idx_seller_profiles_stripe_account` | B-tree | Stripe webhook reconciliation |
| `user_sessions` | `idx_user_sessions_active` | Partial B-tree | Active session queries |

---

## Constraints Summary

| Constraint | Type | Table | Purpose |
|------------|------|-------|---------|
| `users_id_fk_auth_users` | Foreign Key | `users` | Auth sync integrity |
| `users_email_unique` | Unique | `users` | Duplicate prevention |
| `profiles_user_id_unique` | Unique | `profiles` | One profile per user |
| `seller_profiles_user_id_unique` | Unique | `seller_profiles` | One seller profile per user |
| `seller_profiles_stripe_account_unique` | Unique | `seller_profiles` | Stripe account uniqueness |
| `user_sessions_temporal_check` | Check | `user_sessions` | Temporal consistency |
| `user_sessions_revocation_check` | Check | `user_sessions` | Revocation consistency |
