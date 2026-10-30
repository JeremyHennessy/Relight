using System;

namespace Relight
{
    /// <summary>
    /// Pure, testable sizing calculations for the portrait network panel.
    /// The visual implementation uses these numbers in Unity's RectTransforms.
    /// </summary>
    public struct NetworkGridGeometry
    {
        public double Size;
        public double CellSize;
        public double Spacing;
        public bool Valid;

        public double TotalContentWidth =>
            WorldModel.Width * CellSize + (WorldModel.Width - 1) * Spacing;
    }

    public static class NetworkLayout
    {
        public static NetworkGridGeometry Calculate(double panelWidth, double panelHeight)
        {
            var invalid = new NetworkGridGeometry();
            if (double.IsNaN(panelWidth) || double.IsNaN(panelHeight) ||
                double.IsInfinity(panelWidth) || double.IsInfinity(panelHeight) ||
                panelWidth <= 64 || panelHeight <= 64) return invalid;

            double size = Math.Min(800, Math.Min(panelWidth, panelHeight) - 16);
            if (size < 48) return invalid;
            double spacing = Math.Max(3.0, Math.Min(7.0, size * .011));
            double cell = (size - (WorldModel.Width - 1) * spacing) / WorldModel.Width;
            if (cell <= 0) return invalid;
            return new NetworkGridGeometry
            {
                Size = size,
                CellSize = cell,
                Spacing = spacing,
                Valid = true
            };
        }
    }
}
