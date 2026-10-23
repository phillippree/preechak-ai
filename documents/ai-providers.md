# AI providers

## Choose before a session

The home screen and Settings contain **AI providers**. Save a Gemini key, an OpenAI key, or both. Blank fields preserve saved keys; keys are masked and the settings reader reports only whether each key exists. Select transcription and coaching independently, then save before starting. Provider/model choices are copied at startup and stay fixed until the session ends. The provider settings IPC rejects changes during an active session.

Gemini remains the default. OpenAI coaching starts with GPT-6 Luna; GPT-6 Sol and GPT-6.1 Sol are selectable. OpenAI voice uses GPT Live Transcribe (`gpt-live-transcribe`), separately from the coaching model. Only the selected providers' keys are required. Mixed configurations need both keys. A connection check lists models without generating an answer; it does not guarantee quota or access to every model.

## Shared behavior

The existing capture, microphone cleanup, dual audio channels, muted-source suppression, conversation/problem state, screenshots, code-review actions, answer formatting and protected UI remain shared. Coaching and images use the same selected provider. No automatic fallback sends content to another provider. Existing Gemini-only legacy transport settings remain available; choosing OpenAI routes through the shared Coach pipeline. New API sessions always enable Conversation Coach, including when an older saved preference disabled it. Legacy backend entry points remain in the code.

`ai-providers.js` validates a session selection and implements a provider-neutral structured decision call. Gemini converts that call to `generateContent`; OpenAI uses Responses with strict JSON Schema, inline images, cancellation and `store: false`. This does not exempt requests from OpenAI's applicable API retention policies. Refusals, incomplete answers, authentication/quota failures and empty results surface as errors. The original shared Coach validates the resulting decision and discards stale responses.

`GeminiTranscription` shares bounded buffers, independent reconnects, mute epochs and source lifecycle through protocol hooks. `OpenAITranscription` supplies OpenAI's WebSocket authentication, session updates and delta/completion mapping. Each physical source has its own socket and source label. OpenAI live transcription uses 24 kHz PCM and client-side turn commits after 800 ms silence following at least 200 ms detected speech, with a 30-second turn cap. Drafts use stable item IDs, and item-specific completion events preserve identity if finals arrive out of order. This endpoint does not use server VAD. Muting invalidates its socket epoch and queued audio before resuming with a fresh connection.

## Credentials and privacy

The old `apiKey` is treated as the Gemini key and remains synchronized with `geminiApiKey` for existing screens. New credentials use explicit `geminiApiKey` and `openaiApiKey`. Keys are encrypted with Electron `safeStorage` when OS encryption is available, including migration of existing plaintext keys on read. On systems without available OS encryption, credentials retain the existing local plaintext behavior. Encrypted keys that cannot be unlocked fail with an actionable error, rather than being sent as ciphertext. Credentials remain in the existing local credentials file; clearing app data removes them.

OpenAI keys are resolved in the main process for API calls and are not passed through session-start IPC. API errors omit server payloads and authentication headers. Existing Gemini request logging still applies; account keys and image data must remain redacted by the logger. The selected transcription provider receives raw audio; the coaching provider receives selected captions, shared context and relevant screenshots. Two providers can therefore both receive interview-related data in a mixed configuration. API usage is billed separately by each service.

## Verification

Mock tests cover all four provider combinations, key isolation, default/selected models, strict schemas, image routing, explicit screenshot actions, cancellation propagation, error handling, source identity, commits and mute epochs. IPC tests cover validation, masked settings and active-session locking. The isolated Electron smoke check covers password fields, disabled settings during sessions, existing section disclosure, arrow cursors and protected-window interactions.

Live service access, transcription quality, timing and actual model availability require testing with valid provider accounts. No tests automatically purchase credits or use private interview recordings.

Official API references: [OpenAI live transcription](https://developers.openai.com/api/docs/guides/realtime-transcription), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [vision](https://developers.openai.com/api/docs/guides/images-vision).

API keys are managed exclusively in **AI providers**. The legacy home-screen Gemini key field and its key-population/save handlers have been removed. The former Session settings section, Coach toggle, and legacy connection/model controls are removed from the API home screen. AI providers contains the Gemini coaching-model field and OpenAI model choices. The Gemini field preserves the saved `geminiHttpModel` configuration and is validated before saving. Conversation Coach is enabled automatically. The separate Session Mode selector continues to choose Interview, Meeting, and other profiles.

The conversation header displays coaching and transcription provider/model badges from the active session snapshot. These contain only provider/model names, never API keys, and remain fixed even if saved defaults change. Badges wrap at smaller widths and use no native tooltips. Mute messages use provider-neutral wording.
