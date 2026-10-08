---
name: Classroom test isolation
description: Why classroom browser tests isolate dataset keys and instructor credentials.
---

Browser regressions should create their own learner sessions, isolate dataset-key
fixtures, and use only a temporary development instructor-code override. Do not
change shared dataset keys or read the actual instructor credential for tests.

**Why:** The development database is shared, and dataset keys affect grading of
every learner, not just test sessions. Overwriting a key for a test can change
existing learners' scores or conflict with an instructor's edits. A temporary
process override permits protected scoring checks without exposing or replacing
the saved classroom secret.

**How to apply:** Use controlled dataset responses for browser-only validation
checks; label those checks as UI-contract coverage rather than live shared-key
management. For future end-to-end key-management tests, provide an isolated
database before modifying keys. Always restore the normal managed API workflow
after a temporary instructor override, including when tests fail.
