# Resume Packet Template

> **Mandatory on ANY interruption.** This is the agent's save state.
> **Location:** `project-governance/templates/RESUME_PACKET.md`
> **Governance:** Section 15.8 of runtime-governance-kernel.md

---

## RESUME PACKET

**Generated At:** `{YYYY-MM-DD HH:MM:SS}`
**Current Ticket:** `{id}`
**Current Milestone:** `{id}`
**Execution Phase:** `{BOOTSTRAP | VALIDATION | EXECUTION | VERIFICATION | CHECKPOINT | BLOCKED}`

---

### Completed

- [ ] {step 1}
- [ ] {step 2}

### In Progress

{description of current operation with file names}

### Pending

- [ ] {step 3}
- [ ] {step 4}

---

### Modified Files (with last change)

| File | Last Change | Status |
|------|-------------|--------|
| `path/to/file.ts` | {description} | {saved | unsaved} |

---

### Last Successful Validation

```bash
{command}
```
**Result:** {pass | fail | N/A}

---

### Known Issues

- {issue + context}

### Active Blockers

- {none | description}

---

### Governance State

- `runtime-state.json`: {loaded | modified | pending update}
- `latest-checkpoint.json`: {loaded | modified | pending update}
- `contract_lock`: {active | inactive} — locked: `{paths}`

---

### Recommended Resume Prompt

```
Resume execution for ticket {id}.
Load checkpoint from {checkpoint_path}.
Next step: {description}.
```

### Context Confidence

{high | medium | low} — {explanation}
