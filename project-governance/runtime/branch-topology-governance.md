# Branch Topology Governance

> Established: 2026-05-26
> Authority: M32 preparation — branch topology cleanup

## Current Topology

```
main  ← sole authoritative branch
forensic/recovery-contaminated-snapshot-2026-05-21  ← immutable evidence tag
```

## Deleted Branches (rationale)

| Branch | Reason | Preserved? |
|--------|--------|------------|
| `develop` | 70 commits behind main, 4 stale M2-era commits, permanently diverged | No — unrecoverable |
| `feature/T2.x-m2-planning-revision` | Superset of stale develop state, M2 governance leakage into implementation branch | No — unrecoverable |
| `recovery/contaminated-snapshot-2026-05-21` | Converted to immutable tag | Yes — `forensic/recovery-contaminated-snapshot-2026-05-21` |

## Branch Class Policy

| Class | Purpose | Lifecycle |
|-------|---------|-----------|
| `main` | Production-authoritative state | Permanent |
| `feature/*` | Bounded implementation work | Ephemeral, delete after merge |
| `governance/*` | Planning/spec/governance evolution | Ephemeral, delete after merge |
| `recovery/*` | Immutable forensic snapshots | Convert to tag, then delete branch |
| `repair/*` | Integrity restoration work | Ephemeral, delete after merge |
| `migration/*` | Schema/state transitions | Ephemeral, delete after merge |
| `validation/*` | Audit/reconciliation/testing | Ephemeral, delete after merge |
| `experiment/*` | Disposable research | Ephemeral, auto-delete after 7 days |

## Rules

1. **No execution on `main` during recovery.** If recovery is needed, create `repair/*` from `main`, do not work directly on `main`.
2. **Recovery branches are tags, not branches.** Any `recovery/*` branch must be converted to a `forensic/*` tag within 24 hours.
3. **No governance leakage into feature branches.** Planning revisions live in `governance/*` branches, not `feature/*`.
4. **Develop branch is abolished.** Integration happens on `main` with feature branches. A `develop` branch will only be recreated if CI/CD staging requires it.
5. **Feature branches are single-ticket scoped.** One branch = one ticket. No milestone-wide feature branches.

## Enforcement

- `scripts/validate-repository-hygiene.ts` will flag branch topology violations
- `p0:validate` includes repository hygiene check

---

*Cleanup commit: TBD*
