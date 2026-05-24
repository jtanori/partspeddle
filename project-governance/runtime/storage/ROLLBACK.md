# Storage Adapter Rollback Procedure

## Overview

This document describes how to rollback from the storage adapter abstraction to direct filesystem operations if critical issues are detected.

## Rollback Triggers

Rollback should be initiated when:
- Storage adapter causes data corruption
- Performance regression exceeds 10%
- Atomic write failures occur in production
- Governance event emission breaks

## Rollback Steps

1. **Stop all runtime scripts** that use the storage adapter
2. **Set environment variable**: `STORAGE_ADAPTER=disabled`
3. **Verify direct fs access** works for all runtime surfaces
4. **Run validation suite**: `npm run invariant:validate`
5. **Run storage migration check**: `npm run storage:migrate-check`
6. **Monitor for 24 hours** before re-enabling adapter

## Configuration-Based Selection

The adapter can be disabled via configuration without code changes:

```typescript
// In scripts/runtime-storage.ts
const useAdapter = process.env.STORAGE_ADAPTER !== "disabled";
const storage = useAdapter ? getRuntimeStorage() : null;
```

## Verification

After rollback, verify:
- [ ] All governance scripts execute correctly
- [ ] All invariant checks pass
- [ ] No data loss occurred
- [ ] Checkpoint lineage is intact

## Re-enabling

To re-enable the adapter after fixes:
1. Clear `STORAGE_ADAPTER` environment variable
2. Run `npm run storage:test`
3. Run `npm run storage:migrate-check`
4. Verify zero direct fs mutations in critical paths
