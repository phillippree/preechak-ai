# Dynamic Mode Switching & Prompt Injection

Preechak AI allows switching operational modes (`interview`, `meeting`, `sales`, `presentation`, `negotiation`, `exam`, `designSystem`) seamlessly during an active session without interrupting audio capture or resetting conversation history.

## Architecture & Workflow

1. **User Interface (`AssistantView.js` & `PreechakAiApp.js`)**:
    - The top-center header contains a clean status label displaying the active session profile.
    - The bottom-left input bar in `AssistantView` provides the mode selector dropdown (`.session-mode-pill`).
    - When the user selects a different mode, `_handleProfileSelect` triggers `onProfileChange(newMode)`.
    - The picker renders its menu inside the main Electron window. It does not use a native `<select>` popup, which can appear outside the main window's content protection on macOS. This keeps the menu within the same protection boundary as the rest of the UI when stealth mode is enabled.
    - Enter or Space opens the picker; arrow keys navigate, Home/End jump to the first/last mode, and Escape closes it and returns focus. Selecting a mode, clicking outside, moving focus away, or switching windows dismisses the menu.
    - The mode button and menu items keep the standard arrow cursor, including while hovering and selecting a mode.

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
node --test tests/session-mode-switch.test.cjs tests/mode-picker.test.cjs tests/stealth-mode.test.cjs
```

For manual verification, enable stealth mode, share or record the screen, and open the mode picker. Check the recording or the receiving device to verify that both the app and the picker are excluded. Capture protection depends on the operating system and capture application, so unit tests cannot establish screen-sharing behavior.
