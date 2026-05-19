# VINTRACK — MVP Domain Map

# Purpose

This document defines the bounded contexts, ownership boundaries, operational responsibilities, and interaction surfaces for the VINTRACK MVP architecture.

The MVP architecture intentionally constrains platform scope to:

* validate transactional trust flows
* validate AI-assisted commerce
* validate inventory liquidity
* validate escrow orchestration
* validate operational feasibility

This is not the full VINTRACK platform scope.

Only domains required for the MVP transactional lifecycle are included.

---

# Architectural Philosophy

The MVP architecture follows:

* domain-driven design
* bounded context isolation
* event-driven orchestration
* queue-first workflows
* deterministic transaction handling
* observability-first implementation

The MVP must remain:

* modular
* operationally realistic
* scalable
* constrained
* implementation-oriented

The system must avoid:

* speculative infrastructure
* premature distributed complexity
* unnecessary microservices
* architecture theater

---

# MVP Bounded Contexts

---

# 1. Identity Domain

## Purpose

Responsible for:

* authentication
* authorization
* user identity
* buyer/seller role management
* onboarding
* account lifecycle management

## Core Responsibilities

* user registration
* session handling
* role assignment
* profile management
* seller activation
* account status enforcement

## Core Entities

* User
* Profile
* SellerProfile
* BuyerProfile
* UserSession

## Owned Data

* user credentials
* profile metadata
* permissions
* onboarding status
* verification status

## External Dependencies

* Supabase Auth
* Notifications

## Emits Events

```txt id="s7kq18"
user.created
user.updated
seller.activated
profile.updated
```

---

# 2. Marketplace Domain

## Purpose

Responsible for inventory and listing management.

The marketplace domain controls:

* listing lifecycle
* inventory organization
* garage/yard structure
* media management
* pricing metadata
* publishing workflows

## Core Responsibilities

* create listings
* manage inventory
* publish/unpublish listings
* media attachment
* categorization
* inventory organization

## Core Entities

* Listing
* InventoryItem
* Catalog
* Collection
* Garage
* Yard
* MediaAsset

## Owned Data

* listing data
* inventory metadata
* listing status
* pricing data
* item descriptions
* image references

## External Dependencies

* AI Intelligence
* Search
* Transactions

## Emits Events

```txt id="2g5p4d"
listing.created
listing.updated
listing.published
listing.archived
inventory.updated
```

---

# 3. AI Intelligence Domain

## Purpose

Responsible for AI-assisted operational augmentation.

The AI domain enhances:

* item identification
* semantic tagging
* listing enrichment
* search augmentation
* recommendation signals

AI is assistive only.

AI is never authoritative over transactional truth.

## Core Responsibilities

* image analysis
* auto part identification
* metadata extraction
* semantic enrichment
* embedding generation
* recommendation support

## Core Entities

* AIAnalysis
* IdentificationResult
* SearchEmbedding
* EnrichmentTask

## Owned Data

* embeddings
* AI outputs
* confidence scores
* enrichment metadata

## External Dependencies

* Gemini API
* Marketplace
* Search

## Emits Events

```txt id="6s6fz9"
item.identified
listing.enriched
embedding.generated
```

---

# 4. Search Domain

## Purpose

Responsible for inventory discovery and retrieval.

The search domain provides:

* indexed retrieval
* semantic discovery
* filtering
* ranking
* query optimization

## Core Responsibilities

* Algolia indexing
* semantic search
* relevance ranking
* filter orchestration
* search analytics

## Core Entities

* SearchDocument
* SearchIndex
* SearchQuery

## Owned Data

* search indexes
* ranking metadata
* retrieval metadata

## External Dependencies

* Algolia
* Marketplace
* AI Intelligence

## Emits Events

```txt id="x6qk0f"
search.indexed
search.reindexed
```

---

# 5. Transactions Domain

## Purpose

Responsible for transactional orchestration.

This is the operational heart of the MVP.

The transaction domain controls:

* cart lifecycle
* checkout orchestration
* payment coordination
* escrow state transitions
* settlement lifecycle

## Core Responsibilities

* cart management
* checkout handling
* order orchestration
* escrow coordination
* payment lifecycle
* transaction state management

## Core Entities

* Cart
* Order
* Transaction
* EscrowSession
* PaymentIntent

## Owned Data

* transaction states
* payment references
* cart contents
* escrow states
* settlement metadata

## External Dependencies

* Stripe
* Vault
* Marketplace
* Messaging

## Emits Events

```txt id="k7b1n0"
cart.updated
checkout.started
payment.completed
escrow.created
transaction.completed
```

---

# 6. Messaging Domain

## Purpose

Responsible for realtime communication between buyers and sellers.

Messaging must remain transaction-aware.

## Core Responsibilities

* realtime chat
* conversation lifecycle
* transactional messaging
* notification triggers

## Core Entities

* Conversation
* Message
* ConversationParticipant

## Owned Data

* message history
* conversation metadata
* unread states

## External Dependencies

* Realtime
* Notifications
* Transactions

## Emits Events

```txt id="7q9a2u"
conversation.created
message.sent
message.read
```

---

# 7. Vault Domain (MVP)

## Purpose

The MVP vault domain acts as a simplified escrow abstraction layer.

This is NOT institutional custody infrastructure.

The MVP vault domain controls:

* escrow holding states
* release coordination
* custody status tracking
* dispute hold states

## Core Responsibilities

* escrow state management
* custody tracking
* release authorization
* settlement coordination

## Core Entities

* VaultSession
* CustodyRecord
* ReleaseRequest

## Owned Data

* escrow status
* custody metadata
* release states

## External Dependencies

* Transactions
* Stripe

## Emits Events

```txt id="wb0j7n"
vault.locked
vault.released
vault.disputed
```

---

# 8. Notifications Domain

## Purpose

Responsible for cross-platform user notifications.

## Core Responsibilities

* email notifications
* realtime notifications
* transactional alerts
* workflow updates

## Core Entities

* Notification
* NotificationPreference

## Owned Data

* delivery status
* preferences
* notification history

## Emits Events

```txt id="e8h5p1"
notification.sent
notification.failed
```

---

# Domain Interaction Rules

Domains communicate through:

* events
* queues
* explicit contracts

Domains must NOT:

* directly mutate another domain’s owned data
* bypass transactional boundaries
* introduce implicit coupling

---

# MVP Exclusions

The MVP intentionally excludes:

* advanced reputation systems
* institutional vault orchestration
* distributed logistics intelligence
* graph-native operational runtime
* autonomous moderation
* advanced fraud intelligence
* multi-region orchestration
* complex warehouse management
* advanced recommendation systems

These systems belong to later architectural phases.

---

# Final Principle

The MVP architecture exists to validate:

* trusted commerce
* AI-assisted inventory intelligence
* escrow orchestration
* operational viability
* transactional trust

without sacrificing long-term architectural scalability.
