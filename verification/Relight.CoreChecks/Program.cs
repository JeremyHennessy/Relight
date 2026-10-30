using System;
using Relight;

internal static class Program
{
    private static int assertions;

    private static void Check(bool condition, string description)
    {
        assertions++;
        if (!condition) throw new Exception("FAILED: " + description);
        Console.WriteLine("PASS " + description);
    }

    private static void Equal(double actual, double expected, string description, double tolerance = 1e-8)
    {
        Check(Math.Abs(actual - expected) <= tolerance, description +
            " (got " + actual.ToString("0.###") + ", expected " + expected.ToString("0.###") + ")");
    }

    private static void Main()
    {
        var baseGame = new WorldModel(WorldState.NewWorld());
        Check(baseGame.Connected()[11] && baseGame.Connected()[14], "starter machines connected");
        Check(baseGame.CalculateRates().ScrapPerSecond > 0, "starter resource production");
        Check(baseGame.CalculateRates().RestorationPerSecond > 0, "starter restoration production");
        baseGame.Tick(10);
        Check(baseGame.State.Restoration > 0, "time produces restoration");

        var failures = new WorldModel(WorldState.NewWorld());
        Check(!failures.Place(12, Machine.Extractor), "cannot overwrite core");
        Check(!failures.Place(0, Machine.Core), "cannot create another core");
        Check(!failures.Place(0, (Machine)999),
            "unknown machine types cannot enter saved game state");
        var damagedClock = WorldState.NewWorld();
        damagedClock.TotalPlayedSeconds = double.NaN;
        Check(!WorldModel.Validate(damagedClock), "NaN play duration rejected");
        var futureClock = WorldState.NewWorld();
        futureClock.SavedAtUnix = -1;
        Check(!WorldModel.Validate(futureClock), "negative timestamps rejected");
        failures.State.Scrap = 0;
        Check(!failures.Place(0, Machine.Generator), "cannot buy without scrap");

        var disconnected = WorldState.NewWorld();
        disconnected.Cells[11] = (int)Machine.Empty;
        disconnected.Cells[14] = (int)Machine.Empty;
        disconnected.Cells[0] = (int)Machine.Extractor;
        var isolated = new WorldModel(disconnected);
        isolated.Tick(100);
        Equal(isolated.State.Scrap, 30, "disconnected machines yield nothing");

        var clock = WorldState.NewWorld();
        clock.SavedAtUnix = 100;
        var offline = new WorldModel(clock);
        Equal(offline.ApplyOffline(100 + WorldModel.OfflineCapSeconds + 10000),
            WorldModel.OfflineCapSeconds, "offline production limited to eight hours");
        Equal(offline.State.TotalPlayedSeconds, WorldModel.OfflineCapSeconds,
            "offline elapsed time counted once");
        Equal(offline.ApplyOffline(100 + WorldModel.OfflineCapSeconds + 10000),
            0, "reloading at same timestamp gives no repeat earnings");

        var broken = WorldState.NewWorld();
        broken.Cells[12] = 0;
        Check(new WorldModel(broken).State.Cells[12] == (int)Machine.Core,
            "invalid saves rejected");

        var region = WorldState.NewWorld();
        region.Restoration = 99;
        var progression = new WorldModel(region);
        progression.Tick(10);
        Check(progression.IsRegionReady, "restoration fills a claimable milestone");
        Check(progression.State.Region == 0, "milestone never silently skips player decisions");
        Check(progression.ClaimRegion(), "player can revive the ready region for free");
        Check(progression.State.Region == 1, "claim advances precisely one region");
        Check(!progression.ClaimRegion(), "unearned second region cannot be claimed");

        var upgrade = new WorldModel(WorldState.NewWorld());
        int capacity = upgrade.PowerCapacity();
        Check(upgrade.Upgrade(false), "can purchase first power upgrade");
        Check(upgrade.PowerCapacity() == capacity + 1, "power upgrade increases capacity");

        var relay = new WorldModel(WorldState.NewWorld());
        double before = relay.CalculateRates().ScrapPerSecond;
        Check(relay.Place(10, Machine.Relay), "can add relay adjacent to mine");
        Check(relay.CalculateRates().ScrapPerSecond > before, "relay improves mine");

        var generator = new WorldModel(WorldState.NewWorld());
        double restoreRate = generator.CalculateRates().RestorationPerSecond;
        Check(generator.Place(19, Machine.Generator), "can build adjacent generator");
        Check(generator.CalculateRates().RestorationPerSecond > restoreRate,
            "adjacent generator improves restoration");

        var throttled = new WorldModel(WorldState.NewWorld());
        Check(throttled.Place(7, Machine.Extractor), "can add third consumer");
        var rates = throttled.CalculateRates();
        Check(rates.ConnectedConsumers == 3, "three consumers connected");
        Equal(rates.PowerFraction, 2.0 / 3.0, "power fairly distributed");

        var recovery = new WorldModel(WorldState.NewWorld());
        recovery.State.Region = 4;
        recovery.State.ExtractorLevel = 3;
        recovery.State.Restoration = 25;
        recovery.Place(11, Machine.Empty);
        recovery.ResetGrid();
        Check(recovery.State.Cells[11] == (int)Machine.Extractor, "repair restores base grid");
        Check(recovery.State.Region == 4 && recovery.State.ExtractorLevel == 3 &&
            recovery.State.Restoration == 25, "repair preserves permanent progress");

        var tutorial = new WorldModel(WorldState.NewWorld());
        Check(tutorial.GetFirstSessionGoal() == FirstSessionGoal.ImproveRestoration,
            "first goal is to boost the recovery system");
        Check(tutorial.SuggestedFirstSessionTile() == 19,
            "first guidance highlights a valid position next to LIFE");
        Check(tutorial.Place(19, Machine.Generator), "guided generator purchase succeeds");
        Check(tutorial.GetFirstSessionGoal() == FirstSessionGoal.ExpandProduction,
            "mission advances after restoration is boosted");
        Check(tutorial.Place(7, Machine.Extractor), "guided extractor purchase succeeds");
        Check(tutorial.GetFirstSessionGoal() == FirstSessionGoal.RestoreFirstRegion,
            "mission advances after mining expands");
        tutorial.Tick(150);
        Check(tutorial.IsRegionReady, "first region becomes ready after restoration");
        Check(tutorial.ClaimRegion(), "first region claim succeeds");
        Check(tutorial.GetFirstSessionGoal() == FirstSessionGoal.ContinueExploring,
            "mission completes once the player revives the region");

        var compact = NetworkLayout.Calculate(400, 300);
        Check(compact.Valid, "compact portrait panel has valid network geometry");
        Equal(compact.TotalContentWidth, compact.Size, "grid cells fit exactly in square panel");
        Check(compact.Size <= 284 && compact.Size <= 384,
            "network geometry keeps margins on compact displays");
        Check(compact.CellSize >= 44,
            "compact network cells retain usable target dimensions");
        var wide = NetworkLayout.Calculate(1300, 900);
        Equal(wide.Size, 800, "network graphics cap at 800 reference units");
        Check(!NetworkLayout.Calculate(0, 900).Valid, "zero-width geometry is rejected");
        Check(!NetworkLayout.Calculate(double.NaN, 900).Valid,
            "nonfinite geometry input is rejected");

        var unattendedWorld = WorldState.NewWorld();
        unattendedWorld.SavedAtUnix = 100;
        var unattended = new WorldModel(unattendedWorld);
        unattended.ApplyOffline(100 + WorldModel.OfflineCapSeconds);
        Check(unattended.State.Region == 0,
            "eight hours offline cannot auto-complete multiple regions");
        Check(unattended.IsRegionReady,
            "eight hours offline can prepare exactly one region to claim");
        double spareScrap = unattended.State.Scrap;
        unattended.Tick(100);
        Check(unattended.State.Scrap > spareScrap,
            "mining continues while a region is ready");
        Check(unattended.State.Restoration == WorldModel.TargetForRegion(0),
            "completed region does not consume further restoration resources");
        Check(unattended.ClaimRegion() && !unattended.ClaimRegion(),
            "offline milestone is claimed only once before new work");
        Console.WriteLine("PACING RESULT: one free, claimable region after eight hours offline.");

        var random = new Random(2841);
        var sandbox = new WorldModel(WorldState.NewWorld());
        for (int step = 0; step < 1000; step++)
        {
            int operation = random.Next(6);
            int index = random.Next(25);
            if (operation < 4) sandbox.Place(index, (Machine)(operation + 2));
            else if (operation == 4) sandbox.Place(index, Machine.Empty);
            else sandbox.Upgrade(random.Next(2) == 0);
            sandbox.Tick(random.NextDouble() * 5);
            if (!WorldModel.Validate(sandbox.State))
                throw new Exception("World state invalid at stress step " + step);
        }
        Check(true, "1000 randomized build and tick operations preserve valid state");

        Console.WriteLine("ALL CORE CHECKS PASSED (" + assertions + " assertions)");
    }
}
