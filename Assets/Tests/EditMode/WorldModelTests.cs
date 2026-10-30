using NUnit.Framework;

namespace Relight.Tests
{
    public sealed class WorldModelTests
    {
        [Test]
        public void StarterWorldHasConnectedProduction()
        {
            var game = new WorldModel(WorldState.NewWorld());
            var connected = game.Connected();
            Assert.IsTrue(connected[11]);
            Assert.IsTrue(connected[14]);
            game.Tick(10);
            Assert.Greater(game.State.Restoration, 0);
        }

        [Test]
        public void CannotReplaceCoreOrBuyUnaffordableMachine()
        {
            var game = new WorldModel(WorldState.NewWorld());
            Assert.IsFalse(game.Place(12, Machine.Extractor));
            Assert.IsFalse(game.Place(0, Machine.Core));
            game.State.Scrap = 0;
            Assert.IsFalse(game.Place(0, Machine.Generator));
        }

        [Test]
        public void DisconnectedExtractorDoesNotProduce()
        {
            var state = WorldState.NewWorld();
            state.Cells[11] = (int)Machine.Empty;
            state.Cells[14] = (int)Machine.Empty;
            state.Cells[0] = (int)Machine.Extractor;
            var game = new WorldModel(state);
            game.Tick(100);
            Assert.AreEqual(30, game.State.Scrap, 0.001);
        }

        [Test]
        public void OfflineEarningsAreCappedAtEightHours()
        {
            var state = WorldState.NewWorld();
            state.SavedAtUnix = 100;
            var game = new WorldModel(state);
            double applied = game.ApplyOffline(100 + WorldModel.OfflineCapSeconds + 10000);
            Assert.AreEqual(WorldModel.OfflineCapSeconds, applied);
            Assert.AreEqual(WorldModel.OfflineCapSeconds, game.State.TotalPlayedSeconds, 0.001);
        }

        [Test]
        public void CorruptTimestampsAndUnknownMachinesAreRejected()
        {
            var game = new WorldModel(WorldState.NewWorld());
            Assert.IsFalse(game.Place(0, (Machine)999));
            var state = WorldState.NewWorld();
            state.TotalPlayedSeconds = double.NaN;
            Assert.IsFalse(WorldModel.Validate(state));
            state = WorldState.NewWorld();
            state.SavedAtUnix = -1;
            Assert.IsFalse(WorldModel.Validate(state));
        }

        [Test]
        public void InvalidSaveFallsBackToFreshWorld()
        {
            var state = WorldState.NewWorld();
            state.Cells[12] = 0;
            var game = new WorldModel(state);
            Assert.AreEqual((int)Machine.Core, game.State.Cells[12]);
        }

        [Test]
        public void RestorationUnlocksNextRegion()
        {
            var state = WorldState.NewWorld();
            state.Restoration = 99;
            var game = new WorldModel(state);
            game.Tick(10);
            Assert.IsTrue(game.IsRegionReady);
            Assert.AreEqual(0, game.State.Region);
            Assert.IsTrue(game.ClaimRegion());
            Assert.AreEqual(1, game.State.Region);
            Assert.IsFalse(game.ClaimRegion());
        }

        [Test]
        public void AdjacentRelayImprovesMiningOutput()
        {
            var game = new WorldModel(WorldState.NewWorld());
            double before = game.CalculateRates().ScrapPerSecond;
            Assert.IsTrue(game.Place(10, Machine.Relay));
            Assert.Greater(game.CalculateRates().ScrapPerSecond, before);
        }

        [Test]
        public void AdjacentGeneratorImprovesRestorationOutput()
        {
            var game = new WorldModel(WorldState.NewWorld());
            double before = game.CalculateRates().RestorationPerSecond;
            Assert.IsTrue(game.Place(19, Machine.Generator));
            Assert.Greater(game.CalculateRates().RestorationPerSecond, before);
        }

        [Test]
        public void LimitedPowerThrottlesAllConsumersFairly()
        {
            var game = new WorldModel(WorldState.NewWorld());
            Assert.IsTrue(game.Place(7, Machine.Extractor));
            var rates = game.CalculateRates();
            Assert.AreEqual(3, rates.ConnectedConsumers);
            Assert.AreEqual(2.0 / 3.0, rates.PowerFraction, 0.0001);
            Assert.Greater(rates.ScrapPerSecond, 0);
            Assert.Greater(rates.RestorationPerSecond, 0);
        }

