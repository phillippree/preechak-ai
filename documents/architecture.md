# How Preechak AI works

The app has three main parts: the interface, AI processing, and local storage. These Mermaid diagrams render directly on GitHub.

## How the pieces connect

```mermaid
flowchart TD
    Start["npm start"] --> Main["index.js<br/>Start Electron and initialize storage"]
    Main --> Window["window.js<br/>Create window and register hotkeys"]
    Window --> UI["PreechakAiApp.js<br/>Home, Assistant, Settings, History"]
    UI --> Renderer["renderer.js<br/>Capture screen/audio and handle user actions"]
    Renderer <-->|"IPC: messages between interface and background"| Router["gemini.js<br/>Route requests and manage sessions"]
    Mac["SystemAudioDump<br/>macOS system audio"] --> Router
    Router --> API["API mode<br/>Gemini / Groq"]
    Router --> Local["localai.js<br/>Local transcription and answers"]
    Local --> Runtime["native-ai-runtime.js<br/>Download models and start local servers"]
    Runtime --> Whisper["whisper.cpp<br/>Audio → text"]
    Runtime --> Llama["llama.cpp<br/>Text / images → answers"]
    API --> Results["Responses and session events"]
    Local --> Results
    Results --> UI
    Results --> Save["renderer.js → index.js<br/>Save session request"]
    Save --> Storage["storage.js<br/>History JSON and settings"]
    Router -->|"Save screenshot files"| Storage
    Storage <-->|"Read saved sessions through IPC"| History["HistoryView.js"]
```

IPC is Electron's messaging system: the visible interface asks the background process to perform actions and receives results. The diagram summarizes logical connections; history reads and writes pass through the renderer's storage wrapper and the handlers in `index.js`.

## How a question becomes an answer

| Input          | API mode (Live WebSocket)                                                                                           | API mode (Buffered HTTP)                                                                                                               | Local mode                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Spoken audio   | Gemini Live streams continuous transcription; Groq generates answers when configured, otherwise Gemini Live answers | Audio is buffered and segment-packaged upon speech pauses; Gemini transcribes/answers via HTTP REST, or forwards transcription to Groq | Whisper transcribes audio segments locally, then llama.cpp generates an answer       |
| Typed question | Groq when configured; otherwise Gemini request path                                                                 | Groq when configured; otherwise Gemini HTTP model                                                                                      | Goes directly to llama.cpp                                                           |
| Screenshot     | Groq image model when configured; otherwise Gemini image request                                                    | Groq image model when configured; otherwise Gemini HTTP model image request                                                            | Goes to the local model through llama.cpp; image support requires a compatible model |

The selected profile and custom instructions are added through `prompts.js`.

## Example: pressing the screenshot hotkey

```mermaid
sequenceDiagram
    participant You
    participant Window as window.js
    participant Capture as renderer.js
    participant AI as gemini.js
    participant Model as Selected AI
    participant History as Local storage

    You->>Window: Cmd/Ctrl + Enter during a session
    Window->>Capture: Capture screen
    Capture->>AI: Screenshot + prompt
    AI->>History: Save screenshot
    AI->>Model: Request an answer
    Model-->>AI: Response
    AI-->>Capture: Display answer and save-session event
    Capture->>History: Save through index.js and storage.js
```

From the home screen, the same shortcut starts a session instead of capturing a screenshot.

## Source map

Paths below are relative to the repository root.

| File                                    | Responsibility                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/index.js`                          | Electron startup, storage handlers, and general app actions                         |
| `src/utils/window.js`                   | Window creation, visibility, hotkeys, click-through, and stealth mode               |
| `src/components/app/PreechakAiApp.js`   | Main interface, navigation, and session controls                                    |
| `src/components/views/AssistantView.js` | Responses, typed questions, and screenshot controls                                 |
| `src/components/views/HistoryView.js`   | Browse, rename, search, and delete saved sessions                                   |
| `src/utils/renderer.js`                 | Capture, interface-to-background requests, and session-save event handling          |
| `src/utils/gemini.js`                   | AI request routing, Gemini/Groq connections, session events, and macOS system audio |
| `src/utils/gemini-http.js`              | HTTP REST audio buffering, VAD segmentation, and Gemini/Groq request execution      |
| `src/utils/localai.js`                  | Local audio processing, transcription, and text/image inference                     |
| `src/utils/native-ai-runtime.js`        | Native runner/model downloads and local server support                              |
| `src/utils/prompts.js`                  | Profile-specific AI instructions                                                    |
| `src/storage.js`                        | JSON settings, credentials, sessions, and screenshot files                          |

## Implementation notes

- `gemini.js` is the central AI controller, including routing to local AI, despite its name.
- On macOS, history lives outside the project directory under `~/Library/Application Support/preechak-ai-config`.
- Local AI runs separate background programs for Whisper and llama.cpp.
- `cloud.js` still exists, but its setup option is disabled in the current interface.
- Some comments mention IndexedDB, but the current history-saving path writes JSON files through `storage.js`.

This document describes the source reviewed on September 28, 2026; it is an architecture overview, not a runtime test report.
