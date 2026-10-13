# ExScreenHelp — Design Spec

- **Date:** 2026-09-28
- **Status:** Approved in brainstorming, awaiting written-spec review
- **Audience:** the owner of the project and whoever implements it

## 1. Summary

ExScreenHelp is a Windows desktop assistant that lives in a small floating bubble. The bubble is an animated "living orb" that you can drag around and that snaps to the edge of the screen, like Apple's AssistiveTouch.

The core loop:

1. Click the bubble to open a small menu.
2. Choose **Select area**. The app freezes and dims the screen.
3. Drag a rectangle around the thing you want help with.
4. The bubble morphs into a panel. The orb plays a "thinking" animation while DeepSeek works, then the answer streams in.
5. Ask follow-up questions in a text box under the answer.

Every conversation, including its screenshot, is saved locally. You can reopen it from History and keep asking questions.

The assistant handles general questions (homework, articles, translation, "what is this?") and coding (code, errors, stack traces) equally.

## 2. Scope

### In scope for v1

- A floating, draggable bubble that snaps to the screen edge, with an idle fade and a remembered position
- A bubble menu with **Select area**, **History** and **Settings**
- Freeze-then-select rectangle capture
- An answer panel with a streaming answer, formatted Markdown, highlighted code blocks with Copy buttons, and a follow-up box
- Persistent history (screenshot plus messages) that can be reopened and continued
- A settings view: API key, model name, API address, launch at startup, and a test-connection button
- A tray icon with Show/Hide bubble and Quit
- The "living orb" visual style, following the Windows light/dark theme

### Out of scope for v1

- Multiple monitors. The app assumes one monitor; the bubble, overlay and panel all use the primary display.
- Full-screen capture without a selection
- Type-only chat with no screenshot
- A global keyboard shortcut
- Circle or freehand selection (a rectangle replaces it)
- An installer, code signing or auto-update (this is for personal use only)
- AI providers other than DeepSeek. The API address and model are configurable, but only DeepSeek is tested.
- Searching or filtering history
- True frosted-glass (acrylic) blur of the desktop behind the panel
- Staying on top of exclusive-fullscreen games

## 3. Platform and stack

| Concern | Choice |
|---|---|
| OS | Windows 11 only |
| App shell | Electron |
| Language | TypeScript everywhere (main, preload, renderer) |
| UI | React |
| Build tooling | electron-vite (Vite for main, preload and two renderer pages) |
| Animation | Motion (formerly Framer Motion), using spring transitions |
| Markdown | `react-markdown` + `remark-gfm` |
| Code highlighting | `rehype-highlight` (highlight.js) |
| AI client | `openai` npm package pointed at DeepSeek's OpenAI-compatible API |
| Screen capture | Electron `desktopCapturer` at full physical resolution |
| Secret storage | Electron `safeStorage`, which uses Windows DPAPI |
| Tests | Vitest |
| Packaging | `electron-builder` with the `dir` target, producing a portable folder containing `ExScreenHelp.exe` |

## 4. Architecture

An Electron **main process** does all the real work and is the only place the API key is ever held. Three **windows** (renderer processes) only draw UI and talk to the main process through a typed IPC API exposed by the preload script.

> **Revision (planning):** section 2 of the brainstorm described a single assistant window that resizes. During planning, this was split into a small **bubble window** and a separate **stage window** (menu + panel). Resizing or moving a window can't be synchronised with its repaint, so a single resizing window would flicker for a frame at the start of every morph. With two windows, the stage window is sized and painted while hidden, shown with an identical orb exactly over the bubble, and only then does the bubble window hide. Any timing mismatch is invisible because both windows show the same orb in the same place.

