# Security policy

ExScreenHelp handles API keys and pictures of your screen, so security reports are very welcome.

## Supported versions

Only the [latest release](https://github.com/jerungpyro/ExScreenHelp/releases/latest) receives fixes. Please check that a problem still happens there before reporting it.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub instead:

**[Report a vulnerability](https://github.com/jerungpyro/ExScreenHelp/security/advisories/new)**

Only the maintainer can see the report. If you can, include:

- what is affected, and how it could be misused
- the steps to reproduce it, or a proof of concept
- the ExScreenHelp version (shown at the bottom of Settings) and your Windows version

This is a project maintained in spare time. The maintainer will reply as soon as they can, keep you informed while a fix is prepared, and credit you in the release notes unless you'd rather not be named.

## What's in scope

Of particular interest:

- how API keys are stored (encrypted with Windows DPAPI) and used
- the boundary between the windows and the main process (`window.api` and its checks in `src/main/ipc.ts`)
- the `capture://` address that serves saved screenshots
- anything that could send screen content, questions or keys somewhere other than the provider the user chose

Not in scope:

- the SmartScreen warning: release builds aren't code-signed, and the README says so
- problems that need someone to already control your Windows account, since they could read your files anyway
