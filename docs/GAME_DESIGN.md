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
Build generators and relay connections -> power extractors -> earn scrap -> power restorers -> restore regions -> receive unlock bonuses -> reinvest in networks.

## First vertical slice (implemented as source, unverified in Unity)
- 5x5 grid, central power core, adjacency-based connectivity.
- Five build actions: relay, extractor, restorer, generator, remove.
- Capacity-constrained production, scrap consumption for restoration.
- Mining and power upgrades, increasing region restoration targets.
- JSON save via PlayerPrefs, capped offline progress, portrait UI.
- All graphics currently placeholder UI; no audio or effects.

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

## Progression test gates
- New player can understand the first connection within 30 seconds.
- First visible restoration within 2 minutes.
- 5 minutes produces a meaningful choice, not just waiting.
- Device testing confirms no save loss on pause/restart/offline clock changes.
- Independent testers demonstrate return behavior before buying installs.

## Scope boundary
This repo is new and separate from other games. Do not refactor or modify other projects. Do not claim store readiness from source code alone. Changes go through feature branches, with a recorded build/test result before merge.