```
┌──────────────────────────── Main process ────────────────────────────┐
│  app lifecycle · single-instance lock · tray                          │
│                                                                       │
│  capture ──► crop ──► history (disk) ◄── settings (+ encrypted key)   │
│                          ▲                                            │
│                          │                                            │
│         chatSession ──► deepseekClient (DeepSeek, streaming)          │
│                                                                       │
│  windows: bubbleWindow · stageWindow · overlayWindow     ipc handlers │
└──────▲──────────────────────────▲─────────────────────────▲───────────┘
       │        preload (typed API, no Node in UI)          │
┌──────┴───────┐   ┌──────────────┴───────────────┐   ┌─────┴────────────────┐
│ Bubble win   │   │ Stage window (React)         │   │ Selection overlay    │
│ idle orb,    │   │ orb · menu · panel ·         │   │ frozen screenshot    │
│ drag + click │   │ conversation/history/settings│   │ + drag rectangle     │
└──────────────┘   └──────────────────────────────┘   └──────────────────────┘
```

### 4.1 Units and their responsibilities

Each unit has one job and a small interface. Units marked **pure** have no Electron dependency and are unit-tested directly.

**Main process**

| Unit | Responsibility | Interface (summary) |
|---|---|---|
| `app` | Startup, single-instance lock, tray menu, wiring the other units together | — |
| `bubbleWindow` | The small always-on-top window holding the idle orb. Moves with the cursor while dragging, animates to its snapped position, and passes clicks through its transparent margin | `show()`, `hide()`, `moveTo(anchor)` |
| `stageWindow` | The window that holds the menu and panel. It's positioned from `stageLayout` while hidden, shown once its first frame is painted, and hidden again after the collapse animation | `openMenu()`, `openPanel(conversation)`, `close()` |
| `stageLayout` (**pure**) | From the bubble's anchor and the work area, computes the stage window bounds and the local rectangles of the bubble, menu and panel inside it | `computeStageLayout(anchor, workArea) → StageLayout` |
| `chatSession` | Runs a conversation: creates it from a capture, sends first questions, follow-ups and retries, streams chunks to the stage, supports Stop, and saves every step through `history` | `start(png)`, `followUp(id, text)`, `retry(id)`, `stop(id)` |
| `captureProtocol` | Serves saved captures to the renderer as `capture://<id>` URLs (id format validated, so no path traversal) | — |
| `overlayWindow` | Shows the full-screen selection overlay with the frozen image; resolves with the selected rectangle or a cancel | `selectArea(frozenImage) → Rect \| null` |
| `capture` | Captures the primary display at physical resolution | `captureScreen() → { image, scaleFactor }` |
| `crop` (**pure**) | Converts a selection rectangle in DIPs to physical pixels using the scale factor, and clamps it to the image | `toPhysicalRect(rectDip, scaleFactor, imageSize) → Rect` |
| `snap` (**pure**) | Given a drop point and the screen work area, returns the snapped bubble position (nearest left/right edge, fully on screen) | `snapBubble(point, bubbleSize, workArea) → { side, y }` |
| `buildMessages` (**pure**) | Turns a stored conversation into the DeepSeek request message array | `buildMessages(conversation, imageDataUrl) → ChatMessage[]` |
| `makeTitle` (**pure**) | Derives a conversation title from the first answer (see section 6.2) | `makeTitle(answerText \| null) → string` |
| `apiErrors` (**pure**) | Maps an API or network failure to a user-facing error kind and message | `mapError(err) → { kind, message }` |
| `deepseekClient` | Sends a request and yields text chunks; supports abort; falls back to a non-streaming request if streaming is rejected | `streamChat(messages, signal) → AsyncIterable<string>` |
| `history` | Creates, lists, loads, updates and deletes conversations on disk | `create(png)`, `appendMessage(id, msg)`, `updateLastMessage(id, msg)`, `list()`, `load(id)`, `remove(id)` |
| `settings` | Loads and saves `settings.json`; stores and reads the encrypted API key | `get()`, `update(partial)`, `getApiKey()`, `setApiKey(key)`, `hasApiKey()` |
| `ipc` | Registers the IPC handlers and forwards streamed chunks to the assistant window | — |

**Renderer: bubble window.** `Bubble` (drag vs. click detection, idle fade) using the shared `Orb`.

**Renderer: stage window.** Components: `Orb`, `Menu`, `Panel`, `ConversationView`, `HistoryView`, `SettingsView`, `Markdown` (with `CodeBlock` + Copy button), `CaptureThumbnail` (click to enlarge inside the panel).

