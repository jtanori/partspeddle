# VINTRACK — MVP Event Taxonomy

# Purpose

This document defines the canonical domain event system for the VINTRACK MVP.

Events are the primary orchestration mechanism across bounded contexts.

Events represent:

* immutable operational facts
* workflow transitions
* asynchronous triggers
* audit records
* distributed coordination signals

Events are authoritative system behavior contracts.

---

# Event Philosophy

Events must be:

* immutable
* explicit
* replayable
* traceable
* idempotent
* observable

Events are not internal implementation details.

Events define operational truth across the platform.

---

# Canonical Event Structure

All events must include:

```json
{
  "eventId": "uuid",
  "eventType": "domain.action",
  "eventVersion": 1,
  "occurredAt": "ISO8601",
  "correlationId": "uuid",
  "causationId": "uuid",
  "actorId": "uuid | system",
  "domain": "marketplace",
  "aggregateId": "uuid",
  "payload": {},
  "metadata": {}
}
```

---

# Event Categories

---

# Identity Events

```txt id="e1h0fx"
user.created
user.updated
user.suspended
seller.activated
seller.deactivated
profile.updated
session.created
session.revoked
```

## Producers

* Identity Service

## Consumers

* Notifications
* Marketplace
* Transactions

---

# Marketplace Events

```txt id="5k5qmd"
listing.created
listing.updated
listing.published
listing.archived
listing.deleted
inventory.created
inventory.updated
media.uploaded
media.deleted
```

## Producers

* Marketplace Service

## Consumers

* Search
* AI Service
* Notifications

---

# AI Events

```txt id="k5qu6i"
item.identification.started
item.identified
item.identification.failed
listing.enriched
embedding.generated
embedding.failed
ai.analysis.completed
```

## Producers

* AI Service

## Consumers

* Marketplace
* Search
* Notifications

---

# Search Events

```txt id="4f5j4n"
search.indexed
search.reindexed
search.index.failed
search.document.removed
```

## Producers

* Search Service

## Consumers

* Observability
* Analytics

---

# Transaction Events

```txt id="4f71e8"
transaction.created
cart.updated
checkout.started
checkout.abandoned
payment.pending
payment.authorized
payment.failed
escrow.created
escrow.locked
transaction.cancelled
transaction.completed
settlement.started
settlement.completed
```

## Producers

* Transaction Service

## Consumers

* Vault
* Notifications
* Messaging
* Analytics

---

# Messaging Events

```txt id="r0uqrm"
conversation.created
message.sent
message.read
message.deleted
conversation.archived
```

## Producers

* Messaging Service

## Consumers

* Notifications
* Analytics

---

# Vault Events

```txt id="9p5l5t"
vault.locked
vault.released
vault.disputed
vault.hold.created
vault.hold.released
custody.updated
```

## Producers

* Vault Service

## Consumers

* Transactions
* Notifications

---

# Notification Events

```txt id="zyjlwm"
notification.created
notification.sent
notification.delivered
notification.failed
```

## Producers

* Notification Service

---

# Event Delivery Rules

Events must support:

* at-least-once delivery
* retryability
* replayability
* dead-letter handling

Consumers MUST be idempotent.

---

# Event Ownership Rules

Only the owning domain may emit authoritative events about its aggregates.

Example:

* only Marketplace may emit listing.published
* only Transactions may emit payment.authorized

Cross-domain mutation through direct DB writes is prohibited.

---

# Correlation Requirements

Critical workflows must propagate:

* correlation IDs
* causation IDs
* transaction IDs

across:

* queues
* webhooks
* services
* async jobs

---

# Event Versioning

Events are immutable contracts.

Breaking changes require:

* version increments
* migration strategy
* compatibility review

---

# Replay Philosophy

The system must support:

* workflow replay
* audit replay
* operational reconstruction
* incident analysis

Events must therefore remain durable and historically accessible.

---

# Final Principle

Events are the operational nervous system of VINTRACK.

All distributed coordination flows through explicit domain events rather than hidden service coupling.

---