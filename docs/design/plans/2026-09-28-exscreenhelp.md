# ExScreenHelp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Windows floating-orb screen assistant described in `docs/superpowers/specs/2026-09-28-exscreenhelp-design.md`.

**Architecture:** An Electron main process owns capture, storage, settings and the DeepSeek client. Three renderer windows (bubble, stage and overlay) only draw UI and talk to main through one typed preload API. Logic that can be pure (layout, snapping, cropping, request building, titles, error mapping) lives in Electron-free modules that are unit-tested with Vitest.

**Tech Stack:** Electron 44, electron-vite 5, Vite 7, React 19, TypeScript 5.9, Motion 13, react-markdown 10 + remark-gfm + rehype-highlight, openai 7 (pointed at DeepSeek), Vitest 5, electron-builder 26.

> **Status (2026-09-28):** Tasks 1–13 implemented. 83 unit tests pass. The full flow was verified end to end against a local fake DeepSeek server. Still to be checked by the owner: dragging the bubble with a real mouse, and a real DeepSeek request (spec §9.3).
>
> **Added later the same day:** extra screenshots within a chat (spec §5.4.1). Covered by 8 new unit tests (91 total) and verified end to end in an isolated copy (`EXSCREENHELP_USER_DATA`):
> - capture, then add a screenshot with a draft kept across the selection
> - replacing the chip deletes the old file
> - sending carries every screenshot
> - Esc returns to the same chat
> - removing a chip deletes its file
>
> **Plan format note:** the owner asked to go straight into development in the same session, so this plan is at task level: files, interfaces and test cases, not full code. The folder is not a git repository and the owner asked not to push anything, so there are no commit steps.

## Global Constraints

- Windows 11 only; single (primary) monitor.
- Sizes: bubble 56 px; idle fade to 60 % opacity after 3 s; edge margin 8 px; window shadow margin 16 px; panel 420 × 600 DIPs (height clamped to the work area); drag threshold 5 px; minimum selection 8 DIPs.
- Animations: `transform` and `opacity` only; Motion springs; target about 60 fps.
- DeepSeek defaults: model `deepseek-flash`, base URL `https://api.deepseek.com`, `stream: true`, streaming idle timeout 60 s, non-streaming total timeout 120 s.
- Storage: `%APPDATA%\ExScreenHelp\` → `settings.json`, `apikey.bin` (safeStorage), `history\<id>\capture.png` + `conversation.json`.
- `contextIsolation: true`, `nodeIntegration: false`; the API key never reaches a renderer.
- Code style: easy to read over clever; explicit intermediate variables; small focused files.

---

## File map

```
package.json, electron.vite.config.ts, electron-builder.yml, vitest.config.ts
tsconfig.json, tsconfig.node.json, tsconfig.web.json
scripts/make-icon.mjs          → resources/icon.png (generated orb icon)
src/shared/types.ts            Conversation, Message, Settings, Rect, BubbleAnchor, StageLayout, ChatErrorInfo …
src/shared/constants.ts        all sizes/timeouts from Global Constraints
src/shared/api.ts              the preload API interface (typed contract for all three windows)
src/main/index.ts              app lifecycle, single-instance, wiring
src/main/tray.ts               tray icon + menu
src/main/controller.ts         assistant state machine: idle ↔ menu ↔ selecting ↔ panel
src/main/ipc.ts                ipcMain handlers → controller / services
src/main/windows/loadRenderer.ts   dev-URL vs file loading helper
src/main/windows/bubbleWindow.ts
src/main/windows/stageWindow.ts
src/main/windows/overlayWindow.ts
src/main/layout/snap.ts (+ .test.ts)
src/main/layout/stageLayout.ts (+ .test.ts)
src/main/capture/capture.ts
src/main/capture/crop.ts (+ .test.ts)
src/main/chat/systemPrompt.ts
src/main/chat/buildMessages.ts (+ .test.ts)
src/main/chat/makeTitle.ts (+ .test.ts)
src/main/chat/apiErrors.ts (+ .test.ts)
src/main/chat/deepseekClient.ts (+ .test.ts, fake HTTP server)
src/main/chat/chatSession.ts (+ .test.ts, fake client + temp-dir history)
src/main/storage/history.ts (+ .test.ts)
src/main/storage/settings.ts (+ .test.ts)
src/main/storage/captureProtocol.ts
src/preload/index.ts
src/renderer/bubble.html, stage.html, overlay.html
src/renderer/src/styles/theme.css
src/renderer/src/components/Orb.tsx + orb.css
src/renderer/src/bubble/main.tsx, Bubble.tsx, bubble.css
src/renderer/src/stage/main.tsx, Stage.tsx, Menu.tsx, Panel.tsx, ConversationView.tsx,
    HistoryView.tsx, SettingsView.tsx, Markdown.tsx, CodeBlock.tsx, CaptureThumbnail.tsx, stage.css
