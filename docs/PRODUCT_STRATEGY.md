# Relight — Product Direction & Commercial Design
**Status:** proposed design direction, not market-validated. 2026-10-30.

## 1. Game identity

**Pitch:** An idle strategy game in which you reconnect energy to a dying planet, turn ruins into living ecosystems, and uncover the lost technology of earlier civilizations.

**Tagline:** One spark can bring a world back.

**Player fantasy:** I can rescue something beautiful by solving understandable engineering problems. Every action changes the world I see.

**Genre:** accessible idle/incremental strategy with light spatial optimization, not a passive tapping simulator.

**Audience hypothesis:** adults who enjoy low-pressure strategy, satisfying progression, automation, and idle tower/tycoon games. Validate rather than assume audience demographics.

**Primary differentiator:** the world is the progression bar. Restored landscapes, atmospheric color, water, wildlife, and settlements become visibly richer as the player develops infrastructure.

## 2. The 3 loops

### 10–60 second moment-to-moment
Observe a bottleneck -> choose a structure or upgrade -> connect power -> watch resources flow -> see the world brighten. The player's decision must change a visible rate or visual outcome.

### 5–15 minute session
Restore a region -> unlock a new constraint, machine, or environmental reward -> choose a research path -> automate a production step. Every session should offer one meaningful choice; avoid progress that depends on nonstop tapping.

### 1–14 day metagame
Complete several regions to revive a planet -> uncover a fragment of lost-world history -> earn a permanent blueprint -> start a distinct planet with new constraints. Each planet should create different decisions, not only larger numbers.

## 3. First-world narrative beats
- **Blackout:** only one emergency reactor survives.
- **First Light:** repair a relay and bring a ruined greenhouse online.
- **First Rain:** reroute power to purify water and reveal rivers.
- **Living Circuit:** drones connect multiple restoration sites.
- **The Signal:** the recovered network transmits coordinates to the next world.

The narrative should be communicated mainly through visual changes and short one-line messages. No long forced cutscenes.

## 4. Gameplay economy

### Existing implemented prototype
- 5x5 build grid; power core, relays, mines, restorers, generators.
- Connected power network; limited capacity is shared fairly.
- Scrap extraction; restorers convert scrap into progress.
- Placement synergy: mines next to relays; restorers next to generators.
- Upgrades, capped offline progression, emergency grid repair.
- Procedural planet preview gradually shifts from lifeless to living.

### Next gameplay iteration (not implemented)
- Two resources with distinct purposes: scrap for construction, biocharge for restoration.
- One limited-storage resource to reward sensible return sessions, without punitive timers.
- Three biome objectives: frozen world (thermal energy), arid world (water), storm world (resilience).
- Research with mutually exclusive temporary choices, eventually unlockable via longer play.
- Visual flow animation: moving light pulses along powered connections.
- Dynamic restoration events that are solvable, not random failures.
- A meaningful first prestige: new planet with one permanent blueprint, not a forced total reset.

### Anti-softlock design
- No permanent loss of progress from experimentation.
- Always provide a free emergency recovery path.
- Never sell the ability to undo an accidental tap.
- Save offline, and explain offline caps in UI.

## 5. Visual direction

**Style:** premium minimal sci-fi with a dark navy base, atmospheric cyan, warm amber power, and gradually emerging emerald/blue life. Keep the playfield readable at one-handed phone size.

**Hierarchy:** planet transformation and player objective first; network decisions second; resource/production status third; optional commercial offers last.

**Motion:** 150–300 ms button feedback, slow orbit/parallax, pulsing energy, subtle particle bloom when a region completes. Support reduced-motion settings.

**Audio:** a restrained original synth soundscape; distinct short cues for connecting power, fixing a bottleneck and completing restoration. All sound optional and muteable.

**Accessibility:** minimum touch-target size, readable text scaling, no meaning conveyed by color alone, no forced flashing, contrast review, localization-ready text.

**Performance:** use procedural 2D visuals and pooled particles, not complex 3D. Target smooth rendering on midrange Android and recent iPhone models; verify on real devices.

## 6. Advertising creative designed from gameplay

1. **One move saves the world:** a stalled network, one player-built relay, a large visible restoration burst. 10–15 seconds.
2. **From ash to ocean:** time-lapse of genuine first-planet progression. 15–20 seconds.
3. **Can you fix this circuit?** an interactive mini network puzzle whose rules match the game.

Ads must represent actual reachable gameplay. No fake failure states, fake UI, or misleading rewards.

## 7. Monetization design (hypotheses, not implemented)

**Primary:** optional rewarded ads after a natural decision point (e.g. collect extra offline production, short boost, or optional salvage). Never interrupt the restoration moment with an automatic ad.

**Secondary:** one-time ad-skip purchase, modest starter pack, and purely cosmetic themes. Paid purchases must not be required to complete a world.

**Avoid:** forced early interstitials, manipulative countdowns, paywalled story endings, ads that are mandatory for basic progression, and aggressive notification spam.

Do not add an ad SDK or payment SDK until the first playable has verified retention and store policy/consent requirements are assessed.

## 8. Metrics and decision gates

### Events to instrument (not yet implemented)
- first_open, tutorial_step, first_power_connection, first_extraction, first_restoration
- region_completed, world_completed, upgrade_purchased, save_loaded
- session_start, session_end, offline_collected
- rewarded_ad_offer, rewarded_ad_start, rewarded_ad_complete
- purchase_started, purchase_completed, purchase_failed
- performance_crash and platform/version metadata without collecting unnecessary personal data

### Questions to answer
- Do players understand the first connection within 30 seconds?
- Is the first restoration visible within 2 minutes?
- Do players return the next day because they want to continue?
- Does an optional rewarded ad create value without reducing retention?
- Does measured net 90-day player revenue exceed paid acquisition cost?

### Initial experimental thresholds, not industry guarantees
- Tutorial completion target: >=75%.
- Day-1 retention aspiration: >=35%.
- Day-7 retention aspiration: >=12%.
- Day-30 retention aspiration: >=4%.
- 90-day net revenue / paid CPI: >1.2x before scaling, and model uncertainty explicitly.

Small samples should be treated as directional; do not claim statistical significance from a few testers.

## 9. Delivery gates

**Gate A — technical proof:** Unity imports, scripts compile, EditMode tests pass, Android APK builds, gameplay runs on real device.

**Gate B — emotional proof:** user sees a world transform and finds decisions meaningful; screenshots and gameplay video reviewed before design approval.

**Gate C — retention proof:** independent testers complete tutorial and return over multiple days.

**Gate D — monetization proof:** consent-aware rewarded ads and sandbox purchases function; instrumentation reconciles with platform reporting.

**Gate E — acquisition proof:** limited paid cohorts show sustainable economics with fraud/bot checks and conservative attribution.

**Gate F — store launch:** production signing, privacy disclosures, store screenshots, crash monitoring, TestFlight/Play closed testing and user approval.

No phase is complete merely because source code was committed.

## 10. Boundaries and ownership
- The repository is the source of truth; changes on reviewable feature branches.
- Never commit signing keys, developer credentials or billing secrets.
- Approved visual and gameplay baselines are locked until the user explicitly approves changes.
- Preserve clear separation between game simulation, visuals, analytics and monetization.
- Profit is a goal to measure, not a claim that can be guaranteed by design.
