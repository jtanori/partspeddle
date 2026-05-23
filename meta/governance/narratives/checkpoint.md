# Narrative: Checkpoint Protocol

## Purpose

This protocol defines when checkpoints are written, what they contain, and how execution resumes from them. It ensures that **no work is lost to context window limits, user interruptions, or system failures**.

**Without this protocol:** Every interruption requires re-reading the entire codebase and re-reasoning from scratch.  
**With this protocol:** Interruption is a pause, not a reset.

## Philosophy

Checkpoints are not optional optimism. They are mandatory pessimism — the assumption that interruption is the default state of long-running execution. The checkpoint is the agent's "save state." Without it: anchorless drift, re-analysis loops, architecture re-invention.

## Historical Context

The 10 mandatory checkpoint triggers were derived from incident analysis. The most common failure mode was agents losing 30+ minutes of reasoning to context compaction because no checkpoint had been written. The 5-minute throttle prevents checkpoint spam while the 10-file / 30-minute hard limits prevent silent drift.

## Future Evolution

M14 may introduce automatic checkpoint emission via heartbeat integration, eliminating the need for manual checkpoint triggers.
