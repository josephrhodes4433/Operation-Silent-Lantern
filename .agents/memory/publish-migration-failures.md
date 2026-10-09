---
name: Publish migration failures
description: A failed publish can leave the expected production schema fully applied.
---

After a migration-stage publish failure, inspect production schema read-only and obtain a fresh schema diff before proposing a schema fix.

**Why:** Publishing reported a migration failure while creating written-response history, yet production already contained the complete matching table, foreign key, and index. The logs did not expose the underlying error, so the exact cause was unconfirmed.

**How to apply:** If the schema diff is empty and the existing deployment is healthy, recommend a fresh publish without resetting data or introducing production migration hooks. Do not infer that a failed publish left the database unchanged.
