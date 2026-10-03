# Chat Alignment

This document details the layout, directional alignment, and turn-routing behavior for candidate, interviewer, and assistant response bubbles in Preechak AI.

## Layout Rules

| Participant                              | Alignment | Bubble Tail / Radius                | Meta Timestamp Alignment     |
| :--------------------------------------- | :-------- | :---------------------------------- | :--------------------------- |
| **You (Candidate / Mic / Typed Input)**  | **Left**  | Bottom-left (`18px 18px 18px 4px`)  | Left (`padding-left: 4px`)   |
| **Interviewer (System Audio / Speaker)** | **Right** | Bottom-right (`18px 18px 4px 18px`) | Right (`padding-right: 4px`) |
| **Assistant Response (To You)**          | **Left**  | Bottom-left (`18px 18px 18px 4px`)  | Left (`padding-left: 4px`)   |
| **Assistant Response (To Interviewer)**  | **Right** | Bottom-right (`18px 18px 4px 18px`) | Right (`padding-right: 4px`) |

---

## Turn & Speaker Routing

Speaker direction is computed via `getTurnSpeaker(promptText, item)` in [`src/components/views/AssistantView.js`](file:///Users/phillip/projects/preechak-ai/src/components/views/AssistantView.js):

1. **Explicit Property**: Checks `item.speaker` (e.g. `'Candidate'`, `'You'`, `'Me'` vs `'Interviewer'`, `'Speaker'`).
2. **Tagged Transcription**: Parses prompt turn markers like `[Speaker]: ...`, `[Interviewer]: ...`, `[Candidate]: ...`, `[You]: ...`. Multi-turn segments resolve to the last active speaker so the response aligns with whoever asked or spoke last.
3. **Untagged Manual Input**: User-typed queries in the bottom prompt bar default to `'you'` and align to the left.
4. **Live Indicators**: Active listening and thinking animations dynamically reflect the pending speaker turn direction.
