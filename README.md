# RELIGHT
**A portrait idle-strategy mobile game about bringing dormant planets back to life.**

**Development status:** early playable **source**, not yet tested in the Unity editor or on a mobile device. Android/iOS store releases have not been built or submitted.

## Player fantasy
One spark brings a dead world back to life. Build an energy network, connect mines and restoration equipment, repair bottlenecks, and watch the planet change as regions recover. Your connected systems earn progress while you are away.

## Current source
- Unity `6000.1.9f1` project, C# energy-network core, build tools and edit-mode tests.
- 5×5 network, five build actions, production/consumption, adjacency synergies, power constraints and two upgrade types.
- Guided first session: boost the LIFE facility, expand the mine network, then restore a region.
- Procedurally generated planets with four visual styles, gradual restoration, clouds, city lights and region-completion feedback.
- Local saving with a last-valid-save fallback, capped offline earnings, and emergency network repair.
- GitHub Actions compile the Unity-independent C# model and exercise deterministic and randomized gameplay checks. Roslyn parses Unity C# source. **Neither verifies Unity API integration or a mobile build.**

## Repository layout
- `Assets/Scripts/Core/`: deterministic game economy and state — no Unity dependency.
- `Assets/Scripts/Runtime/`: portrait UI, interactions, procedural visual generation.
- `Assets/Editor/`: Unity scene setup and Android development build menu.
- `Assets/Tests/EditMode/`: Unity-specific EditMode tests (**13 defined**, not yet run in Unity).
- `verification/`: standalone .NET core and C# syntax validation jobs.
- `docs/PRODUCT_STRATEGY.md`: long-term gameplay/visual/business direction.
- `docs/GAME_DESIGN.md`: concrete mechanics and progression plan.
- `docs/BUILD_AND_RELEASE.md`: editor setup, validation gates and store blockers.

## Run in Unity
1. Open repository in **Unity 6000.1.9f1**, using Unity Hub with required modules.
2. Let packages import. Resolve all Console errors before proceeding.
3. Select **Relight > Initialize Playable Scene** in the Unity menu.
4. Open `Assets/Scenes/Relight.unity` and press Play.
5. Run EditMode tests with the Test Runner.
6. Use **Relight > Build Android Development APK** for a first device build after verifying Android support modules.
7. Inspect real screenshots, pause/resume and save/restoration behavior before approving a baseline.

Read [Build and release instructions](docs/BUILD_AND_RELEASE.md) before producing a signed build.

## Development checkpoints
- [PR #1 — first playable foundation](https://github.com/JeremyHennessy/Relight/pull/1)
- [PR #5 — procedural planets and placement synergies](https://github.com/JeremyHennessy/Relight/pull/5)
- [PR #6 — first-session missions, stronger saving, and CI verification](https://github.com/JeremyHennessy/Relight/pull/6)

All development PRs remain **draft and unmerged** until verified engine/device results justify approval. No ads, purchases, analytics SDK or store credentials are present.

## Commercial discipline
Relight is designed to support optional rewarded ads, modest purchases and authentic playable acquisition creatives **after** independent retention testing. Paid acquisition will only be considered when measured net lifetime revenue supports it. Profitability is not assumed.
