using System;
using System.Collections.Generic;

namespace Relight
{
    public enum Machine { Empty = 0, Core = 1, Relay = 2, Extractor = 3, Restorer = 4, Generator = 5 }

    [Serializable]
    public sealed class WorldState
    {
        public int[] Cells = new int[25];
        public double Scrap = 30;
        public double Restoration;
        public int Region;
        public int ExtractorLevel;
        public int PowerLevel;
        public long SavedAtUnix;
        public double TotalPlayedSeconds;

        public static WorldState NewWorld()
        {
            var state = new WorldState();
            state.Cells[12] = (int)Machine.Core;
            state.Cells[11] = (int)Machine.Extractor;
            state.Cells[13] = (int)Machine.Relay;
            state.Cells[14] = (int)Machine.Restorer;
            return state;
        }
    }

    public enum FirstSessionGoal
    {
        ImproveRestoration = 0,
        ExpandProduction = 1,
        RestoreFirstRegion = 2,
        ContinueExploring = 3
    }

    public sealed class WorldModel
    {
        public const int Width = 5;
        public const int Height = 5;
        public const int OfflineCapSeconds = 8 * 60 * 60;
        public WorldState State { get; private set; }
        public string LastMessage { get; private set; } = "Reconnect the world.";

        public WorldModel(WorldState state)
        {
            State = Validate(state) ? state : WorldState.NewWorld();
        }

        public static bool Validate(WorldState state)
        {
            if (state == null || state.Cells == null || state.Cells.Length != Width * Height) return false;
            if (state.Cells[12] != (int)Machine.Core) return false;
            if (double.IsNaN(state.Scrap) || double.IsInfinity(state.Scrap) || state.Scrap < 0) return false;
            if (double.IsNaN(state.Restoration) || double.IsInfinity(state.Restoration) || state.Restoration < 0) return false;
            if (state.Region < 0 || state.ExtractorLevel < 0 || state.PowerLevel < 0) return false;
            if (state.SavedAtUnix < 0 ||
                double.IsNaN(state.TotalPlayedSeconds) ||
                double.IsInfinity(state.TotalPlayedSeconds) ||
                state.TotalPlayedSeconds < 0) return false;
            foreach (int cell in state.Cells)
                if (cell < 0 || cell > (int)Machine.Generator) return false;
            return true;
        }

        public static double Cost(Machine machine)
        {
            switch (machine)
            {
                case Machine.Relay: return 4;
                case Machine.Extractor: return 12;
                case Machine.Restorer: return 18;
                case Machine.Generator: return 15;
                default: return 0;
            }
        }

        public double UpgradeCost(bool extractor)
        {
            int level = extractor ? State.ExtractorLevel : State.PowerLevel;
            return Math.Floor(20 * Math.Pow(1.8, Math.Min(level, 40)));
        }

        public bool Upgrade(bool extractor)
        {
            double cost = UpgradeCost(extractor);
            if (State.Scrap < cost) { LastMessage = "Not enough scrap."; return false; }
            State.Scrap -= cost;
            if (extractor) State.ExtractorLevel++; else State.PowerLevel++;
            LastMessage = extractor ? "Mining efficiency increased." : "Power capacity increased.";
            return true;
        }

        public bool Place(int index, Machine machine)
        {
            if (index < 0 || index >= State.Cells.Length || index == 12) return false;
            if (machine < Machine.Empty || machine > Machine.Generator) return false;
            if (machine == Machine.Core) return false;
            if (machine == Machine.Empty)
            {
                if (State.Cells[index] == (int)Machine.Empty) return false;
                State.Cells[index] = (int)Machine.Empty;
                LastMessage = "Structure removed. No scrap refunded.";
                return true;
            }
            if (State.Cells[index] != (int)Machine.Empty) { LastMessage = "Remove the old structure first."; return false; }
            double cost = Cost(machine);
            if (State.Scrap < cost) { LastMessage = "Not enough scrap."; return false; }
            State.Scrap -= cost;
            State.Cells[index] = (int)machine;
            LastMessage = machine + " constructed.";
            return true;
        }

