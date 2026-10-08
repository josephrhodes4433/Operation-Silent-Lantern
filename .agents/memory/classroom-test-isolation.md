---
name: Classroom test isolation
description: Why classroom browser tests isolate dataset keys and instructor credentials.
---

Browser regressions should create their own learner sessions, isolate dataset-key
and question-definition fixtures, and use only a temporary development instructor-code
override or intercepted authentication fixtures. Do not change shared question
definitions or dataset keys, or read the actual instructor credential for tests.

**Why:** The development database is shared, and dataset keys affect grading of
every learner, not just test sessions. Overwriting a key for a test can change
existing learners' scores or conflict with an instructor's edits. A temporary
process override permits protected scoring checks without exposing or replacing
the saved classroom secret. Question edits also affect every learner; even a
temporary test prompt is not safe to publish into a live classroom catalog.

**How to apply:** Use controlled dataset responses for browser-only validation
checks; label those checks as UI-contract coverage rather than live shared-key
management and authoring. Isolated endpoint tests may use an in-memory SQL adapter;
do not describe those as real database persistence coverage. For future end-to-end
key-management or authoring tests, provide an isolated database before modifying
keys or definitions. Always restore the normal managed API workflow
after a temporary instructor override, including when tests fail.