**Renderer: overlay window.** A single `SelectionOverlay` component.

**Shared.** `types.ts` holds `Conversation`, `Message`, `Settings`, `Rect`, the error kinds and the IPC channel contract.

### 4.2 Security basics

- `contextIsolation: true` and `nodeIntegration: false` in both windows; the renderer reaches the main process only through the preload API.
- The API key never crosses into a renderer. The settings view can set a new key and see whether one is saved (shown as `•••• last4`), but never reads the key back in full.
- `react-markdown` does not render raw HTML from answers. Links in answers open in the default browser via `shell.openExternal`, never inside the app.

## 5. User experience

### 5.1 Bubble

- A 56 px orb. After 3 s without the mouse over it, it fades to 60 % opacity. On hover it returns to 100 %.
- **Drag vs. click:** a press that moves more than 5 px is a drag; anything less is a click.
- **Snapping:** on release, the bubble animates to the nearest left or right edge of the work area (which excludes the taskbar), with an 8 px margin. Its vertical position is clamped so it stays fully visible.
- The snapped side and vertical position are saved to `settings.json` and restored on launch.
- **Click** opens a small menu beside the bubble, on the side facing the screen centre: **Select area**, **History**, **Settings**. Clicking elsewhere or pressing Esc closes the menu.
- The bubble stays above normal windows (always on top) and has no taskbar entry.

### 5.2 Tray

The tray icon's menu has **Show bubble** / **Hide bubble** and **Quit**. A second launch of the app does not start a second copy; it shows the bubble instead.

### 5.3 Selecting an area

