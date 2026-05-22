# GOVERNANCE Validation Prompt

> **Validate governance artifact consistency.**

---

## Purpose

Ensure runtime governance artifacts are synchronized with:
- milestones
- tickets
- contracts
- repository evolution

## Validation Checklist

### Runtime State

- [ ] `active_milestone` matches latest non-completed milestone
- [ ] `active_ticket` is in `planned` or `in_progress` status
- [ ] `completed_tickets` are actually completed in ticket files
- [ ] `blocked_tickets` have documented blockers
- [ ] `updated_at` is recent

### Dependency Graph

- [ ] All tickets in `project-management/data/tickets/` are represented
- [ ] Milestone dependencies form a DAG (no cycles)
- [ ] Ticket dependencies are satisfied (no orphaned deps)
- [ ] Surfaces are valid per `surface-map.json`

### Contract Registry

- [ ] All contracts have a valid owner
- [ ] Locations exist in repository
- [ ] Consumers are valid surfaces
- [ ] No duplicate contract names

### Surface Map

- [ ] All surfaces have valid runtimes
- [ ] `allowed_imports` and `forbidden_imports` are disjoint
- [ ] Cross-surface rules are consistent

## Validation Command

```bash
npm run pm:validate
```

## If Validation Fails

1. Document discrepancies
2. Update offending artifacts
3. Re-run validation
4. Do not proceed with implementation until clean
