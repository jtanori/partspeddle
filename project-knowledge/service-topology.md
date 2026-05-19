VINTRACK — MVP Service Topology
Purpose

This document defines the initial service topology for the VINTRACK MVP.

The topology prioritizes:

operational simplicity
bounded-context clarity
implementation velocity
scalability readiness
infrastructure observability

The MVP intentionally avoids premature service fragmentation.

Topology Philosophy

The MVP architecture uses:

modular service boundaries
event-driven communication
queue-oriented orchestration
stateless execution
API boundary discipline

Services may initially deploy together while remaining logically isolated.

Logical isolation is more important than physical deployment separation during MVP.

Core Services
1. API Gateway
Purpose

Primary client entry point.

Responsibilities
request routing
auth propagation
rate limiting
request validation
API aggregation
edge orchestration
Dependencies
Identity
Marketplace
Transactions
Messaging
Search
2. Identity Service
Purpose

Manages authentication and user lifecycle.

Responsibilities
authentication
role management
onboarding
session validation
profile management
Infrastructure
Supabase Auth
Postgres
3. Marketplace Service
Purpose

Manages inventory and listings.

Responsibilities
listings
catalog organization
garage/yard management
media management
listing lifecycle
Infrastructure
Postgres
Supabase Storage
4. AI Service
Purpose

Provides AI-assisted inventory intelligence.

Responsibilities
image analysis
part identification
metadata enrichment
embedding generation
Infrastructure
Gemini API
Redis queues
5. Search Service
Purpose

Manages inventory retrieval.

Responsibilities
indexing
semantic search
filtering
ranking
retrieval orchestration
Infrastructure
Algolia
6. Transaction Service
Purpose

Handles transactional orchestration.

Responsibilities
carts
checkout
payments
escrow lifecycle
settlement orchestration
Infrastructure
Stripe
BullMQ
Redis
7. Messaging Service
Purpose

Provides realtime communication.

Responsibilities
conversations
realtime messaging
transaction chat
delivery status
Infrastructure
Supabase Realtime
8. Vault Service
Purpose

Provides escrow abstraction workflows.

Responsibilities
escrow states
custody tracking
release coordination
dispute holding
Infrastructure
Postgres
BullMQ
9. Notification Service
Purpose

Provides notification delivery infrastructure.

Responsibilities
email notifications
realtime alerts
transactional updates
Communication Model
Synchronous Communication

Allowed for:

lightweight queries
auth validation
retrieval endpoints
Asynchronous Communication

Required for:

AI processing
payment workflows
escrow transitions
indexing
notifications
enrichment pipelines
Queue Topology

Primary queues:

ai-processing
search-indexing
transaction-orchestration
payment-webhooks
vault-transitions
notification-delivery

BullMQ + Redis provide:

retries
dead-letter handling
concurrency management
scheduling
Observability Requirements

Every service must emit:

structured logs
metrics
traces
correlation IDs
workflow identifiers

Critical workflows must support end-to-end traceability.

Deployment Philosophy

The MVP may initially deploy as:

modular services
shared infrastructure
shared deployment clusters

Physical decomposition may evolve later.

Do NOT prematurely optimize deployment fragmentation.

Final Principle

The MVP topology must remain:

modular
scalable
observable
operationally realistic
implementation-oriented

without introducing unnecessary distributed complexity.