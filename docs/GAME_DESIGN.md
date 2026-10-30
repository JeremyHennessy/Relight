# RELIGHT — Game Design Document (draft v0.1)

## Product promise
Restore a dormant world through understandable power-network decisions, satisfying visible change, and meaningful offline progression. Portrait, one-thumb mobile experience. No forced ads in the first release.

## Design pillars
1. **Make it come alive:** every restored region should look and behave different.
2. **Solve, don't merely tap:** players route energy, resolve bottlenecks, choose upgrades and manage limited capacity.
3. **Respect the player's time:** progress persists; offline earnings are capped and explained.
4. **Advertise honestly:** ads must show authentic gameplay; purchases never disguise the core loop.
5. **Small-device clarity:** large tap targets, readable contrast, legible numbers and predictable feedback.

## Core loop
Build generators and relay connections -> power extractors -> earn scrap -> power restorers -> fill a region's restoration meter -> **freely REVIVE that region** -> receive unlock bonuses -> reinvest in networks.

## First vertical slice (implemented as source, unverified in Unity)
- 5x5 grid, central power core, adjacency-based connectivity.
- Five build actions: relay, extractor, restorer, generator, remove.
- Fairly shared capacity-constrained production, scrap consumption for restoration.
- Adjacency bonuses for mines next to relays and restorers next to generators.
- Emergency network repair preserving long-term progress.
- Enlarged procedural planet art, visibly recovering over three-region cycles, with four visual biome palettes, clouds and settlement lights.
- Animated energy tracks and travelling pulses between connected structures; decorative graphics do not intercept touch input.
- Grid and energy-overlay dimensions are derived from the same pure, testable responsive layout calculation.
- Non-blocking first-session missions with suggested placements, plus a region-restored celebration.
- A full restoration meter pauses further region auto-advancement; players actively claim REVIVE for free. Offline production may prepare one region without skipping the following ones.
- The correct guided machine is preselected when the next first-session mission begins; build-button labels show each machine's scrap cost.
- Save fallback to a previous valid snapshot when the primary save fails validation.
- Mining and power upgrades, increasing region restoration targets.
- JSON save via PlayerPrefs, capped offline progress, portrait UI.
- The UI remains a prototype with original procedural planet imagery; no audio. All rendering requires real Unity/device validation.

## Pacing evidence

A starter world previously auto-completed 26 regions after 8 simulated offline hours. The current model caps the unattended milestone at one free, player-claimable region. See [PACING_EVIDENCE.md](PACING_EVIDENCE.md) for actual test-run links, remaining economy risks and required Unity tests.

## Intended deeper gameplay (NOT IMPLEMENTED)
- Three biome types with distinct power/resource constraints and visual recovery.
- Environmental incidents as opt-in short puzzles, not random punishment.
- Research branching between efficiency, automation, and resilience.
- Drone automation and second resource tier.
- Discoverable lore through restored sites, without requiring long narrative.
- Prestige between planets, permanent unlocks and cosmetic rewards.
- Accessible color modes, sound, haptics, tutorial, localization.

## Monetization hypothesis (NOT IMPLEMENTED)
- Optional rewarded ads for offline boost or temporary production bonus.
- No forced interstitial ads in launch candidate.
- Purchase options only after gameplay and retention testing.
- Analytics events: first_power, first_build, first_restore, session_end, rewarded_ad_offer, rewarded_ad_complete, purchase_complete.
- Ad mediation, consent, privacy disclosures, attribution and store billing require separate implementation and compliance review.

## Visual-acceptance gates (not yet met)
- Run the actual Unity Editor and install on a portrait Android device.
- Inspect a small-screen phone for grid overflow, touch targets, clipping and text legibility.
- Verify energized routes follow active connected machines and do not obscure buttons.
- Compare procedural planet recovery across at least three restoration milestones.
- Capture screenshots and obtain an approved visual baseline before substantial UI changes.

## Progression test gates
- New player can understand the first connection within 30 seconds.
- First visible restoration within 2 minutes.
- 5 minutes produces a meaningful choice, not just waiting.
- Device testing confirms no save loss on pause/restart/offline clock changes.
- Independent testers demonstrate return behavior before buying installs.

## Scope boundary
This repo is new and separate from other games. Do not refactor or modify other projects. Do not claim store readiness from source code alone. Changes go through feature branches, with a recorded build/test result before merge.
