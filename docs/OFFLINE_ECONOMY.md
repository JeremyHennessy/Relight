# Relight — offline economy experiment (2026-10-30)

## Objective
Protect the game's upgrade and world-restoration pacing without making players lose earned progress or hiding a currency reduction behind an advertisement. The 30-minute cap is an **unapproved experimental balance value** pending actual Unity and player feedback.

## Evidence and baseline
Review of the current starter world model established:
- One connected starter mine extracts 1 scrap/second.
- One connected restorer requires 100 scrap to prepare region 1.
- Region 1 awaits a **free REVIVE claim** once prepared.
- With no cap on passive extraction, eight hours (28,800 seconds) yields an expected **28,730 scrap** balance: 30 starting scrap + 28,800 produced − 100 used by the restorer.
- The prior source-only diagnostic explicitly documented that offline extraction generated excessive resources: `docs/PACING_EVIDENCE.md`.

These values are derived from the actual C# gameplay rules; they are **not observed mobile play sessions**.

## Experimental change
- Offline elapsed progression remains capped at **8 hours**, including time credit.
- New scrap extracted offline is limited to **30 minutes of production** (1,800 seconds) at the current network rate.
- Existing scrap is never discarded by the cap.
- Restoration still processes during the elapsed offline window (up to the current region target) and pays its usual scrap cost.
- Once a region is ready, no more restoration scrap is consumed.
- `Tick` used for active gameplay retains its original resource rates, with no storage cap.
- `ClaimRegion` stays free; this change adds no ads and no purchases.

### Expected starter outcomes

| Scenario | Expected starter scrap | Claimable region |
| --- | ---: | --- |
| 8 h active simulation | 28,730 | Yes |
| 1 h offline | 1,730 | Yes |
| 8 h offline after cap | 1,730 | Yes |

The equality of 1 h and 8 h offline stored resources is deliberate because both exceed the 30-minute storage allowance. Restoration progress remains earned; no regions are silently completed.

## Verification plan
1. Standalone actual-core C# verification must compile and pass assertions for 8 h cap, 1 h equality, unchanged active production, one claimable region, and time credit.
2. Existing randomized gameplay invariant test must still pass.
3. Unity Editor import and **18** EditMode tests must pass; the latest test was added to the source only, not run in Unity yet.
4. Test actual pause/resume and local clock changes on an Android device before approving.
5. Have independent testers evaluate whether 30 minutes is too restrictive. Consider a storage-capacity upgrade or 2 h default if user feedback supports it, but do not add those without evidence.

## Honest product design
Hard offline caps can annoy players, particularly if the app gives no clear indication of the limit. The eventual UX should **display storage capacity and time to full** and should not make players watch an ad just to collect their ordinary output. This UI has **not** been implemented or approved.

**Status:** feature branch, tests authored. Do not merge or claim validated profitability without passing CI and player/device evidence.
