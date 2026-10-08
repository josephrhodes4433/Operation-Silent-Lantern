# Operation SILENT LANTERN — Parallel CTF (UFED-only) — Microsoft Forms Blueprint (Copy/Paste)

**Form type:** Quiz (recommended)

**Response restrictions:** Org-only, 1 response per team account, start/end time set

**Dataset model:** Shared dataset (all teams will submit identical flags/values)

**Tooling constraint:** UFED-only (No PA/Streamline). Remove Streamline questions/status checks.

**Branching:** Correct Flag → next Section; Incorrect → Remediation subsection

**Validation:** Use required formats exactly; use ‘Text restrictions’ where supported


## Section 0 — ROE-ACK

**Type:** Choice | **Required:** Yes | **Points:** 0

**Prompt:** Acknowledge: I will work only on provided training datasets and follow classroom SOPs.

**Validation/Restriction:**
```
Choice: [I Agree] only
```

**Correct answer key (instructor):**
```
I Agree
```

**Branching rule:**
```
If I Agree → Section 1; else → End
```


## Section 1 — M1-Q1

**Type:** Multiple choice | **Required:** Yes | **Points:** 5

**Prompt:** Which approach best supports speed-to-first-intel while preserving integrity?

**Validation/Restriction:**
```
Options: A/B/C/D
```

**Correct answer key (instructor):**
```
B. Triage Scan first, then targeted extractions
```


## Section 1 — M1-FLAG01

**Type:** Short answer | **Required:** Yes | **Points:** 10

