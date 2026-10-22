# Conversation Coach

Conversation Coach is enabled by default for Gemini API sessions in **Home → Gemini API & Connection**. It combines independent Gemini streaming transcription with Gemini HTTP coaching. The configured Coaching and Solution Model generates the structured decisions and solutions; `gemini-3.5-transcribe-live` provides transcription. The API key must have access to both models. Connection failures are shown instead of silently switching to Whisper or Groq.

Choose **Both Speaker and Microphone** under **Customize → Audio Input** to include both sides. Existing saved source selections are respected; the default for new preferences is Both. Microphone Only and Speaker Only remain supported. Disabling Conversation Coach restores the selected legacy transport/transcription settings. Local AI sessions retain their own processing path.

## Audio and captions

- `audio-capture-worklet.js` captures, downmixes, and resamples browser audio to 24 kHz mono PCM in 100 ms chunks off the UI thread. Browser microphone echo cancellation and noise suppression remain enabled. A microphone high-pass filter reduces low-frequency rumble; automatic gain is optional and off by default. System audio avoids microphone-specific processing. macOS system audio continues through SystemAudioDump.
- `gemini-transcription.js` opens a separate authenticated Live connection per selected source. Gemini performs speech recognition and server-side speech detection. Source identity comes from the connection, not speaker guessing. Multiple people in the remote call are still labeled Interviewer; this is not participant diarization.
- Interim text replaces each source's draft caption. Final text enters the conversation, ordered by app-side speech-onset timestamps. These timestamps approximate capture time, not word-level server alignment. Overlapping audio remains separate. A conservative same-text/time heuristic suppresses likely long echo duplicates while preserving short Yes/No replies.
- The panel displays source connection/capture errors, microphone levels, clipping, both caption streams, the current problem, unanswered questions, and one coaching card. Input levels and clipping remain visible; native tooltips are suppressed in the protected coaching view. Headphones remain helpful for preventing room echo.
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

## Visual approaches and capture intent

With Conversation Coach enabled, Analyze Screen and Snip classify the newest capture against the active problem and conversation before deciding what to produce. `capture-policy.js` defines the shared visual-teaching and screen-review instructions:

| Capture                                                         | Behavior                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readable new problem, possibly with signature/pass/TODO starter | Explain the core idea, show a small chalkboard trace, connect it to variables/loops, then provide straightforward and optimized solutions with complete code, correctness, complexity, edge cases, and a short interview explanation.                                      |
| Your implementation of the active problem                       | Check it against confirmed requirements, not similarity to AI code. Quote relevant visible code, distinguish confirmed defects from possible issues, show a small failing trace, and provide the minimal corrected section and a test. A failing test need not be visible. |
| Meaningful unfinished implementation                            | Review visible logic, separate missing work from defects, and supply the next focused section in your variables and structure. Off-screen code is not assumed missing.                                                                                                     |
| Same problem with new requirements                              | Explain their effect and revise only what is necessary.                                                                                                                                                                                                                    |
| Insufficient statement/code context                             | State exactly which statement or lines are needed, while preserving known problem context.                                                                                                                                                                                 |
| Uncertain new problem versus review versus continuation         | Pause screen analysis and show in-window mouse buttons: New problem, Review my code, Help me continue. No speculative code or problem-state changes are committed.                                                                                                         |

The inferred intent and reason stay visible near the result. Those same three buttons allow correction of an automatic choice. Show full corrected code and Explain visually are available after analysis, using that capture's original image IDs and prior AI analysis. Full corrected code means completing/fixing your implementation rather than substituting an unrelated algorithm. Starting another problem invalidates old capture actions. Up to 12 capture records are retained for the session; no additional image files are created by classification.

Captured code can be correct but slower than the proposed optimized solution. That is an optional optimization note, not a correctness failure. A signature by itself is not a bug: with a visible problem it is starter code; without a known/readable statement it needs more context. The classifier can be wrong, so mouse overrides remain available. Seeing only part of a function limits what can be verified; the model must distinguish a proven error from a conditional concern.

Saved screenshot prompts remain language/style guidance. Their older requests for full code or two solutions do not override focused review and continuation behavior. Full two-solution output is reserved for new problems or an explicit solution request. Chalkboard explanations also apply to generated/revised coding solutions from conversation requests. Legacy screenshot behavior remains available with Conversation Coach disabled.

## Protected interaction

All new choices, thumbnails, results, and follow-up controls render inside the existing main BrowserWindow; no native menus, dialogs, tooltips, or new windows are introduced. Capture controls and coaching code use the default arrow cursor, including hover and pressed states. During stealth-mode interviews, the live header and AssistantView also force arrow cursors and strip native title tooltips. Rendered coaching links are inert to prevent opening an external window; copy controls keep working. Thumbnails cannot be dragged into an OS drag preview. Existing `setContentProtection` remains the mechanism for excluding the main window from capture. This does not guarantee exclusion by every OS/screen-sharing application.

Additional checks:

```bash
LLM_LOG_REQUESTS=0 node --test tests/interview-coach.test.cjs tests/capture-policy.test.cjs tests/gemini-http.test.cjs
node_modules/.bin/electron tests/capture-ui-smoke.cjs
```

The isolated Electron smoke test uses synthetic content, enables content protection, and checks actual hover/pressed cursor styles, mouse action routing, native title removal, inert links, and the window count. It does not record the desktop or prove what Zoom/Meet viewers see; confirm that separately with stealth enabled in the actual sharing client.
