VINTRACK — Ubiquitous Language
Purpose

Defines the canonical operational vocabulary for the VINTRACK MVP.

This document establishes:

semantic consistency
domain terminology
entity naming
workflow vocabulary
transactional language

All:

schemas
APIs
queues
events
services
repositories
tests
documentation

must adhere to this vocabulary.

No competing terminology is allowed.

Core Philosophy

Language drift creates architectural drift.

Semantic consistency is mandatory for:

maintainability
event clarity
orchestration consistency
AI context quality
schema stability
operational observability

The platform must use:

deterministic terminology
explicit operational semantics
domain-consistent naming
Canonical Terms
User

Authenticated platform actor.

May operate as:

buyer
seller
administrator

The term "account" is infrastructure terminology only.

Business logic should use "User".

Buyer

User acquiring inventory through transactional workflows.

Seller

User publishing and fulfilling inventory listings.

Listing

Publicly visible inventory offering.

A listing is NOT:

raw inventory
catalog storage
transactional history

Listings are discoverable marketplace representations.

Inventory Item

Canonical inventory object owned by a seller.

Inventory Items may:

exist unpublished
belong to catalogs
generate listings
Catalog

Logical inventory grouping.

Used for:

organization
management
retrieval
Garage

Seller-managed logical inventory workspace.

Represents:

inventory ownership
operational organization
Yard

Physical or logical storage grouping inside a Garage.

Represents:

physical inventory segmentation
organizational grouping
Cart

Temporary transactional staging object.

Used before checkout initiation.

A cart is NOT an order.

Checkout

Transactional initiation workflow.

Coordinates:

validation
inventory locking
payment authorization
escrow preparation
Transaction

Authoritative operational commerce workflow.

Transactions control:

payment state
escrow state
shipment state
settlement lifecycle
Escrow

Protected settlement holding mechanism.

Escrow states control:

payment protection
release timing
dispute holding
Vault

Operational abstraction representing custody and escrow orchestration.

The MVP Vault is NOT:

institutional storage
warehouse infrastructure
physical custody infrastructure

The MVP Vault is a transactional coordination layer.

Settlement

Final release of escrowed funds.

Settlement occurs only after:

delivery
inspection
dispute resolution
Dispute

Operational conflict state requiring intervention.

Disputes suspend normal settlement progression.

Conversation

Persistent communication channel between users.

Message

Durable communication artifact within a Conversation.

AI Analysis

Machine-generated enrichment or identification output.

AI output is advisory, not authoritative.

Identification

AI-assisted classification of inventory.

Enrichment

AI-assisted metadata expansion.

Examples:

compatibility
tags
condition summaries
categorization
Event

Immutable operational fact emitted by a domain.

Events are:

durable
replayable
observable

Events are NOT:

internal callbacks
temporary signals
mutable records
Queue

Durable orchestration mechanism for asynchronous workflows.

State Machine

Authoritative workflow transition controller.

State machines govern:

transactions
escrow
fulfillment
settlement
Aggregate

Domain-owned consistency boundary.

Aggregates own:

invariants
state transitions
business rules
Correlation ID

Identifier used to trace distributed workflows across:

queues
services
events
webhooks
Prohibited Terminology

The following terms should be avoided unless technically necessary:

store
shop
product
merchant
vendor
ecommerce
inventory stock
customer order
chat thread

These terms introduce incorrect marketplace semantics.

Naming Conventions
Events

Format:

domain.action

Examples:

listing.created
payment.authorized
vault.locked
message.sent
Queues

Format:

domain-purpose

Examples:

transaction-orchestration
vault-transitions
ai-processing
Services

Format:

domain-service

Examples:

marketplace-service
transaction-service
vault-service
Database Tables

Format:

snake_case_plural

Examples:

listings
transactions
vault_sessions
Final Principle

The ubiquitous language is authoritative operational vocabulary.

Architectural consistency depends on semantic consistency.