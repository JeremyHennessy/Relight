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

        public void Tick(double seconds)
        {
            if (seconds <= 0 || double.IsNaN(seconds) || double.IsInfinity(seconds)) return;
            seconds = Math.Min(seconds, OfflineCapSeconds);
            var connected = Connected();
            int capacity = PowerCapacity(), extractors = 0, restorers = 0;
            for (int i = 0; i < connected.Length && capacity > 0; i++)
            {
                if (!connected[i]) continue;
                if (State.Cells[i] == (int)Machine.Extractor) { extractors++; capacity--; }
                if (State.Cells[i] == (int)Machine.Restorer) { restorers++; capacity--; }
            }
            State.Scrap += seconds * extractors * (1.0 + State.ExtractorLevel * 0.5);
            // Restoration consumes scrap, so building a balanced network matters.
            double used = Math.Min(State.Scrap, seconds * restorers * 0.7);
            State.Scrap -= used;
            State.Restoration += used;
            State.TotalPlayedSeconds += seconds;
            while (State.Restoration >= TargetForRegion(State.Region))
            {
                State.Restoration -= TargetForRegion(State.Region);
                State.Region++;
                State.Scrap += 40 + State.Region * 10;
                LastMessage = "Region restored! New territory discovered.";
            }
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