        public bool[] Connected()
        {
            var connected = new bool[Width * Height];
            var queue = new Queue<int>();
            queue.Enqueue(12);
            connected[12] = true;
            while (queue.Count > 0)
            {
                int i = queue.Dequeue();
                int x = i % Width, y = i / Width;
                if (x > 0) Visit(i - 1);
                if (x < Width - 1) Visit(i + 1);
                if (y > 0) Visit(i - Width);
                if (y < Height - 1) Visit(i + Width);
            }
            return connected;

            void Visit(int i)
            {
                if (connected[i] || State.Cells[i] == (int)Machine.Empty) return;
                connected[i] = true;
                queue.Enqueue(i);
            }
        }

        public int PowerCapacity()
        {
            var connected = Connected();
            int generators = 0;
            for (int i = 0; i < connected.Length; i++)
                if (connected[i] && State.Cells[i] == (int)Machine.Generator) generators++;
            return 2 + generators * 2 + State.PowerLevel;
        }

        public int ActiveConsumers()
        {
            var connected = Connected();
            int count = 0;
            for (int i = 0; i < connected.Length; i++)
                if (connected[i] && (State.Cells[i] == (int)Machine.Extractor || State.Cells[i] == (int)Machine.Restorer)) count++;
            return count;
        }

        /// <summary>
        /// A non-blocking first-session guide. Derived entirely from the saved
        /// world so it requires no extra tutorial state or forced button presses.
        /// </summary>
        public FirstSessionGoal GetFirstSessionGoal()
        {
            if (State.Region > 0) return FirstSessionGoal.ContinueExploring;
            bool[] connected = Connected();
            int poweredExtractors = 0;
            bool boostedRestorer = false;
            for (int i = 0; i < State.Cells.Length; i++)
            {
                if (!connected[i]) continue;
                if (State.Cells[i] == (int)Machine.Extractor) poweredExtractors++;
                if (State.Cells[i] == (int)Machine.Restorer &&
                    Adjacent(i, Machine.Generator, connected) > 0)
                    boostedRestorer = true;
            }
            if (!boostedRestorer) return FirstSessionGoal.ImproveRestoration;
            if (poweredExtractors < 2) return FirstSessionGoal.ExpandProduction;
            return FirstSessionGoal.RestoreFirstRegion;
        }

        public int SuggestedFirstSessionTile()
        {
            var goal = GetFirstSessionGoal();
            if (goal == FirstSessionGoal.ImproveRestoration)
            {
                // The default LIFE machine is at 14. Any adjacent generator
                // works; suggest one good option rather than forcing placement.
                int[] candidates = { 19, 9, 13 };
                foreach (int i in candidates)
                    if (State.Cells[i] == (int)Machine.Empty) return i;
            }
            if (goal == FirstSessionGoal.ExpandProduction)
            {
                int[] candidates = { 7, 17, 10, 16 };
                bool[] connected = Connected();
                foreach (int i in candidates)
                {
                    if (State.Cells[i] != (int)Machine.Empty) continue;
                    int x = i % Width, y = i / Width;
                    if ((x > 0 && connected[i - 1]) ||
                        (x < Width - 1 && connected[i + 1]) ||
                        (y > 0 && connected[i - Width]) ||
                        (y < Height - 1 && connected[i + Width])) return i;
                }
            }
            return -1;
        }

        public struct ProductionRates
        {
            public double ScrapPerSecond;
            public double ScrapUsedPerSecond;
            public double RestorationPerSecond;
            public int ConnectedConsumers;
            public int PowerCapacity;
            public double PowerFraction;
        }

