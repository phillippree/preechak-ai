# Preechak AI

Preechak AI is an Electron desktop assistant that uses screen captures and audio to provide contextual AI responses. It supports API-based sessions with Gemini and Groq, plus local inference with llama.cpp and whisper.cpp.

## Features

- Live audio transcription and contextual responses.
- Manual screenshot questions and configurable automatic screen captures.
- Typed questions, response navigation, and Markdown/code rendering.
- Profiles for interviews, meetings, sales, presentations, negotiations, and exams, with editable instructions and screenshot prompts.
- System audio, microphone, or both, with microphone device selection.
- An always-on-top overlay with adjustable transparency, font size, themes, and click-through mode.
- Stealth mode using Electron content protection and platform-specific window visibility options. Capture behavior depends on the operating system and recording application.
- Local session history with transcripts, responses, screenshots, editable titles, search, and deletion controls.
- Configurable global keyboard shortcuts.

## Run from source

Install Node.js and npm, then clone and run the project:

```bash
git clone git@github.com:phillippree/preechak-ai.git
cd preechak-ai
npm ci
npm start
```

The SSH clone requires a GitHub key with access to this repository. You can also use the repository's HTTPS clone URL.

Grant screen recording and microphone permissions when requested. On macOS, check **System Settings → Privacy & Security** if capture fails, then restart the app after changing permissions.

## Choose an AI mode

### Use your own API keys

On the home screen:

1. Under **Transcription**, enter your Gemini API key and configure the Gemini Live model.
2. Under **AI responses**, optionally enter a Groq API key and configure the response and image models.
3. Choose your profile, audio input, language, and prompts in the app's settings and AI customization views.
4. Click **Start Session**.

Gemini Live handles the live connection. With a Groq key, the app can use Groq for responses; without one, it uses Gemini Live for answers. Image questions require a model that supports images.

Model names are editable. The current code defaults are:

| Setting | Default in this checkout |
| --- | --- |
| Gemini Live | `gemini-3.1-flash-live-preview` |
| Groq response model | `qwen/qwen3.6-27b` |
| Groq image model | `qwen/qwen3.6-27b` |

These are configuration defaults, not a guarantee of provider availability or image support. Use model IDs supported by your provider account.

### Use local AI

Select **Use local AI** on the home screen, choose a language model and Whisper model, then click **Start Session**.

- Language inference runs through **llama.cpp**; transcription runs through **whisper.cpp**. Ollama is not required.
- The default language model is `unsloth/Qwen3.5-4B-GGUF:Q4_K_M`.
- You can select a preset, enter a Hugging Face model reference, or provide an absolute path to a local GGUF file.
- Whisper options are `tiny.en`, `base.en`, and `small.en`; these are English models.
- First use downloads the native runners and required models. Allow sufficient disk space and memory for your selected model.
- Local inference runs on your computer; initial downloads require internet access.

The runtime downloader currently defines builds for **macOS Apple Silicon**, **macOS Intel**, and **Windows x64**. It does not define a Linux local-AI build.

**Current download dependency:** native runners are fetched from `preechak-ai/preechak-ai` release `v0.7.0`, as configured in `src/utils/native-ai-runtime.js`. Those assets must be available for automatic setup to succeed; they are not fetched from this fork's GitHub repository.

## Default hotkeys

On macOS, **Option** is the key shown as `Alt` in the shortcut settings. Global shortcuts work while the app is running, subject to operating-system conflicts.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Move window | `Option + Arrow keys` | `Ctrl + Arrow keys` |
| Show / hide window | `Cmd + \` | `Ctrl + \` |
| Toggle click-through | `Cmd + M` | `Ctrl + M` |
| Toggle stealth mode | `Cmd + Shift + H` | `Ctrl + Shift + H` |
| Start session from home; capture and ask about the screen during a session | `Cmd + Enter` | `Ctrl + Enter` |
| Previous response | `Cmd + [` | `Ctrl + [` |
| Next response | `Cmd + ]` | `Ctrl + ]` |
| Scroll response up | `Cmd + Shift + Up` | `Ctrl + Shift + Up` |
| Scroll response down | `Cmd + Shift + Down` | `Ctrl + Shift + Down` |
| Increase opacity | `Option + .` | `Alt + .` |
| Decrease opacity | `Option + ,` | `Alt + ,` |
| Send a typed message while its input is focused | `Enter` | `Enter` |
| Emergency erase and quit | `Cmd + Shift + E` | `Ctrl + Shift + E` |

Edit the listed global shortcuts in **Settings**, or use **Reset to defaults**. The emergency shortcut is registered at startup but is not exposed in the shortcut editor; changing or resetting shortcuts can unregister it until the app restarts. `Enter` is a message-input action, not a configurable global shortcut.

**Emergency erase is destructive:** it hides the window, closes the Gemini session if present, requests a reset of local app data, and quits after a short delay. It is not a verified secure-erasure mechanism. Use the explicit history/settings deletion controls when you need to confirm data removal.

Click-through sends mouse interactions to the application behind the overlay. Use its shortcut again to interact with Preechak AI. Show/hide changes window visibility; it does not end the session.

## Audio and platform notes

- **macOS:** the bundled SystemAudioDump helper captures system audio; microphone capture can run separately or alongside it.
- **Windows:** system audio uses display/loopback capture; microphone-only and combined modes are implemented.
- **Linux:** the app attempts display-based system audio capture and supports microphone capture. System audio depends on the desktop environment; the speaker-only path falls back to screen capture if audio capture fails.

These describe the implemented capture paths, not a cross-platform test certification.

## Local data

Settings, API credentials, history, screenshots, downloaded models, and native runners are stored beneath the app's configuration directory:

| Platform | Directory |
| --- | --- |
| macOS | `~/Library/Application Support/preechak-ai-config` |
| Windows | `%USERPROFILE%\AppData\Roaming\preechak-ai-config` |
| Linux | `~/.config/preechak-ai-config` |

API keys are stored in a local JSON credentials file. Treat this directory as private. API mode sends session content to the configured providers. History can be removed from the **History** view; **Settings** also provides local-data and settings reset controls.

## Development and packaging

The current app uses JavaScript, Lit components, Electron, and Electron Forge.

```bash
npm start       # Run the development app
npm run package # Package the app
npm run make    # Build platform distributables
```

Build output goes under `out/`. Both `out/` and `node_modules/` are ignored by Git; keep `package.json` and `package-lock.json` tracked.

There is currently no automated test suite or typecheck script. `npm run lint` only prints a placeholder message.

## License and third-party components

This repository declares **GPL-3.0**; see [LICENSE](LICENSE). It contains code derived from Cheating Daddy and bundled third-party components, including Lit, Marked, highlight.js, and SystemAudioDump. Preserve their applicable license and copyright notices.

The macOS audio helper is credited to [SystemAudioDump / Sound](https://github.com/Mohammed-Yasin-Mulla/Sound).
