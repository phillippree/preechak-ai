# Conversation Coach

Conversation Coach is enabled by default for Gemini API sessions in **Home → Gemini API & Connection**. It combines independent Gemini streaming transcription with Gemini HTTP coaching. The configured Coaching and Solution Model generates the structured decisions and solutions; `gemini-3.5-transcribe-live` provides transcription. The API key must have access to both models. Connection failures are shown instead of silently switching to Whisper or Groq.

Choose **Both Speaker and Microphone** under **Customize → Audio Input** to include both sides. Existing saved source selections are respected; the default for new preferences is Both. Microphone Only and Speaker Only remain supported. Disabling Conversation Coach restores the selected legacy transport/transcription settings. Local AI sessions retain their own processing path.

## Audio and captions

- `audio-capture-worklet.js` captures, downmixes, and resamples browser audio to 24 kHz mono PCM in 100 ms chunks off the UI thread. Browser microphone echo cancellation and noise suppression remain enabled. A microphone high-pass filter reduces low-frequency rumble; automatic gain is optional and off by default. System audio avoids microphone-specific processing. macOS system audio continues through SystemAudioDump.
- `gemini-transcription.js` opens a separate authenticated Live connection per selected source. Gemini performs speech recognition and server-side speech detection. Source identity comes from the connection, not speaker guessing. Multiple people in the remote call are still labeled Interviewer; this is not participant diarization.
- Interim text replaces each source's draft caption. Final text enters the conversation, ordered by app-side speech-onset timestamps. These timestamps approximate capture time, not word-level server alignment. Overlapping audio remains separate. A conservative same-text/time heuristic suppresses likely long echo duplicates while preserving short Yes/No replies.
- The panel displays source connection/capture errors, microphone levels, clipping, both caption streams, the current problem, unanswered questions, and one coaching card. Microphone processing settings are available in the input meter tooltip. Headphones remain helpful for preventing room echo.
- Reconnection is independent per source with bounded backoff and a two-second unsent-audio buffer. Already sent audio is not replayed. Gaps are explicitly reported. Upload backpressure reconnects the affected source instead of growing memory indefinitely. Muting a source ends its current audio activity so an unfinished caption does not wait for more muted audio; unmuting resumes that source. Stopping capture closes contexts and releases microphone tracks.

## Conversation and decisions

`interview-coach.js` owns the active problem, source-labeled actual contributions, rolling summary, generated solution versions, and pending explicit requests. Audio ingestion never waits for coaching. Drafts are not treated as confirmed facts. Final contributions are saved even when the coach stays quiet.

A short debounce coalesces adjacent final updates. The coach waits for active draft captions before automatic evaluation. It receives recent conversation from both sources, structured requirements/assumptions/open questions, prior AI suggestions, relevant images, and earlier discussion. Gemini returns validated JSON containing updated problem state and one action: quiet, wait, explain, hint, patch, or solutions. A candidate question is an open clarification until answered, not a confirmed requirement. Short replies must be interpreted in context.

Brief explanations and hints replace a single coaching card. Explicit requests and solution/patch results enter the response history. An initial coding screen request asks for straightforward and optimized solutions, including approaches, correctness, complexity, complete code, and tradeoffs. Existing code and tests are reviewed first; genuinely optimal basic code should not be made artificially complex. System-design tasks receive a relevant system design. Ordinary speech does not automatically request a full solution.

New speech aborts obsolete generation and results are checked against the conversation revision before publication. Explicit requests remain pending if they need reevaluation. A clear topic change can reset the active solution/image association; **New problem** provides an explicit reset. **Update solutions** forces reevaluation of the latest requirements. AI suggestions are never stored as candidate speech.

The working set is bounded to 1,000 contributions. Requests contain the latest 60 events, up to six relevant older events selected by term overlap, and a rolling summary capped at 8,000 characters. The latest complete solution plus a bounded patch history is kept separately. Summarization, relevance selection, intent classification, and solution correctness can be imperfect; this is not a guarantee of complete recall or correct coaching.

## Screenshots

Explicit screen capture/snip requests retain the saved per-profile screenshot preferences as presentation guidance, but now include confirmed conversation requirements and the current problem. This intentionally changes the old HTTP screenshot isolation behavior only when Conversation Coach is enabled. Coding tasks request two approaches; missing/unreadable statements or problem directory pages must not be guessed.

In coaching mode, the two latest captures become active together, allowing a statement and updated code to be viewed in one request. Existing attachment controls can select/remove images. Each explicit request snapshots its attachment IDs; later captures do not replace that request's images. A new capture does not itself start a new problem. Original images are included in coaching evaluations while active, rather than relying solely on extracted text. This favors visual fidelity at the cost of repeated image input. Clear irrelevant attachments to reduce context and usage. New problem clears active attachments without deleting screenshot files.

## Storage and verification

Audio is streamed to Google for transcription; conversation text and selected screenshots are sent to Gemini for coaching. This feature does not add raw audio recording. Existing DEBUG_AUDIO diagnostics may save audio, and the existing request/stream logs may contain transcript and prompt text. Final speech and AI solutions use the existing session history mechanism; screenshots use the existing screenshot store. On macOS these app configuration files are under `~/Library/Application Support/preechak-ai-config/`; Electron stdout/stderr logs are under the app userData `logs/` directory. Existing history deletion controls still apply. New problem resets active requirements and solutions, retaining the wider interview conversation with problem boundaries; it does not delete persisted history or screenshot files.

Focused tests:

```bash
LLM_LOG_REQUESTS=0 node --test tests/interview-coach.test.cjs tests/gemini-transcription.test.cjs tests/audio-worklet.test.cjs tests/gemini-http.test.cjs
```

Mock tests cover ordering, draft/final separation, quiet decisions, stale results, explicit requests, images, resets, failure recovery, PCM output, and resource bounds. They cannot establish live accuracy, actual noise suppression, or real-world latency. Verify a live call with headphones and then with speakers: watch both caption streams, ask a clarification, change a requirement while generation runs, analyze a problem then updated code, and check that irrelevant replies do not produce new solutions. Test device permission denial, disconnection, session restart, and both capture sources muted.

The renderer library bootstrap also tolerates Electron exposing `module` without an `exports` global; this prevents an early startup error before markdown libraries load.
