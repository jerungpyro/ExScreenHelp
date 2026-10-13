# Changelog

All notable changes to ExScreenHelp are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Downloads are on the [Releases page](https://github.com/jerungpyro/ExScreenHelp/releases).

## [Unreleased]

## [1.6.0] - 2026-10-13

### Added

- Works across all your screens. When you select an area, every screen freezes and you can drag your box on any of them. Starting a selection is as quick with two screens as with one.
- The orb can be dragged onto any screen, and the menu and panel open on the screen it's on.

### Changed

- If the orb's screen is disconnected, the orb moves to the main screen, and goes back when the screen is connected again.

## [1.5.0] - 2026-10-13

### Added

- Settings shows which version you have, and a Download button when a newer one has been released. GitHub is asked only when Settings opens, at most once an hour.

### Fixed

- Settings and API keys are saved safely: a crash or power cut while saving can no longer reset your settings or lose a key.
- If the open panel stops responding, clicks around it go through to your other apps until it recovers.

## [1.4.0] - 2026-10-13

### Added

- Move the panel by dragging the orb at its top left, or the empty part of its header.
- Resize the panel by dragging any edge or corner. It reopens where and at the size you left it, until you move the orb somewhere else.

### Changed

- After you select an area, the panel opens on it and waits for your question or instructions. Press Enter on an empty box to have it explained as before. A selection you don't ask about isn't kept.

## [1.3.0] - 2026-10-13

### Added

- A keyboard shortcut, Ctrl+Alt+Space by default, to select an area from any app. With a chat open, it adds a screenshot to your next follow-up. Choose another shortcut, or turn it off, in Settings.
- Paste an image (Ctrl+V) into the follow-up box to attach it. Large images are scaled down to 2000 pixels on their longest side.
- A Copy button under every finished answer, which copies it as Markdown.

## [1.2.0] - 2026-10-08

### Added

- Preferences in Settings: tell the AI how you like your answers. They're sent with every question, whichever provider you use.

### Changed

- Clicking the orb reopens your last conversation, along with anything you'd started typing.
- Clicking the orb at the top of the open panel closes it.

## [1.1.1] - 2026-10-08

### Fixed

- Connects through proxies and antivirus HTTPS scanning, using Windows' proxy settings and trusted certificates the way your browser does.
- "Can't reach" errors now say why, for example `net::ERR_NAME_NOT_RESOLVED`.

## [1.1.0] - 2026-10-07

### Added

- Choose DeepSeek, OpenAI, Claude or Gemini in Settings. The model and API address fill in automatically, and a "Get a key" link opens the right page.
- One encrypted key per provider, so you can switch without pasting keys again.

### Changed

- Clearer error messages that name your provider.
- Answers from models that think before replying no longer time out after a minute of silence. The limit is now two minutes.

## [1.0.0] - 2026-10-07

First public release.

### Added

- A floating orb you can drag anywhere. It snaps to the screen edge and fades when idle.
- Freeze-and-select capture: the screen freezes while you drag a box, and only the selected area is sent.
- Answers that appear as they're written, with formatted Markdown, highlighted code and a Copy button on every code block.
- Follow-up questions, including more screenshots in the same conversation.
- History of every conversation, with its screenshots, saved on your PC.
- Settings for the model, API address and launch at startup. The API key is encrypted with Windows DPAPI.

[Unreleased]: https://github.com/jerungpyro/ExScreenHelp/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.6.0
[1.5.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.5.0
[1.4.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.4.0
[1.3.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.3.0
[1.2.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.2.0
[1.1.1]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.1.1
[1.1.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.1.0
[1.0.0]: https://github.com/jerungpyro/ExScreenHelp/releases/tag/v1.0.0
