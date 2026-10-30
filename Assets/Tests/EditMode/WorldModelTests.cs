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
            Assert.AreEqual(1, game.State.Region);
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
