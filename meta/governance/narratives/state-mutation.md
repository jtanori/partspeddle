# Narrative: State Mutation Rules

## Purpose

Prevent concurrent mutation chaos, conflicting ticket ownership, and checkpoint corruption.

## Philosophy

`active-execution.json` is the kernel of the governance runtime. If it becomes inconsistent, every downstream projection (status reports, heartbeats, drift detection) becomes a lie. The Golden Rule exists because there is no recovery from corrupted runtime state — only reconstruction from checkpoints, which is expensive and lossy.

## Historical Context

The 5-event restriction was derived from analyzing corruption incidents. Every unauthorized write to runtime state produced cascading failures: stale lock files, orphaned executions, duplicate ticket assignments, and false completion reports. The lock architecture prevents concurrent mutation; the event enumeration prevents unauthorized mutation.

## Future Evolution

M17 may introduce distributed lock coordination if multi-agent execution is supported. Until then, single-lock semantics are sufficient.
