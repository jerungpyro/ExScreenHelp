# ExScreenHelp

A Windows 11 tray app: a floating orb that freezes the screen, lets you drag a box, and sends the crop to DeepSeek, OpenAI, Claude or Gemini. Answers stream into a panel; conversations (with their screenshots) are saved locally. Electron + React + TypeScript, built with electron-vite. The user-facing description is in [README.md](README.md); the original design is in `docs/superpowers/specs/`.

## Commands

```powershell
npm run dev        # run with live reload
npm test           # Vitest unit tests (main-process logic only)
npm run typecheck  # node + web tsconfigs
npm run package    # portable build in dist\win-unpacked
npm run release    # installer + zip in release\ (unsigned)
```

## Layout

- `src/main/`: the Electron main process, organised by feature: `capture/`, `chat/` (provider clients, request building, error mapping), `layout/` (pure geometry), `storage/` (history, settings, encrypted keys), `updates/` (asks GitHub for a newer version), `windows/` (bubble, stage, overlay). `controller.ts` coordinates the windows; `ipc.ts` registers every IPC handler; `shortcut.ts` holds the global keyboard shortcut.
- `src/preload/index.ts`: exposes the typed `window.api`.
- `src/renderer/`: three pages, one per window: `bubble` (the idle orb), `stage` (menu and panel), `overlay` (full-screen selection).
- `src/shared/`: types, constants, the provider list, panel geometry (`geometry.ts`) and the IPC contract (`api.ts`), shared by all processes.

## Conventions

- Only the main process holds API keys or touches the disk. Renderers ask through `window.api`. To add a call, update `shared/api.ts` (type + channel name), `preload/index.ts` and `main/ipc.ts`.
- IPC input is untrusted: validate every argument in `ipc.ts` (see `cleanPatch`, `isValidId`).
- Logic that doesn't need Electron goes in its own module with a `*.test.ts` next to it, taking dependencies as arguments (see `chatSession`, `history`, `settings`). Electron-only code (windows, controller, IPC) has no unit tests; check it by running the app.
- Writes to disk that must survive a crash go through `storage/writeFileSafely` (temp file, then rename).
- Animate only `transform` and `opacity`. The orb rests when idle because every animated frame in a transparent window costs GPU time.
- Comments explain why, in plain sentences. Keep the user-facing README in step with features.

## Gotchas

- `ELECTRON_RUN_AS_NODE` (set by VS Code's terminal) makes `npm run dev` crash with `registerSchemesAsPrivileged` undefined. Clear it first.
- `EXSCREENHELP_USER_DATA` points a copy at its own data folder and single-instance lock, so a test build can run next to the installed one. The keyboard shortcut is still system-wide: whichever copy starts second shows it as taken in Settings.
- The stage window is never hidden: it draws nothing and lets clicks through when closed, so it can paint its orb before taking over from the bubble. While open it covers the whole work area (so the panel moves and resizes inside it) and takes clicks only while the pointer is over something marked with `CLICKABLE` (`stage/useClickThrough.ts`). Anything new that takes clicks needs that mark, or clicks fall through to the app below.
- DeepSeek's key file is `apikey.bin` (from v1.0); other providers use `apikey-<id>.bin`.
