# Recovery: Contaminated Branch

> **Trigger:** `repository.validate` returns FAIL with dirty worktree OR branch contains mixed-domain commits.
> **Authority:** `REPOSITORY_GOVERNANCE_PROTOCOL.md`
> **Severity:** HIGH

---

## Detection

```bash
tools/repository/validate.sh
# Output: status=FAIL, errors=["Worktree dirty: N uncommitted changes"]
```

OR:

Branch history shows commits from multiple tickets/milestones interleaved.

---

## Recovery Steps

### Step 1: STOP

Do not commit. Do not continue work. Do not merge.

### Step 2: Preserve State

```bash
git checkout -b recovery/contaminated-snapshot-$(date +%Y-%m-%d)
git add -A
git commit -m "RECOVERY: contaminated snapshot before remediation"
```

### Step 3: Identify Domains

List all changed files and categorize by domain:

```bash
git diff --name-only HEAD~1 | sort
```

### Step 4: Create Clean Branches from Base

```bash
git checkout main
git checkout -b feature/<domain>-<descriptor>
```

One branch per domain. No exceptions.

### Step 5: Selective Extraction

```bash
git checkout recovery/<snapshot> -- <domain-specific-files>
git commit -m "<domain>(<scope>): reconstruct from contaminated snapshot"
```

### Step 6: Validate Isolation

```bash
for b in feature/*; do
  git checkout $b
  tools/repository/validate.sh
  # Must return PASS with 0 dirty files
done
```

### Step 7: Delete Contaminated Branch

```bash
git branch -D <contaminated-branch-name>
```

### Step 8: Archive Recovery Branch

Keep `recovery/` branch for 30 days. Then delete.

---

## Validation

- [ ] All domain branches have 0 uncommitted changes
- [ ] No file appears on more than one domain branch
- [ ] `repository.validate` passes on all branches
- [ ] Recovery branch exists as forensic anchor
