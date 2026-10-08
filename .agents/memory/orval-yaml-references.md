---
name: Orval external YAML references
description: A resolver quirk with reused YAML reference objects in externally referenced OpenAPI files.
---
Do not reuse YAML anchors/aliases for objects containing `$ref` in externally referenced OpenAPI path definitions. Repeat the small reference-bearing response object instead.

**Why:** Orval 8.30 repeatedly prepended its internal external-document namespace to the same aliased response reference. Generation failed with an unresolved reference containing a repeated `x-ext` chain. Giving every response its own object resolved the failure.

**How to apply:** When a split OpenAPI document produces repeated external-reference prefixes, inspect shared YAML aliases before changing schema names or inheritance. External documents also require an explicit trusted-file allowlist in Orval’s parser options.
