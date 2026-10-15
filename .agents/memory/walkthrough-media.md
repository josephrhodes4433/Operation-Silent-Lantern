---
name: Walkthrough media verification
description: Non-obvious audio-generation and timing pitfalls when producing the CTF walkthrough recordings.
---

Verify audible narration, not merely the existence of an audio stream, before delivering a walkthrough.

**Why:** A successful MP4 render contained valid AAC audio that was entirely silent, even though its source speech clips were audible. Container and codec checks alone did not catch it.

**How to apply:** Measure final audio levels, confirm voice clips fit their section windows without overlap or clipping, and inspect representative video frames. Map section narration to the actual footage rather than assuming saved-answer timestamps remain accurate after a resumed or retimed recording.

Use the actual file path returned by speech generation and dispatch generation in small batches.

**Why:** A replacement speech clip was saved with a suffixed filename despite the requested path; a large simultaneous burst also encountered per-project rate limits.

**How to apply:** Keep successful clips, retry only failed generations, and record returned paths in the narration plan instead of assuming the requested filename was overwritten.

Keep completed recordings durable independently of the disposable classroom fixture.

**Why:** Temporary recording storage and the workspace can be on different filesystems. A completed instructor capture was lost when an atomic move failed and fixture cleanup removed the temporary recording.

**How to apply:** Copy and verify completed media into the ignored artifact directory before tearing down a fixture. Keep successful captures and speech when a later export or another activity fails; retry only the incomplete stage.
