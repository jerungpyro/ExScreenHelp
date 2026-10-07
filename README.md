# ExScreenHelp

A floating orb for Windows 11. Click it, choose **Select area**, drag a box around anything on your screen, and DeepSeek answers in a panel that grows out of the orb. You can ask follow-ups, and every conversation (with its screenshot) is kept in History.

## Run it

```powershell
npm install
npm run dev        # development, with live reload
npm run package    # portable build: dist\win-unpacked\ExScreenHelp.exe
```

Then open **Settings** from the orb's menu and paste your DeepSeek API key.

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run make-icon` (redraws `resources/icon.png`).

## Where things are stored

`%APPDATA%\ExScreenHelp\`:

- `settings.json`: model, API address, bubble position, launch at startup
- `apikey.bin`: your API key, encrypted with Windows' built-in protection (DPAPI)
- `history\<id>\capture.png` and `conversation.json`: one folder per conversation

To run a second, separate copy (for example a test build next to your everyday one), point it at another data folder: `$env:EXSCREENHELP_USER_DATA = 'C:\some\folder'; npm run dev`.

## Notes

- The model defaults to `deepseek-flash`, DeepSeek's image-capable model. If DeepSeek renames it, change it in Settings.
- If `npm run dev` fails with `Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')`, the environment variable `ELECTRON_RUN_AS_NODE` is set. Some tools, such as VS Code extensions, set it. Clear it first: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- Design: `docs/superpowers/specs/2026-09-28-exscreenhelp-design.md`. Plan: `docs/superpowers/plans/2026-09-28-exscreenhelp.md`.