        [Test]
        public void EmergencyRepairPreservesLongTermProgress()
        {
            var game = new WorldModel(WorldState.NewWorld());
            game.State.Region = 4;
            game.State.ExtractorLevel = 3;
            game.State.Restoration = 25;
            game.Place(11, Machine.Empty);
            game.ResetGrid();
            Assert.AreEqual((int)Machine.Extractor, game.State.Cells[11]);
            Assert.AreEqual(4, game.State.Region);
            Assert.AreEqual(3, game.State.ExtractorLevel);
            Assert.AreEqual(25, game.State.Restoration, 0.001);
        }

        [Test]
        public void NetworkGeometryFitsCompactPortraitPanel()
        {
            var geometry = NetworkLayout.Calculate(400, 300);
            Assert.IsTrue(geometry.Valid);
            Assert.AreEqual(geometry.Size, geometry.TotalContentWidth, 0.0001);
            Assert.LessOrEqual(geometry.Size, 284);
            Assert.GreaterOrEqual(geometry.CellSize, 44);
            Assert.IsFalse(NetworkLayout.Calculate(double.NaN, 300).Valid);
        }

        [Test]
        public void FirstSessionGuidesPlayerWithoutForcedActions()
        {
            var game = new WorldModel(WorldState.NewWorld());
            Assert.AreEqual(FirstSessionGoal.ImproveRestoration, game.GetFirstSessionGoal());
            Assert.AreEqual(19, game.SuggestedFirstSessionTile());
            Assert.IsTrue(game.Place(19, Machine.Generator));
            Assert.AreEqual(FirstSessionGoal.ExpandProduction, game.GetFirstSessionGoal());
            Assert.IsTrue(game.Place(7, Machine.Extractor));
            Assert.AreEqual(FirstSessionGoal.RestoreFirstRegion, game.GetFirstSessionGoal());
            game.Tick(150);
            Assert.IsTrue(game.IsRegionReady);
            Assert.IsTrue(game.ClaimRegion());
            Assert.AreEqual(FirstSessionGoal.ContinueExploring, game.GetFirstSessionGoal());
        }

        [Test]
        public void OfflineReturnPreparesOnlyOneClaimableMilestone()
        {
            var state = WorldState.NewWorld();
            state.SavedAtUnix = 100;
            var game = new WorldModel(state);
            game.ApplyOffline(100 + WorldModel.OfflineCapSeconds);
            Assert.AreEqual(0, game.State.Region);
            Assert.IsTrue(game.IsRegionReady);
            Assert.AreEqual(WorldModel.TargetForRegion(0), game.State.Restoration, 0.001);

            double before = game.State.Scrap;
            game.Tick(100);
            Assert.Greater(game.State.Scrap, before);
            Assert.AreEqual(WorldModel.TargetForRegion(0), game.State.Restoration, 0.001);
            Assert.IsTrue(game.ClaimRegion());
            Assert.IsFalse(game.ClaimRegion());
            Assert.AreEqual(1, game.State.Region);
        }

        [Test]
        public void OfflineScrapStorageIsCappedButRestorationContinues()
        {
            var eightHours = WorldState.NewWorld();
            eightHours.SavedAtUnix = 100;
            var offline = new WorldModel(eightHours);
            double miningRate = offline.CalculateRates().ScrapPerSecond;
            offline.ApplyOffline(100 + WorldModel.OfflineCapSeconds);

            Assert.AreEqual(30 + miningRate * WorldModel.OfflineScrapProductionCapSeconds -
                WorldModel.TargetForRegion(0), offline.State.Scrap, 0.001);
            Assert.IsTrue(offline.IsRegionReady);
            Assert.AreEqual(0, offline.State.Region);
            Assert.AreEqual(WorldModel.OfflineCapSeconds, offline.State.TotalPlayedSeconds, 0.001);

            var active = new WorldModel(WorldState.NewWorld());
            active.Tick(WorldModel.OfflineCapSeconds);
            Assert.Greater(active.State.Scrap, offline.State.Scrap);
        }

        [Test]
        public void PowerUpgradeIncreasesCapacity()
        {
            var game = new WorldModel(WorldState.NewWorld());
            int before = game.PowerCapacity();
            Assert.IsTrue(game.Upgrade(false));
            Assert.AreEqual(before + 1, game.PowerCapacity());
        }
    }
}