src/renderer/src/overlay/main.tsx, SelectionOverlay.tsx, overlay.css
```

## Tasks

### Task 1: Scaffold and toolchain
**Files:** package.json, electron.vite.config.ts, tsconfig*.json, vitest.config.ts, src/main/index.ts (stub), src/preload/index.ts (stub), src/renderer/*.html (stubs)
- [ ] Install pinned deps (vite 7 because electron-vite 5 peers `vite ^5‖^6‖^7`; plugin-react 5.2).
- [ ] Multi-page renderer inputs (bubble/stage/overlay) and CommonJS main/preload output.
- [ ] Scripts: `dev`, `build`, `typecheck`, `test`, `package`.
- [ ] Verify: `npm run typecheck`, `npm test` (no tests → passes with `--passWithNoTests`), `npm run build` succeed.

### Task 2: Shared types, constants and API contract
**Files:** src/shared/types.ts, constants.ts, api.ts
**Produces:** `Rect {x,y,width,height}`, `BubbleAnchor {side:'left'|'right', y}`, `StageLayout {windowBounds, bubble, menu, panel}` (local rects), `Message` (user: `{role:'user', text, image?, createdAt}`; assistant: `{role:'assistant', text, status:'complete'|'incomplete', createdAt}`), `Conversation {id, createdAt, updatedAt, title, messages}`, `ConversationSummary {id, createdAt, updatedAt, title}`, `Settings {model, baseUrl, launchAtStartup, bubble: BubbleAnchor}`, `ChatErrorKind`, `ChatErrorInfo {kind, message}`, `ChatState {conversation, streamingText: string|null, busy, error: ChatErrorInfo|null}`, `ExScreenApi` (preload surface).

### Task 3: Pure layout and crop units (TDD)
**Files:** src/main/layout/snap.ts, stageLayout.ts, src/main/capture/crop.ts + tests
**Produces:**
- `bubbleRect(anchor, workArea): Rect`
- `snapBubble(dropTopLeft: {x,y}, workArea): BubbleAnchor`
- `clampAnchor(anchor, workArea): BubbleAnchor`
- `computeStageLayout(anchor, workArea): StageLayout`
- `toPhysicalRect(rectDip, imageSize, displaySize): Rect | null` (scale = imageWidth / displayWidth; null if smaller than 8 DIPs)

**Tests:** nearest-edge choice at both halves; y clamped at top/bottom; taskbar excluded; panel right-aligned with the bubble on the right side and left-aligned on the left; panel clamped at the top/bottom of the work area; menu beside the bubble toward the centre; local rects relative to the window origin with the 16 px margin; crop at scales 1.0, 1.25 and 1.5; clamping at image edges; null below the minimum size.

### Task 4: Chat pure units (TDD)
**Files:** src/main/chat/systemPrompt.ts, buildMessages.ts, makeTitle.ts, apiErrors.ts + tests
**Produces:**
- `SYSTEM_PROMPT` (verbatim from spec §7)
- `buildMessages(conversation, imageDataUrl): ChatCompletionMessageParam[]`: system first; first user message = text part "Here is the selected area." (plus the user's text if any) + `image_url` part; later messages as plain text.
- `makeTitle(answer: string | null): string`: first non-empty line, leading `#`, `>`, `-`, `*`, `` ` `` and spaces stripped, max 60 chars (append `…` when cut), "New capture" when null or empty.
- `mapError(err: unknown, model: string): ChatErrorInfo`: rows from spec §8 (401, 402, 429, model-related 400/404/422, other 400/422, 500/503, network, timeout, plus an unknown fallback).

### Task 5: Storage units (TDD, temp directories)
**Files:** src/main/storage/history.ts, settings.ts + tests
**Produces:**
- `createHistoryStore(rootDir)` → `{ create(png: Buffer): Conversation; save(c: Conversation): void; load(id): Conversation | null; list(): ConversationSummary[]; remove(id): void; capturePath(id): string; isValidId(id): boolean }`
- `createSettingsStore(dir, crypto: SecretCrypto)` → `{ get(): Settings; update(partial): Settings; hasApiKey(); getApiKey(): string | null; setApiKey(key): void; apiKeyHint(): string | null }`, where `SecretCrypto = { isAvailable(): boolean; encrypt(s): Buffer; decrypt(b): string }`.