**Prompt:** Enter FLAG-01 in format: CASE:{JTF-####-TEAM#}

**Validation/Restriction:**
```
Must match: CASE:JTF-####-TEAM# (example: CASE:JTF-0427-TEAM3)
```

**Correct answer key (instructor):**
```
CASE:JTF-####-TEAM# (team-specific)
```

**Branching rule:**
```
If matches pattern → Section 2; else → Section 1-Remediation
```


## Section 1 — M1-Q2

**Type:** Short answer | **Required:** Yes | **Points:** 5

**Prompt:** What evidence container file is generated at the end of extraction?

**Correct answer key (instructor):**
```
UFDX
```


## Section 1-Remediation — M1-HELP

**Type:** Text | **Required:** Yes | **Points:** 0

**Prompt:** Hint: Review Extraction Wizard ‘Saving the extraction’ output type.

**Branching rule:**
```
After reading → back to M1-FLAG01
```


## Section 2 — M2-Q1

**Type:** Multiple select | **Required:** Yes | **Points:** 5

**Prompt:** Select all Content Types most useful for rendezvous instructions and courier identification.

**Correct answer key (instructor):**
```
Chats; Call logs; Locations; Contacts; Documents (Images/Videos optional)
```


## Section 2 — M2-FLAG02

**Type:** Short answer | **Required:** Yes | **Points:** 10

**Prompt:** Enter FLAG-02 in format: ALIAS:{word}

**Validation/Restriction:**
```
Must match: ALIAS:<3–20 letters> (no spaces)
```

**Correct answer key (instructor):**
```
ALIAS:{courier-alias-from-shared-dataset}
```

**Branching rule:**
```
If matches → Section 3; else → Section 2-Remediation
```


## Section 2 — M2-Q2

**Type:** Short answer | **Required:** Yes | **Points:** 5

**Prompt:** Provide two supporting indicators (timestamp + location indicator/source).


## Section 2-Remediation — M2-HELP

**Type:** Text | **Required:** Yes | **Points:** 0

**Prompt:** Hint: Look for the most recent instruction thread and associated location references.

**Branching rule:**
```
Back to M2-FLAG02
```


## Section 3 — M3-Q1

**Type:** Short answer | **Required:** Yes | **Points:** 5

**Prompt:** List at least two watchlist criteria types used in Triage (e.g., keyword + phone number).


## Section 3 — M3-FLAG03

**Type:** Short answer | **Required:** Yes | **Points:** 10

**Prompt:** Enter FLAG-03 in format: MAJOR:{datatype}:{value}

**Validation/Restriction:**
```
Must match: MAJOR:<datatype>:<value>
```

**Correct answer key (instructor):**
```
MAJOR:{first-major-match-from-shared-dataset}
```

**Branching rule:**
```
If matches → Section 4; else → Section 3-Remediation
```


## Section 3 — M3-Q2

**Type:** Multiple choice | **Required:** Yes | **Points:** 5

**Prompt:** Which Triage outcome indicates the highest priority match?

**Correct answer key (instructor):**
```
Major
```


## Section 3-Remediation — M3-HELP

**Type:** Text | **Required:** Yes | **Points:** 0

**Prompt:** Hint: In the Triage Profiles view, note which criteria returns Major vs Minor.

**Branching rule:**
```
Back to M3-FLAG03
```


## Section 4 — M4-FLAG04

**Type:** Short answer | **Required:** Yes | **Points:** 10

**Prompt:** Enter FLAG-04 in format: IMSI:{digits}

**Validation/Restriction:**
```
Must match: IMSI:<10–18 digits>
```

**Correct answer key (instructor):**
```
IMSI:{imsi-from-shared-sim}
```

**Branching rule:**
```
If matches → Section 5; else → Section 4-Remediation
```


## Section 4 — M4-Q1

**Type:** Short answer | **Required:** Yes | **Points:** 5

**Prompt:** Provide one SIM contact/message that supports a pivot to Missions 2–3.


## Section 4 — M4-Q2

**Type:** Multiple choice | **Required:** Yes | **Points:** 5

**Prompt:** During SIM extraction, which hardware must be connected?

**Correct answer key (instructor):**
```
TurboLink and SIM adapter
```


## Section 4-Remediation — M4-HELP

**Type:** Text | **Required:** Yes | **Points:** 0

**Prompt:** Hint: Re-check SIM extraction prerequisites and the SIM adapter connection steps.

**Branching rule:**
```
Back to M4-FLAG04
```


## Section 5 — M5-Q1

**Type:** Multiple choice | **Required:** Yes | **Points:** 5

**Prompt:** Which workflow is used to preserve iOS data pending authorization?

**Correct answer key (instructor):**
```
Preserved Extraction
```


## Section 5 — M5-FLAG05

**Type:** Short answer | **Required:** Yes | **Points:** 10

**Prompt:** Enter FLAG-05 in format: AUTH:{code}

**Validation/Restriction:**
```
Must match: AUTH:<instructor-code>
```

**Correct answer key (instructor):**
```
AUTH:{single-shared-instructor-code}
```

**Branching rule:**
```
If matches → Section 6; else → Section 5-Remediation
```


## Section 5 — M5-Q2

**Type:** Short answer | **Required:** Yes | **Points:** 5

**Prompt:** After authorization, identify the planning artifact title that points to next action.


## Section 5-Remediation — M5-HELP

**Type:** Text | **Required:** Yes | **Points:** 0

**Prompt:** Hint: Authorization is released only after you demonstrate preserved handling notes to the instructor.

**Branching rule:**
```
Back to M5-FLAG05
```


## Section 6 — M6-FLAG06

**Type:** Short answer | **Required:** Yes | **Points:** 10

**Prompt:** Enter FLAG-06 in format: TPL:{ALIAS}-{IMSI_last4}-{KEYWORD}

**Validation/Restriction:**
```
Must match: TPL:<alias>-<4digits>-<keyword>
```

**Correct answer key (instructor):**
```
TPL:{assembled-from-prior-missions}
```


## Section 6 — M6-Q1

**Type:** Long answer | **Required:** Yes | **Points:** 10

**Prompt:** Final Intelligence Summary (6–8 sentences): Who/What/Where/When/So-what/Next step.


## Section 6 — M6-Q2

**Type:** Short answer | **Required:** Yes | **Points:** 5

**Prompt:** List two artifacts you used to corroborate your final ‘Where’ and ‘When’ assessments.
