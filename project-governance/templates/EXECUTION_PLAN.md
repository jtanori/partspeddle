# Execution Plan Template

> **Mandatory before edits touching >5 files.**
> **Location:** `project-governance/templates/EXECUTION_PLAN.md`
> **Governance:** Section 15.6 of runtime-governance-kernel.md

---

## EXECUTION PLAN

**Ticket:** `{id}`
**Segment:** `{segment_id}`
**Estimated Runtime:** `{duration}`
**Risk Level:** `{low | medium | high}`

---

### Steps

1. {step 1 — file(s) affected}
2. {step 2 — file(s) affected}
3. {step 3 — file(s) affected}

---

### Estimated Files

| Operation | Count | Files |
|-----------|-------|-------|
| Modified | {n} | {list} |
| Created | {n} | {list} |
| Deleted | {n} | {list} |

---

### Dependencies

- {package | file | ticket needed}

### Rollback Strategy

- {git command or file backup plan}

---

### Validation Gates

- [ ] After step {n}: {validation command}
- [ ] Final: {full validation command}
