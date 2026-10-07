# ExScreenHelp

A floating orb for Windows 11. Click it, choose **Select area**, drag a box around anything on your screen, and the AI of your choice (DeepSeek, OpenAI, Claude or Gemini) answers in a panel that grows out of the orb. You can ask follow-ups, and every conversation (with its screenshot) is kept in History.

It handles general questions (homework, articles, translation, "what is this?") and code (snippets, error messages, stack traces).

## Download

Get the latest version from the [Releases page](https://github.com/jerungpyro/ExScreenHelp/releases/latest). Pick one:

- **`ExScreenHelp-Setup-<version>.exe`**: installer. Installs for your user only (no admin rights needed) and adds Start menu and desktop shortcuts. Remove it later from Windows Settings → Apps.
- **`ExScreenHelp-<version>-win-x64.zip`**: portable. Unzip it anywhere and run `ExScreenHelp.exe`.

Requires Windows 11, 64-bit.

The app isn't code-signed, so Windows SmartScreen may say **"Windows protected your PC"** the first time. Click **More info**, then **Run anyway**.

## Setup

1. Click the orb and open **Settings**.
2. Choose your **Provider**. Its model and API address fill in automatically.
3. Get an API key from that provider (the **Get a key** link opens the right page) and paste it in. The provider bills API usage to your account.
4. Click **Test connection**. It saves your settings and checks that the key and model work.

| Provider | Default model | Get a key |
| --- | --- | --- |
| DeepSeek | `deepseek-flash` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| OpenAI | `gpt-6.1-sol` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Claude | `claude-opus-5-5` | [platform.claude.com](https://platform.claude.com/settings/keys) |
| Gemini | `gemini-3.8-flash` | [aistudio.google.com](https://aistudio.google.com/apikey) |

You can change the model in Settings, as long as it accepts images. Each provider keeps its own key, so you can switch back and forth without pasting keys again.

## Using it

- **Ask about something on screen:** click the orb, choose **Select area** and drag a box. The screen freezes while you select. Press **Esc** to cancel.
- **Follow up:** type in the box under the answer. **Enter** sends, **Shift+Enter** adds a new line.
- **History:** reopen any earlier conversation from the orb's menu and keep asking.
- **Move the orb:** drag it anywhere. It snaps to the nearest screen edge and fades when you're not using it.
- **Tray icon:** show or hide the orb, or quit the app.
- **Settings:** provider, API key, model, API address and **Launch at startup**.

## Privacy

- Only the area you select is saved or sent. The app briefly screenshots the whole screen to freeze it while you select, but keeps that image in memory only.
- The selected area and your questions are sent to the provider you chose (or to the API address set in Settings), and nowhere else.
- Your API keys are encrypted with Windows' built-in protection (DPAPI) and stored on your PC.
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

- `settings.json`: provider, model, API address, bubble position, launch at startup
- `apikey.bin`: your DeepSeek API key, encrypted with DPAPI (the name is kept from version 1.0, when DeepSeek was the only provider)
- `apikey-openai.bin`, `apikey-claude.bin`, `apikey-gemini.bin`: the other providers' keys, encrypted the same way
- `history\<id>\`: one folder per conversation, holding `conversation.json` and its screenshots (`capture.png`, `capture-2.png`, …)

To run a second, separate copy (for example a test build next to your everyday one), point it at another data folder: `$env:EXSCREENHELP_USER_DATA = 'C:\some\folder'; npm run dev`.

### Notes

- DeepSeek, OpenAI and Gemini are reached through their OpenAI-compatible APIs with the `openai` package. Claude uses Anthropic's own API through `@anthropic-ai/sdk`. The provider list, with default models and addresses, is in [`src/shared/providers.ts`](src/shared/providers.ts).
- If a provider renames its default model, change it in Settings.
- If `npm run dev` fails with `Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')`, the environment variable `ELECTRON_RUN_AS_NODE` is set. Some tools, such as VS Code extensions, set it. Clear it first: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.
- Design: [`docs/superpowers/specs/2026-09-28-exscreenhelp-design.md`](docs/superpowers/specs/2026-09-28-exscreenhelp-design.md). Plan: [`docs/superpowers/plans/2026-09-28-exscreenhelp.md`](docs/superpowers/plans/2026-09-28-exscreenhelp.md).

## License

[MIT](LICENSE)
