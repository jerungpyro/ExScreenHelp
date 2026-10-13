# Contributing to ExScreenHelp

Thanks for wanting to help. ExScreenHelp is a small project maintained in spare time, so a little coordination up front saves everyone time.

## Ways to help

- **Report a bug** or **suggest an idea** by [opening an issue](https://github.com/jerungpyro/ExScreenHelp/issues/new/choose). The forms ask for what's needed to act on it.
- **Fix a bug or build a feature.** For anything bigger than a small fix, open an issue first so the approach can be agreed before you write code. Issues labelled [good first issue](https://github.com/jerungpyro/ExScreenHelp/labels/good%20first%20issue) are a good place to start.
- **Improve the docs**, including this file.

Security problems are different: please report them privately, as described in [SECURITY.md](SECURITY.md).

## Setting up

You need Windows 11 and [Node.js](https://nodejs.org/) 22.12 or newer.

```powershell
git clone https://github.com/jerungpyro/ExScreenHelp.git
cd ExScreenHelp
npm install
npm run dev
```

`npm run dev` starts the app with live reload. To use it, add an API key for one of the providers in Settings.

- **Keep your everyday copy separate.** If you also use ExScreenHelp day to day, run the development copy with its own data folder, so it has its own settings, history and keys: `$env:EXSCREENHELP_USER_DATA = 'C:\some\folder'; npm run dev`. The keyboard shortcut is system-wide, so whichever copy starts second will show it as taken.
- **If `npm run dev` crashes** with `Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')`, the environment variable `ELECTRON_RUN_AS_NODE` is set (VS Code's terminal does this). Clear it first: `Remove-Item Env:ELECTRON_RUN_AS_NODE`.

## Finding your way around

The README's [How it works](README.md#how-it-works) section explains the three windows, how a selection becomes an answer, and how the code is laid out. [CLAUDE.md](CLAUDE.md) is a short summary of the codebase written for AI coding assistants. It is also the most complete list of conventions and gotchas, so it's worth reading.

## Conventions

- **Only the main process holds API keys or touches the disk.** The windows ask for things through `window.api`. To add a call, update `src/shared/api.ts` (its type and channel name), `src/preload/index.ts` and `src/main/ipc.ts`.
- **Treat everything a window sends as untrusted.** Check every argument in `src/main/ipc.ts` before acting on it.
- **Test logic that doesn't need Electron.** Put it in its own module with a `*.test.ts` file next to it, and pass dependencies in as arguments (see `chatSession`, `history` or `settings`). Windows, the controller and IPC have no unit tests, so try changes to them in the running app.
- **Write files that must survive a crash** with `src/main/storage/writeFileSafely`.
- **Mark anything new that takes clicks in the stage window** with `CLICKABLE` (from `stage/useClickThrough.ts`). The stage covers the whole screen while open and lets clicks through everywhere else.
- **Animate only `transform` and `opacity`.** The windows are transparent, and every animated frame costs GPU time.
- **Keep the code plain.** Prefer the obvious loop to the clever one-liner. Comments explain why, in full sentences.
- **Organise by feature.** Files for one area live together, and each file has one job.

### Privacy is a feature

Screenshots, questions and keys go only to the provider the user chose. Don't add analytics, telemetry or any new network request without discussing it in an issue first; the only other request today is the update check in Settings. Never log API keys or screen content.

## Before opening a pull request

```powershell
npm run format      # format with Prettier
npm run typecheck
npm test
```

CI runs the same checks, plus a build, on every pull request. Also run the app (`npm run dev`) and try what you changed.

- **Keep pull requests small:** one change per pull request. Moving or splitting code goes in its own commit, with no change in behaviour.
- **Commit messages:** use [conventional commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `test:`, `perf:`, `chore:`, `ci:`), with a subject line under 72 characters. For example: `fix: keep the panel on screen after unplugging a display`.
- **Changelog:** add user-facing changes to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**, and keep the README in step with features.
- **Describe your change:** say what you changed and why, and how you tested it. The pull request template asks for this.

The maintainer makes releases. Release builds aren't code-signed (`npm run release` puts the installer and zip in `release\`).

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
