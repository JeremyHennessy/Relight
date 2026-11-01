# Relight — browser-first playable UX review

**Status (2026-10-30):** browser implementation on experimental branch `feat/relight-first-play-ux-v2`; **NOT an approved replacement for the working Unity Android build**. A separate Cloudflare staging preview is publicly playable at **https://relight-ux-playtest.pages.dev/** and has passed independent HTTP/Chromium live-game testing. GitHub Pages remains an optional unconfigured publisher. Any later code change needs its own verification and staging deployment.

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
- Compact one-thumb toolbelt immediately above the grid on mobile (including 320px phones); selected tools synchronized with the descriptive desktop palette.
- Start guide scrolls to the playable board; first POWER and second MINE are preselected; the mission prompt updates with the actual next action.
- Phone notifications appear near the top instead of covering the lower network grid; separate CI tests verify their visible position before dismissal.

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

## Live browser playtest and hosting

**Primary currently verified playtest URL:** https://relight-ux-playtest.pages.dev/ . This is a standalone Cloudflare Pages project `relight-ux-playtest` on the user's Personal account, connected to the Relight experimental branch and serving `web-preview/`. The initial deployed GitHub commit was `547ad1d1b2f78a45b73bd45e3d6bfbcc50b11c17`. [GitHub Actions hosted-site verification #41131709899](https://github.com/JeremyHennessy/Relight/actions/runs/41131709899) independently fetched HTML, JS, CSS and icon over HTTPS and ran real mobile/desktop Chromium playtests against that public URL. **Do not assume later local branch changes are live unless a newer Cloudflare deployment and fresh hosted-site test confirm it.** Some newer Cloudflare deployments may require an explicit branch deployment through the connected Cloudflare app; a repository push alone is not yet verified as an automatic publishing trigger.

The `.github/workflows/relight-web-playtest-pages.yml` workflow:
1. Parses JS and runs deterministic Node model tests.
2. Runs a real 390px mobile / 320px narrow mobile / 1440px desktop Chromium test and uploads screenshots.
3. Keeps GitHub Pages publishing as an **opt-in secondary host**. To activate it, the owner first chooses **Settings → Pages → Build and deployment → Source → GitHub Actions**, then sets GitHub Actions repository variable `RELIGHT_PUBLISH_GITHUB_PAGES=true`. A separate check confirms that the Pages API exposes `build_type: workflow` before attempting a deployment. Until enabled, GitHub Pages is skipped and should not report a false game-test failure.

The **GitHub Pages URL is not confirmed live** and must not be advertised as such. The expected GitHub path, if it is eventually published, is `https://jeremyhennessy.github.io/Relight/` and must be verified by an actual deployment. All site assets use relative URLs, so the same tested web code works on Cloudflare Pages and GitHub Pages. No Unity editor or licensing secrets are required for the browser version.

## Acceptance before any native redesign

1. Confirm the *latest intended commit* is on the verified public Cloudflare preview (or on GitHub Pages once enabled), not merely that the hosting service accepted a deployment.
2. Inspect attached real Chromium desktop/mobile screenshots, then review the app on a phone browser.
3. First-run playtest: a newcomer knows to place POWER on the highlighted tile; then MINE; then revive.
4. Test on-screen button interaction, no clipping/overlap, planet stages, upgrades, save/reload/offline.
5. Collect explicit user visual approval (screenshot/layout preferred); preserve its exact source commit.
6. Only then implement same approved experience in Unity on **another branch**; recompile, retest, review screenshots and prevent approved UI regressions.

## What remains outside this proof

- Unity app UI redesign, APK build and store signing.
- Web Unity-renderer parity, audio, purchases, ads, analytics, mobile memory/performance benchmarking.
- User acceptance of aesthetics; automated browser tests cannot supply taste or final visual approval.
