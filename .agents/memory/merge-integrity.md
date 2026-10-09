---
name: Merge integrity
description: Verify structural merge output against both source versions, not just conflict markers.
---

When resolving a route-file conflict, inspect the entire merged file against both Git source versions, including regions outside conflict markers.

**Why:** A structural merge mixed unrelated endpoint schemas and bodies, duplicated handlers, and removed learner routes even though those regions were identical in both source versions. Removing only conflict markers would have left a broken API.

**How to apply:** Compare both source versions first. When one is an exact functional superset of the other, restoring that verified version preserves both sets of work. Otherwise merge the actual differences and check route identities, request schemas and handler bodies together.
