# Dynamic Mode Switching & Prompt Injection

Preechak AI allows switching operational modes (`interview`, `meeting`, `sales`, `presentation`, `negotiation`, `exam`, `designSystem`) seamlessly during an active session without interrupting audio capture or resetting conversation history.

## Architecture & Workflow

1. **User Interface (`AssistantView.js` & `PreechakAiApp.js`)**:
    - The top-center header contains a clean status label displaying the active session profile.
    - The bottom-left input bar in `AssistantView` provides the mode selector dropdown (`.session-mode-pill`).
    - When the user selects a different mode, `_handleProfileSelect` triggers `onProfileChange(newMode)`.

2. **Session & Prompt Synchronization**:
    - `PreechakAiApp` calls `window.preechakAi.switchSessionProfile(newMode)`.
    - `sessionManager.switchProfile(newMode)` updates the orchestrator's active recipe.
    - A visual `profile_change` status badge is added into the message stream.

3. **IPC Bridge & Prompt Injection (`gemini-http.js` & `gemini.js`)**:
    - IPC handler `switch-session-profile` passes the new profile and custom instructions to `switchSessionProfile()`.
    - The HTTP backend fetches the mode's prompt template via `getSystemPrompt(newProfile, customPrompt)`.
    - The backend injects a `[System Instruction Update]` turn into `httpConversationHistory`, updating AI tone, persona, and response formatting for all subsequent audio and typed queries.

## Testing & Verification

Run tests:

```bash
node --test tests/prompt-injection.test.cjs
node --test tests/session-profile.test.cjs
```