        /// <summary>
        /// All connected consumers share limited power fairly. Machine positioning
        /// matters: relays boost adjacent mines and generators boost restorers.
        /// </summary>
        public ProductionRates CalculateRates()
        {
            var connected = Connected();
            var rates = new ProductionRates { PowerCapacity = PowerCapacity() };
            for (int i = 0; i < connected.Length; i++)
            {
                if (!connected[i]) continue;
                if (State.Cells[i] == (int)Machine.Extractor || State.Cells[i] == (int)Machine.Restorer)
                    rates.ConnectedConsumers++;
            }
            rates.PowerFraction = rates.ConnectedConsumers == 0 ? 1 :
                Math.Min(1.0, (double)rates.PowerCapacity / rates.ConnectedConsumers);

            for (int i = 0; i < connected.Length; i++)
            {
                if (!connected[i]) continue;
                var machine = (Machine)State.Cells[i];
                if (machine == Machine.Extractor)
                {
                    int nearbyRelays = Math.Min(2, Adjacent(i, Machine.Relay, connected));
                    rates.ScrapPerSecond += (1 + State.ExtractorLevel * .5) *
                        (1 + nearbyRelays * .25) * rates.PowerFraction;
                }
                else if (machine == Machine.Restorer)
                {
                    int nearbyGenerators = Math.Min(2, Adjacent(i, Machine.Generator, connected));
                    rates.ScrapUsedPerSecond += .7 * rates.PowerFraction;
                    rates.RestorationPerSecond += .7 * (1 + nearbyGenerators * .2) * rates.PowerFraction;
                }
            }
            return rates;
        }

        private int Adjacent(int index, Machine machine, bool[] connected)
        {
            int x = index % Width, y = index / Width, count = 0;
            if (x > 0 && connected[index - 1] && State.Cells[index - 1] == (int)machine) count++;
            if (x < Width - 1 && connected[index + 1] && State.Cells[index + 1] == (int)machine) count++;
            if (y > 0 && connected[index - Width] && State.Cells[index - Width] == (int)machine) count++;
            if (y < Height - 1 && connected[index + Width] && State.Cells[index + Width] == (int)machine) count++;
            return count;
        }

        public void ResetGrid()
        {
            // Emergency recovery: players can never permanently softlock themselves.
            // Preserve all long-term progress; purchased structures are not refunded.
            State.Cells = WorldState.NewWorld().Cells;
            LastMessage = "Network repaired. Progress preserved.";
        }

        public bool IsRegionReady => State.Restoration >= TargetForRegion(State.Region);

        /// <summary>
        /// A region is a meaningful player-facing milestone, not a silent timer.
        /// The player can claim this milestone for free; no ads or purchase gate.
        /// At most one region can become ready while the game is unattended.
        /// </summary>
        public bool ClaimRegion()
        {
            if (!IsRegionReady)
            {
                LastMessage = "This region needs more restoration.";
                return false;
            }
            State.Restoration = 0;
            State.Region++;
            State.Scrap += 40 + State.Region * 10;
            LastMessage = "Region revived! New territory discovered.";
            return true;
        }

        public void Tick(double seconds)
        {
            if (seconds <= 0 || double.IsNaN(seconds) || double.IsInfinity(seconds)) return;
            seconds = Math.Min(seconds, OfflineCapSeconds);
            var rates = CalculateRates();
            State.Scrap += seconds * rates.ScrapPerSecond;

            // Let miners work while a completed region awaits activation, but
            // stop consuming restoration materials when the region is ready.
            // This preserves both resources and the intended return-session gate.
            double room = Math.Max(0, TargetForRegion(State.Region) - State.Restoration);
            double desiredRestoration = Math.Min(room, seconds * rates.RestorationPerSecond);
            if (desiredRestoration > 0 && rates.RestorationPerSecond > 0)
            {
                double requiredScrap = desiredRestoration *
                    rates.ScrapUsedPerSecond / rates.RestorationPerSecond;
                if (requiredScrap > 0)
                {
                    double usedScrap = Math.Min(State.Scrap, requiredScrap);
                    State.Scrap -= usedScrap;
                    State.Restoration += desiredRestoration * (usedScrap / requiredScrap);
                }
            }
            State.TotalPlayedSeconds += seconds;
        }

        public static double TargetForRegion(int region) => 100.0 * (1 + region * 0.5);

        public double ApplyOffline(long nowUnixSeconds)
        {
            long elapsed = Math.Max(0, nowUnixSeconds - State.SavedAtUnix);
            if (State.SavedAtUnix <= 0) elapsed = 0;
            double applied = Math.Min(elapsed, OfflineCapSeconds);
            Tick(applied);
            State.SavedAtUnix = nowUnixSeconds;
            return applied;
        }
    }
}
