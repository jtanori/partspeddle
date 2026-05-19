# VINTRACK — Dependency Graph

> Mechanical derivation from architecture documents. Every edge represents a hard dependency.

---

## Milestone Dependencies

```
M1 (Foundations)
│
├─► M2 (Identity)
│   │
│   ├─► M3 (Marketplace) ──► M6 (Transactions) ──► M10 (Hardening)
│   │                           ▲
│   └───────────────────────────┘
│
├─► M4 (AI) ──► [Enhances M3]
│
├─► M5 (Search) ──► [Enhances M3]
│
M6 ──► M7 (Messaging)
M6 ──► M8 (Vault)
M6 ──► M9 (Notifications)
```

---

## Domain Event Dependencies

| Consumer Domain | Events Consumed | Producer Domain |
|-----------------|-----------------|-----------------|
| Marketplace | `user.created`, `seller.activated` | Identity |
| Transactions | `user.created`, `user.suspended` | Identity |
| Transactions | `listing.published`, `listing.updated` | Marketplace |
| AI Intelligence | `media.uploaded` | Marketplace |
| Search | `listing.published`, `listing.archived` | Marketplace |
| Vault | `escrow.created`, `escrow.locked` | Transactions |
| Notifications | All transaction events | Transactions |
| Notifications | `seller.activated` | Identity |
| Messaging | `transaction.created` | Transactions |

**Rule:** Downstream domains may not exist until upstream events are emitted.

---

## Database Dependencies

| Table | Owned By | Referenced By |
|-------|----------|---------------|
| `users` | Identity | All domains (FK) |
| `profiles` | Identity | — |
| `seller_profiles` | Identity | Marketplace (listing eligibility) |
| `listings` | Marketplace | Transactions (purchase) |
| `inventory_items` | Marketplace | — |
| `transactions` | Transactions | Vault (escrow), Messaging (context) |
| `escrow_sessions` | Vault | — |
| `carts` | Transactions | — |
| `conversations` | Messaging | — |
| `notifications` | Notifications | — |

**Rule:** No table may be mutated outside its owning domain. References are read-only projections.

---

## Queue Dependencies

| Queue | Producer | Consumer | Blocks If Down |
|-------|----------|----------|----------------|
| `identity-onboarding` | Identity API | Identity worker | Seller activation |
| `identity-webhooks` | Supabase | Identity worker | Auth sync |
| `transaction-orchestration` | Transactions API | Transactions worker | Checkout |
| `payment-webhooks` | Stripe | Transactions worker | Payment reconciliation |
| `search-indexing` | Marketplace events | Search worker | Search freshness |
| `ai-processing` | Marketplace events | AI worker | AI enrichment |
| `notification-delivery` | All domains | Notifications worker | User alerts |

---

## Service Dependencies

| Service | Depends On | Critical Path |
|---------|-----------|---------------|
| API Gateway | All domain APIs | Yes |
| Identity Service | Supabase Auth | Yes |
| Marketplace Service | Identity Service | Yes |
| Transaction Service | Identity, Marketplace, Stripe | Yes |
| Vault Service | Transaction Service | Yes |
| Messaging Service | Identity, Transaction | No |
| Notification Service | All domains | No |
| AI Service | Gemini API | No |
| Search Service | Algolia | No |

---

## Infrastructure Dependencies

| Component | Required By | Fallback |
|-----------|-------------|----------|
| Postgres | All domains | None (hard dependency) |
| Redis | Queue workers | In-memory buffer 60s, then Postgres deferred jobs |
| Supabase Auth | Identity | None (hard dependency) |
| Stripe | Transactions | None (hard dependency) |
| Algolia | Search | Degraded search (DB fallback) |
| Gemini API | AI | Skip enrichment |
| Email provider | Notifications | Queue backlog |

---

## Circular Dependency Check

| Potential Cycle | Resolution |
|-----------------|------------|
| Identity ↔ Marketplace | One-way: Marketplace consumes Identity events only |
| Transactions ↔ Vault | One-way: Vault consumes Transaction events only |
| Transactions ↔ Messaging | One-way: Messaging consumes Transaction events only |

**No cycles detected.**

---

## Impact Analysis

| If X Fails | Impact |
|-------------|--------|
| Identity down | No logins, no registrations, no seller activation → Platform halt |
| Marketplace down | No listings, no inventory → Discovery halt |
| Transactions down | No checkout, no payments → Commerce halt |
| Stripe down | No payment authorization → Checkout stall |
| Redis down | Queue enqueue fails → Async workflows stall |
| Postgres down | All state mutations fail → Platform halt |
| Search down | Discovery degraded → Commerce continues |
| AI down | No enrichment → Commerce continues |
| Notifications down | No alerts → Commerce continues |

---

## Final Principle

Dependencies are not organizational preferences. They are causal relationships in the architecture. Violating a dependency creates inconsistency. Inconsistency destroys trust.
