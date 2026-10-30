# Relight pacing decision — October 30, 2026

## Problem observed (confirmed, previous behavior)

The first overnight-gameplay diagnostic at commit `be324611a854aba65e0f291b21acfd96b8e98236` used the **actual game model** in a standalone .NET run. A newly created world, left for eight simulated hours with its default connected mine and restoration machinery, completed **26 regions without another player decision**.

Evidence: [GitHub Actions run 41092349731](https://github.com/JeremyHennessy/Relight/actions/runs/41092349731) includes the exact `PACING DIAGNOSTIC` output.

This would bypass many restoration rewards, obscure the transition between planets, and give players little reason to engage with each completed region. The gameplay model's number is verified; the business impact remains a design hypothesis until player testing.

## Intervention (implemented as source, not yet verified in Unity)

- The `WorldModel` now fills the current region's restoration meter to its target and **stops there**.
- A player can select **REVIVE** to claim that completed region *for free*, receive the region bonus, and start the next milestone.
- An unattended return may prepare **one** claimable region, but it cannot automatically complete a chain of regions.
- While a region waits, connected mines still earn scrap. Restoration machinery stops burning scrap once its region is ready.
- Neither an advertisement nor a purchase is required to claim a region.
- The first-session objective switches to the visible REVIVE action when a region becomes ready.

## Verified standalone results

At commit `5cdefaa383a84eb89dafd0f73ceb82c90b18ecf6`, [GitHub Actions run 41093000454](https://github.com/JeremyHennessy/Relight/actions/runs/41093000454) recorded **56 passing gameplay/layout assertions** and parsed all 8 Unity C# files with zero syntax errors.

The checks included:
- Eight hours of offline time leaves the current region ready, with **zero silent region completions**.
- Claiming this milestone advances exactly once; a second claim is rejected until new restoration work occurs.
- Mining still accrues while the current region is ready.
- A completed region consumes no additional restoration scrap.
- The starter grant pays for both guided construction steps (POWER + MINE) without watching ads or waiting for income.
- After those two builds, a first claimable milestone can be reached in **120 seconds of simulated gameplay**.

This is source/logic evidence, **not** evidence of real-player onboarding time, actual visual quality, or mobile-device stability.

## Risks and follow-up

- Eight hours of unattended mining still accumulates a substantial amount of scrap. That remains an **unbalanced economy risk**, not a resolved issue; evaluate upgrade cost curves and retention data before finalizing this mechanic.
- Manually claiming each region could become tedious at scale. Consider automatic claiming after the first few regions or batch-revival upgrades **only after** players validate the early milestone experience.
- The UI's REVIVE control, transitions and saved progress have not been tested in an actual Unity runtime. This is a blocking verification gate.
- Do not present either the original 26-region baseline or the 120-second core simulation as an observed player metric.
- Do not monetize the revive action.

## Pending verification steps

1. Unity 6000.1.9f1 import and 17 EditMode tests.
2. Android development APK and physical portrait-device test.
3. Validate the REVIVE button at 100%, repeat claims, pause/resume and save recovery.
4. Verify that the new region has a visible, satisfying transition.
5. Observe first-session completion and return behavior from independent testers.

The current feature is reviewed through a **draft PR**, not merged into `main`.
