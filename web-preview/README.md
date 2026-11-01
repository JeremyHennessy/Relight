# Relight — web playtest

This is an experimental, playable browser-first prototype of Relight. It is not a Unity WebGL export and has **not** received owner approval as the final mobile UI.

## Run / publish

The application is static. Serve this folder over HTTP: `python -m http.server 8765`, then visit `http://localhost:8765`.

The site uses relative paths (`./app.mjs`, `./model.mjs`, `./styles.css`), so it can be deployed unchanged to GitHub Pages or Cloudflare Pages. No Node build, API keys, paid service, login or backend are required for gameplay.

- First launch has a walkthrough, followed by a guided POWER/MINE construction sequence.
- The quick toolbelt beside the board is visible on phones.
- Click/tap a machine, then a grid square. The glowing `NEXT` tile is a recommendation, not a hard restriction.
- Restoration, production, upgrading, revival and offline simulation use the same rules as the Unity core at the preserved Android checkpoint.
- Saves use this browser's `localStorage` key `relight.webplaytest.v1`. Unity saves are separate.

## Verification

`node --test model.test.mjs` checks the deterministic gameplay and offline economy. The GitHub Actions workflow also runs headless Chromium at 390px mobile, 320px narrow mobile and 1440px desktop, exercises the tutorial, machine selection, save/reload, late-stage recovery, one revival and screenshots. These checks do not constitute human visual approval or native Android parity proof.

GitHub's legacy Unity Android development checkpoint and original game code are unchanged. See [web playtest plan](../docs/WEB_PLAYTEST.md) and [draft PR #14](https://github.com/JeremyHennessy/Relight/pull/14).
