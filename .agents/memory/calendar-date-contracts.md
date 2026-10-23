---
name: Calendar dates in generated APIs
description: Why calendar-only session dates must remain strings through Orval and Zod.
---

Calendar-only classroom dates must stay literal `YYYY-MM-DD` strings across the API, rather than becoming timestamps.

**Why:** With Orval's date coercion enabled, OpenAPI `format: date` produces a JavaScript Date. Response validation then serializes midnight as an ISO timestamp, breaking date selectors and archive matching even though TypeScript checks pass.

**How to apply:** Describe calendar dates as strings with a date-shaped pattern, not `format: date`; reserve date-time formats for actual instants. Verify the JSON wire value, including separately generated standalone specifications.
