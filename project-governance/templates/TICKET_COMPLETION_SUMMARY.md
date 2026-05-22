# Ticket Completion Summary Template

> **Mandatory.** The agent MUST NOT mark a ticket complete without filling this template.
> **Location:** `project-governance/templates/TICKET_COMPLETION_SUMMARY.md`
> **Governance:** Section 15.3 of runtime-governance-kernel.md

---

## TICKET COMPLETION SUMMARY

**Ticket:** `{id}`
**Objective:** `{one sentence describing purpose}`
**Execution Duration:** `{actual time spent}`
**Surface:** `{frontend | backend | shared | infrastructure}`

---

### Files Created

- `path/to/file.ts` — purpose and scope

### Files Modified

- `path/to/file.ts` — what changed and why

### Files Deleted

- `path/to/file.ts` — reason for deletion

---

### Architectural Changes

- {bullet point}

### Dependency Changes

- **Added:** `package@version` — purpose
- **Removed:** `package` — reason

### Breaking Changes

- {none | list with migration path}

---

### Validation Performed

- [ ] Tests executed: `{command}` → `{result}`
- [ ] Lint checks: `{command}` → `{result}`
- [ ] Build checks: `{command}` → `{result}`
- [ ] TypeScript typecheck: `{command}` → `{result}`
- [ ] Runtime verification: `{description}` → `{result}`

### Validation Failures (if any)

- {description + remediation}

---

### Remaining Risks

- {risk + likelihood + impact}

### Deferred Work

- {what was skipped and why}

---

### Recommended Next Ticket

- `{id}` — `{reason}`

### Confidence Score

**{0-100}%**

### Reason for Confidence Score

{explanation}
