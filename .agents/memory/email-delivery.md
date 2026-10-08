---
name: Email delivery decision
description: Why email-provider integration must not be silently introduced for the CTF site.
---

Do not add an email-provider connection without a new request from the user. Clearly distinguish opening an email draft from delivering an email.

**Why:** The user dismissed the email integration card and said, "Continue without the integration."

**How to apply:** Retain a provider-free sending path when maintaining this classroom site. If future work needs server-side delivery, explain the difference and obtain the user's choice first.
