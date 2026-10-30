# Relight — browser-first playable UX review

**Status:** browser implementation on experimental branch `feat/relight-first-play-ux-v2`; **NOT an approved replacement for the working Unity Android build**. This document intentionally makes no claim that GitHub Pages has published or been visually approved yet.

## Purpose

The first Android APK proved the Unity project could compile but revealed an unacceptable first-player experience. To avoid a new APK on every design iteration, the project now includes a no-dependencies, static HTML/CSS/JavaScript prototype in `web-preview/`. This is an **independent web implementation** of the Relight simulation—not a Unity WebGL export. Browser visuals and controls can change quickly, but must be ported to Unity only after acceptance.

## What is playable now

- First-run guided instructions (and always-available **How to play**).
- 5×5 energy grid with choose/tool buttons and suggested construction cells.
- Generator, mine, relay, life engine, remove, mining/power upgrades and grid repair.
- Scrap mining, power distribution, machine adjacency and resource-consuming restoration.
- Visible recovery meter, changing hand-drawn procedural planet, claimable **AWAKEN REGION** milestone.
- Browser-local save/restore, offline cap (8 hours time/30 minutes of mining), no ads/payments.
- Responsive desktop/mobile layout; phone-safe spacing and keyboard-friendly controls.

## Simulation parity agreement

Source of truth is `Assets/Scripts/Core/WorldModel.cs` at Android checkpoint `094fb11d4d18e985643f5792788592d19484a950`. `web-preview/model.mjs` mirrors the gameplay rules, including:
- Starter 30 scrap, center core and starter machines.
- Build costs relay 4/mine 12/life 18/power 15.
- BFS connectivity, 2 base capacity, generators add 2, upgrades add 1.
- Mining relay bonuses, restoration generator bonuses and fair consumer sharing.
- Revival threshold `100*(1+region*0.5)`; one free, manually claimed revival at a time.
- Offline 8-hour maximum, 30-minute mine-storage cap.
- Tutorial opening generator tile 19, mine tile 7, first revival goal.

`web-preview/model.test.mjs` checks representative parity invariants, progression, persistence and stress. Tests are **not** a formal proof of identical behavior for all states. Any future change to Unity `WorldModel` must be reviewed against the JavaScript port, and vice versa. Browser saves (`relight.webplaytest.v1`) are **not** Unity PlayerPrefs saves and are not advertised as portable.

## Delivery via GitHub Pages

The `.github/workflows/relight-web-playtest-pages.yml` workflow:
1. Parses JS, runs deterministic Node model tests.
2. Executes actual mobile/desktop Chromium test and stores screenshots as an artifact.
3. Deploys only `web-preview/` to GitHub Pages, subject to GitHub Pages being enabled.

**Required once per repository, if Pages is not enabled:** repository **Settings → Pages → Build and deployment → Source → GitHub Actions**. No API token, Unity license, Unity Cloud editor or Android emulator is required for this site. A Pages deployment failure because Pages is disabled should not be mistaken for a failure of gameplay/model tests.

After the first successful deployment, the expected Pages URL is `https://jeremyhennessy.github.io/Relight/` (verify the actual URL in the completed deployment's `page_url`; never claim live until confirmed). The page depends only on same-directory web assets and Google Fonts (font falls back gracefully when offline). No backend or sensitive credentials.

## Acceptance before any native redesign

1. Confirm the Pages deployment completed successfully.
2. Inspect attached real Chromium desktop/mobile screenshots, then review the app on a phone browser.
3. First-run playtest: a newcomer knows to place POWER on the highlighted tile; then MINE; then revive.
4. Test on-screen button interaction, no clipping/overlap, planet stages, upgrades, save/reload/offline.
5. Collect explicit user visual approval (screenshot/layout preferred); preserve its exact source commit.
6. Only then implement same approved experience in Unity on **another branch**; recompile, retest, review screenshots and prevent approved UI regressions.

## What remains outside this proof

- Unity app UI redesign, APK build and store signing.
- Web Unity-renderer parity, audio, purchases, ads, analytics, mobile memory/performance benchmarking.
- User acceptance of aesthetics; automated browser tests cannot supply taste or final visual approval.