1. The user chooses **Select area** (from the menu, or from the panel's **New selection** button).
2. If no API key is saved, the panel opens on **Settings** with a message asking for the key, and no selection starts.
3. The menu closes and the assistant window hides. After about 100 ms, so the bubble is fully off screen, the app captures the primary display.
4. The overlay opens full screen showing the frozen capture with a 40 % dark dim layer. The cursor is a crosshair.
5. The user drags a rectangle. The area inside it shows undimmed with a thin border.
6. Releasing the mouse confirms the selection. **Esc** or a right-click cancels it, closes the overlay and brings the bubble back.
7. A selection smaller than 8 DIPs in either dimension is ignored, and the overlay stays open.
8. On confirm, the rectangle is converted to physical pixels (`crop`) and the cropped PNG is saved as a new conversation. The overlay closes, and the assistant opens in panel mode and sends the first request.

### 5.4 Panel

- Size is 420 × 600 DIPs, with the height clamped to the work area. It opens from the bubble's side toward the screen centre, vertically aligned with the bubble and clamped to the work area.
- **Header:** a small orb (which is the loading indicator), the conversation title, and buttons for **New selection**, **History**, **Settings** and **Close**. The History and Settings views show a **Back** button that returns to the conversation.
- **Conversation view,** top to bottom:
  - the capture thumbnail (click to enlarge within the panel)
  - the messages: assistant answers rendered as Markdown; follow-up questions shown as simple user bubbles
  - the follow-up box: **Enter** sends, **Shift+Enter** adds a new line
- **While an answer is in progress:** the header orb plays its thinking animation; the answer area shows a soft placeholder until the first chunk arrives, then text streams in; the follow-up box is disabled; a **Stop** button is shown.
- **Code blocks** get syntax highlighting and a **Copy** button.
- **Closing:** the panel stays open when the user clicks elsewhere. It closes with **Close** or **Esc** (when focused) and morphs back into the bubble.
- **Focus:** when the panel opens it takes focus and puts the cursor in the follow-up box.

### 5.4.1 Adding another screenshot to the same chat (added 2026-09-28)

- **Button:** the follow-up box has a screenshot button (dashed square with a plus) at its left edge. It is disabled while an answer is being written.
- **Selecting:** clicking it clears the panel immediately (no animation) so it isn't in the capture, then runs the same freeze → drag flow as §5.3.
- **Coming back:** on confirm, the crop is saved in the conversation's folder as `capture-2.png`, `capture-3.png`, and so on. The panel reopens (the usual bubble → panel morph) on the **same conversation**, with the screenshot shown as a chip above the text box.
- **Draft kept:** text already typed in the follow-up box is kept across the selection.
- **The chip:** it has a remove (×) button, which also deletes the file. Taking another screenshot before sending replaces the chip (and deletes the replaced file). There is one screenshot per message.
- **Sending:** **Enter** sends the screenshot together with the text. Text is optional when a screenshot is attached. In the conversation, that user message shows the screenshot as a thumbnail (click to enlarge) above its text.
- **Cancelling:** **Esc** or a right-click during the selection returns to the same conversation (not the bubble), with the draft intact.
- **Unchanged:** the header's **New selection** button still starts a new conversation.
- **Leftover chips:** switching to another conversation or starting a new one while a chip is pending discards it (and deletes its file).

### 5.5 History view

- A list of conversations, newest first. Each row shows the thumbnail, title and date.
- Clicking a row opens that conversation, and the user can keep asking follow-ups.
- Each row has a delete button that asks for inline confirmation ("Delete? Yes / No") before removing the conversation folder.

### 5.6 Settings view

- **API key:** a masked input with a Save button. It shows `•••• last4` when a key is saved.
- **Model:** a text field, default `deepseek-flash`.
- **API address:** a text field, default `https://api.deepseek.com`.
- **Launch at startup:** a toggle, off by default. It uses `app.setLoginItemSettings`.
- **Test connection:** sends a tiny text-only request with the current settings and shows either success or the mapped error message.

### 5.7 Visual style: "living orb"

- **Orb:** a soft multi-colour gradient sphere.
  - **Idle:** it slowly "breathes" (scale 1.00 ↔ 1.04 over about 4 s, looping).
  - **Thinking:** the gradient swirls faster and the orb pulses gently.
  - The same orb component is used both as the bubble and in the panel header.
- **Panel:** rounded corners (about 18 px), a barely translucent solid background (98.5 % opaque; 94 % was tried and let busy backgrounds show through text), and a soft shadow. It follows the Windows light/dark theme through `prefers-color-scheme`.
- **Fonts:** Segoe UI Variable for text, and Cascadia Code (falling back to Consolas) for code.

### 5.8 Animation requirements (hard requirement: smooth)

- Only `transform` and `opacity` are animated. Nothing animates width, height, top/left, box-shadow, background-position or filter values.
- The orb's swirl is a pre-rendered gradient layer rotated with `transform: rotate`.
- Transitions use Motion spring animations; nothing moves linearly.
- **Bubble → menu or panel:**
  1. The main process sizes and positions the hidden stage window from `stageLayout`.
  2. The stage renderer paints an orb exactly where the bubble is and reports that it's ready.
  3. The main process shows the stage window, then hides the bubble window.
  4. The stage renderer animates the orb into the menu or panel using transform and opacity.
- **Menu or panel → bubble:** the stage renderer animates back to the orb at the bubble's position. When the animation finishes, the main process shows the bubble window, then hides the stage window.
- **Clicks while the stage is open:** the stage window is sized to fit the panel, so while only the menu is showing, its transparent area catches clicks. A click there counts as "clicking elsewhere" and closes the menu. While the panel is open, only the 16 px shadow margin is transparent.
- **Bubble clicks:** the bubble window ignores mouse events on its transparent margin and forwards them to whatever is underneath. Only the orb itself is clickable.
- **Bubble drag and snap:** these move the small bubble window. Snapping animates the window position with an ease-out curve at about 60 fps.
- **Target:** about 60 fps for the orb and the morphs, verified with Chromium's performance tools on the owner's machine. (Measured: both morphs hold the display's full 144 fps, worst frame 7.2 ms.)
- **The orb rests when idle** (added during implementation). In a transparent window, every animated frame costs a GPU read-back: a constantly animated orb measured about 48 % of one core at 144 Hz, against 0 % when still. So the orb animates only while it's awake:
  - **Bubble:** until it fades to idle.
  - **Stage orb:** around handovers, while the menu is open, and while thinking.
  - **At rest:** it freezes in its current pose instead of snapping back.
  - **Handovers:** each one passes the orb's animation phase (`orbOrigin`) to the other window, so the swap is still invisible.
- **Shadow room:** the window bounds are always the visible content plus a 16 px margin so the shadow isn't clipped.

## 6. Data and storage

Everything is stored under Electron's `userData` folder: `%APPDATA%\ExScreenHelp\`.

```
%APPDATA%\ExScreenHelp\
├── settings.json
├── apikey.bin                      # safeStorage-encrypted API key
└── history\
    └── <id>\                       # id = timestamp + short random suffix, e.g. 20260928-140322-k3f9
        ├── capture.png
        └── conversation.json
```

### 6.1 `settings.json`

```json
{
  "model": "deepseek-flash",
  "baseUrl": "https://api.deepseek.com",
  "launchAtStartup": false,
  "bubble": { "side": "right", "y": 400 }
}
```

A missing or unreadable file falls back to these defaults.

### 6.2 `conversation.json`

```json
{
  "id": "20260928-140322-k3f9",
  "createdAt": "2026-09-28T14:03:22.000Z",
  "updatedAt": "2026-09-28T14:05:10.000Z",
  "title": "Fixing the TypeError in fetchUser",
  "messages": [
    { "role": "user", "image": "capture.png", "text": "", "createdAt": "..." },
    { "role": "assistant", "text": "...", "status": "complete", "createdAt": "..." },
    { "role": "user", "text": "Can you rewrite it with async/await?", "createdAt": "..." },
    { "role": "assistant", "text": "...", "status": "incomplete", "createdAt": "..." }
  ]
}
```

**Title.** The first non-empty line of the first answer, with leading Markdown symbols removed and cut to 60 characters. Until the first answer arrives, the title is "New capture".

**Assistant status.**
- `complete`: the answer finished normally.
- `incomplete`: the answer was stopped by the user or cut off by an error. The partial text is kept, and the view shows "Answer incomplete" with **Retry**.
- A failed request that produced no text saves no assistant message. The last message is then a user message, and the view shows the error with **Retry**.

**Retry.** Retry re-sends the conversation up to and including the last user message. An `incomplete` answer being retried is replaced.

**When it's saved.** `conversation.json` is written when the conversation is created, after each user message, and when each answer ends (complete or incomplete). A crash therefore loses at most the answer that was streaming at the time.

**Damaged files.** When listing history, a folder whose `conversation.json` is missing or unreadable is skipped rather than failing the whole list.

## 7. DeepSeek requests

**Endpoint.** OpenAI-compatible Chat Completions at `settings.baseUrl`, with `model = settings.model` and `stream: true`.

**System message (built-in instruction):**

> You are a helpful on-screen assistant. The user has selected an area of their screen and sent it as an image.
> If it contains a question, answer it directly first, then briefly explain.
> If it contains code or an error message, explain what is wrong and show the fix.
> Otherwise, explain what it is.
> The user may add more screenshots later in the conversation; the newest one is usually what they are asking about.
> Use Markdown. Put all code in fenced code blocks with a language tag. Be concise.

**Message layout:**
- The first user message has the capture as a base64 PNG data URL (`image_url` content part) plus the text "Here is the selected area." DeepSeek accepts images only in user messages.
- A later user message with an added screenshot (§5.4.1) carries its image the same way, with the text "Here is another selected area." followed by whatever the user typed.
- The system message has one extra line saying that more screenshots may be added later and that the newest one is usually what the user is asking about.
- Every follow-up request sends the system message plus the whole conversation, including the image, because the API keeps no memory between requests. The image costs at most about 1,024 tokens per request.

**Image size.** The PNG is sent at its captured resolution; DeepSeek resizes it on its side. A single-monitor capture is well within the API's limits of 8,192 px per side and 32 MiB per image.

**Streaming fallback.** DeepSeek's documentation does not say whether the vision model supports streaming. If the API rejects a streaming request with a 400/422 error that mentions streaming, the client repeats the same request without streaming and remembers this for the rest of the session. In that mode, the orb's thinking animation runs until the full answer arrives.

**Timeout.** When streaming, if no data arrives for 60 s, the request is aborted and treated as a timeout. In non-streaming fallback mode, the whole request has 120 s to complete, since no data arrives until the answer is finished.

**Stop.** Stop aborts the request with an `AbortController`. Text received so far is saved with status `incomplete`.

**One request at a time.** Only one request per conversation can be in flight. The follow-up box stays disabled until it ends.

## 8. Error handling

Errors appear in the panel where the answer would go, as a clear message with **Retry**. The capture is already saved, so a retry never needs a new selection.

| Situation | Detected by | Message (summary) | Action offered |
|---|---|---|---|
| No API key | `settings.hasApiKey()` is false before selection | "Add your DeepSeek API key to get started." | Opens Settings |
| Invalid key | HTTP 401 | "DeepSeek rejected the API key." | Retry, link to Settings |
| No balance | HTTP 402 | "Your DeepSeek account is out of balance." | Retry |
| Rate limited | HTTP 429 | "Too many requests — wait a moment and retry." | Retry |
| Bad model name | HTTP 400/404/422 whose message mentions the model | "DeepSeek doesn't recognise the model `<name>`." | Retry, link to Settings |
| Other bad request | Other HTTP 400/422 | "DeepSeek couldn't process this request." plus the API's message | Retry |
| DeepSeek busy or down | HTTP 500/503 | "DeepSeek is having trouble right now." | Retry |
| Can't connect | Network error | "Can't reach DeepSeek — check your connection." | Retry |
| Timeout | 60 s without data (streaming) or 120 s total (non-streaming fallback) | "DeepSeek took too long to respond." | Retry |
| Cut off mid-answer | Stream error after some text | Partial text is kept, marked "Answer incomplete" | Retry |
| Tiny selection | Under 8 DIPs in either dimension | (none; ignored) | Stays in selection mode |
| Capture failed | `desktopCapturer` throws or returns an empty image | "Couldn't capture the screen." | Bubble returns; the user can try again |

## 9. Testing

### 9.1 Automated tests (Vitest)

| Area | What's checked |
|---|---|
| `crop` | DIP → physical conversion at 100 %, 125 % and 150 % scaling; clamping at the image edges |
| `snap` | Nearest-edge choice; vertical clamping; the taskbar excluded via the work area |
| `buildMessages` | First request and follow-up request shapes; image present in the first user message every time; system message first |
| `history` | Create, append, update the last message, list newest-first, load, delete (against a temp directory); a damaged `conversation.json` is skipped |
| `apiErrors` | Each row of the error table maps to the right kind and message |
| `deepseekClient` | Against a local fake HTTP server (no real API calls): streaming chunks, a stream cut off midway, Stop/abort, the 60 s timeout (with fake timers), and the non-streaming fallback |
| `makeTitle` | Markdown symbols removed; cut to 60 characters; "New capture" before any answer |

### 9.2 Manual checklist on the owner's PC

- Drag, snap to both edges, idle fade, and position restored after a restart
- **Smoothness:** the orb idle and thinking animations, and the bubble ↔ panel and bubble ↔ menu morphs, hold about 60 fps in Chromium's performance tools
- Selecting at the machine's actual display scaling; the crop matches what was dragged
- Esc and right-click cancel; tiny selections are ignored
- Light/dark theme switching
- Error states, triggered with a deliberately wrong API key and a wrong model name
- Tray Show/Hide/Quit; a second launch shows the bubble instead of starting a second copy

### 9.3 End-to-end test (once the owner's DeepSeek key is added)

Select a coding question and a general question. Ask one follow-up on each. Close the app, reopen both from History, and ask another follow-up.

## 10. Items to verify at the start of implementation

These have a defined fallback, so they don't block the design:

1. **Streaming with images on `deepseek-flash`.** If streaming isn't supported, the non-streaming fallback in section 7 applies.
2. **`desktopCapturer` resolution.** Check that it returns a full physical-resolution image at the owner's display scaling. If it returns a scaled-down thumbnail, switch the `capture` unit to the `screenshot-desktop` package; the interface stays the same.
