# ExScreenHelp

A floating orb for Windows 11. Click it, choose **Select area**, drag a box around anything on your screen, and DeepSeek answers in a panel that grows out of the orb. You can ask follow-ups, and every conversation (with its screenshot) is kept in History.

It handles general questions (homework, articles, translation, "what is this?") and code (snippets, error messages, stack traces).

## Download

Get the latest version from the [Releases page](https://github.com/jerungpyro/ExScreenHelp/releases/latest). Pick one:

- **`ExScreenHelp-Setup-<version>.exe`**: installer. Installs for your user only (no admin rights needed) and adds Start menu and desktop shortcuts. Remove it later from Windows Settings → Apps.
- **`ExScreenHelp-<version>-win-x64.zip`**: portable. Unzip it anywhere and run `ExScreenHelp.exe`.

Requires Windows 11, 64-bit.

The app isn't code-signed, so Windows SmartScreen may say **"Windows protected your PC"** the first time. Click **More info**, then **Run anyway**.

## Setup

1. Get a DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com/). DeepSeek bills API usage to your account.
2. Click the orb, open **Settings**, paste the key and click **Save key**.

## Using it

- **Ask about something on screen:** click the orb, choose **Select area** and drag a box. The screen freezes while you select. Press **Esc** to cancel.
- **Follow up:** type in the box under the answer. **Enter** sends, **Shift+Enter** adds a new line.
- **History:** reopen any earlier conversation from the orb's menu and keep asking.
- **Move the orb:** drag it anywhere. It snaps to the nearest screen edge and fades when you're not using it.
- **Tray icon:** show or hide the orb, or quit the app.
- **Settings:** API key, model, API address and **Launch at startup**.

## Privacy

- Only the area you select is saved or sent. The app briefly screenshots the whole screen to freeze it while you select, but keeps that image in memory only.
- The selected area and your questions are sent to DeepSeek (or to the API address set in Settings), and nowhere else.
- Your API key is encrypted with Windows' built-in protection (DPAPI) and stored on your PC.
- Conversations and their screenshots are stored on your PC in `%APPDATA%\ExScreenHelp\`. Uninstalling keeps them. To erase them, delete that folder.

## Build from source

Needs [Node.js](https://nodejs.org/) 22.12 or newer.

```powershell
npm install
npm run dev        # development, with live reload
npm run package    # portable build: dist\win-unpacked\ExScreenHelp.exe
npm run release    # public downloads: installer and zip in release\
```

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run make-icon` (redraws `resources/icon.png`).

### Where things are stored

`%APPDATA%\ExScreenHelp\`:

- `settings.json`: model, API address, bubble position, launch at startup
- `apikey.bin`: your API key, encrypted with DPAPI
- `history\<id>\`: one folder per conversation, holding `conversation.json` and its screenshots (`capture.png`, `capture-2.png`, …)

To run a second, separate copy (for example a test build next to your everyday one), point it at another data folder: `$env:EXSCREENHELP_USER_DATA = 'C:\some\folder'; npm run dev`.

### Notes

- The model defaults to `deepseek-flash`, DeepSeek's image-capable model. If DeepSeek renames it, change it in Settings.
- If `npm run dev` fails with `Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')`, the environment variable `ELECTRON_RUN_AS_NODE` is set. Some tools, such as VS Code extensions, set it. Clear it first: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- Design: [`docs/superpowers/specs/2026-09-28-exscreenhelp-design.md`](docs/superpowers/specs/2026-09-28-exscreenhelp-design.md). Plan: [`docs/superpowers/plans/2026-09-28-exscreenhelp.md`](docs/superpowers/plans/2026-09-28-exscreenhelp.md).

## License

[MIT](LICENSE)