**Tests:** create writes the PNG + JSON; list is newest-first and skips damaged/missing JSON; remove deletes the folder; ids with `..` or slashes are rejected; settings defaults when the file is missing or corrupt; partial update merges; the key round-trips through the fake crypto; the hint shows the last 4 characters; the file on disk never contains the plain key.

### Task 6: DeepSeek client (TDD with a local fake server)
**Files:** src/main/chat/deepseekClient.ts + test
**Produces:** `createDeepseekClient(config: {apiKey, baseUrl, model})` → `streamChat(messages, signal): AsyncGenerator<string>`; module-level streaming-unsupported fallback; `ChatTimeoutError`.
**Tests (node http server emitting SSE):** chunks arrive in order; an HTTP 401 surfaces with `status`; a 400 mentioning "stream" triggers a non-stream retry that yields the full text; abort stops iteration; the idle timeout throws `ChatTimeoutError` (short timeout injected for the test).

### Task 7: Chat session (TDD with a fake client)
**Files:** src/main/chat/chatSession.ts + test
**Produces:** `createChatSession({history, getClient, emit})` → `start(png): Conversation`, `followUp(id, text)`, `retry(id)`, `stop(id)`, `isBusy(id)`; emits `{type:'state', state: ChatState}` and `{type:'chunk', id, text}`.
**Tests:** a first answer completes, is saved and gets a title; stop saves the partial text as `incomplete`; retry replaces an incomplete answer; an error with no text saves nothing and emits an error; follow-up is refused while busy; no API key → a `no-key` error.

### Task 8: Electron shell — windows, capture, controller, IPC, preload
**Files:** src/main/index.ts, controller.ts, ipc.ts, tray.ts, windows/*, capture/capture.ts, storage/captureProtocol.ts, preload/index.ts, scripts/make-icon.mjs
- [ ] Bubble window: 88×88 transparent, frameless, non-focusable, always on top (`screen-saver` level), skip taskbar; `setIgnoreMouseEvents(true, {forward:true})` except over the orb; drag via main polling the cursor at 60 Hz; snap animation (ease-out, about 250 ms).
- [ ] Stage window: transparent and frameless, hidden until needed; open → set bounds → send layout → wait for `stage:ready` → show → hide the bubble; close → the renderer animates → `stage:closed` → show the bubble → hide the stage. Blur while in menu view closes the menu.
- [ ] Overlay: hide the windows, wait 100 ms, capture, then open a full-display overlay with the frozen image; it resolves with a rect or null.
- [ ] Controller state machine plus the IPC handlers; the tray; the single-instance lock; `display-metrics-changed` → re-clamp the bubble; launch-at-startup only when packaged.
- [ ] Verify: `npm run dev` shows the bubble; drag and snap work; a click opens an empty stage; the tray quits.

### Task 9: Orb and bubble UI
Load `design-taste-frontend` for the visual pass.
- [ ] `Orb` with layered gradients, a breathing idle state and a swirl + pulse thinking state (transform/opacity only).
- [ ] `Bubble`: pointer handling (5 px threshold → drag, else click), idle fade after 3 s, hover to full opacity.

### Task 10: Stage UI — menu, morph and panel shell
- [ ] `Stage` view state machine: `menu | conversation | history | settings`; entry and exit animations; Motion `layoutId` morph from the orb to the panel.
- [ ] `Menu` with Select area / History / Settings; Esc closes.
- [ ] `Panel` header: orb, title, New selection, History, Settings, Close; Back in sub-views.

### Task 11: Conversation, Markdown, History, Settings views
- [ ] `ConversationView`: thumbnail (enlarge), messages, streaming text, Stop, errors with Retry, "Answer incomplete", follow-up box (Enter / Shift+Enter).
- [ ] `Markdown` + `CodeBlock` with a Copy button; links open externally.
- [ ] `HistoryView`: list with thumbnails via `capture://`, open, inline delete confirmation.
- [ ] `SettingsView`: key (masked, hint), model, base URL, launch at startup, Test connection.

### Task 12: Selection overlay UI
- [ ] Frozen image, 40 % dim with an undimmed hole, crosshair cursor, drag rectangle, Esc/right-click cancel, ignore tiny selections.

### Task 13: Packaging and verification
- [ ] `electron-builder.yml` (win `dir` target, icon); `npm run package` produces `dist/win-unpacked/ExScreenHelp.exe`.
- [ ] Run the full test suite and typecheck.
- [ ] Run the app, go through the manual checklist from spec §9.2 (with screenshots), and measure fps for the orb and morphs.
- [ ] Record what could not be verified without the DeepSeek key (spec §9.3).
