using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Relight
{
    /// <summary>
    /// Low-cost, deterministic power-flow visuals for the network.
    /// Decorative UGUI images never intercept touch input. Connections are
    /// rebuilt only when the playfield size changes and are toggled by state.
    /// No per-frame GameObject creation, purchased sprites or shaders required.
    /// </summary>
    public sealed class EnergyNetworkEffects : MonoBehaviour
    {
        private sealed class Link
        {
            public int From;
            public int To;
            public Image Track;
            public Image Pulse;
            public Vector2 Start;
            public Vector2 End;
        }

        private const int GridWidth = WorldModel.Width;
        private const int GridHeight = WorldModel.Height;

        private readonly List<Link> links = new List<Link>(40);
        private RectTransform root;
        private float gridSize = -1f;
        private float cellSize;
        private float spacing;

        private static readonly Color TrackColor = new Color(.13f, .66f, .78f, .36f);
        private static readonly Color PulseColor = new Color(.52f, .98f, .82f, .88f);

        public void Initialize()
        {
            if (root != null) return;

            root = (RectTransform)transform;
            root.anchorMin = root.anchorMax = new Vector2(.5f, .5f);
            root.pivot = new Vector2(.5f, .5f);
            root.anchoredPosition = Vector2.zero;
            root.localRotation = Quaternion.identity;

            for (int y = 0; y < GridHeight; y++)
            {
                for (int x = 0; x < GridWidth; x++)
                {
                    int index = y * GridWidth + x;
                    if (x < GridWidth - 1)
                        CreateLink(index, index + 1);
                    if (y < GridHeight - 1)
                        CreateLink(index, index + GridWidth);
                }
            }
        }

        private static Image NewDecorativeImage(Transform parent, string name, Color color)
        {
            var node = new GameObject(name, typeof(RectTransform), typeof(Image));
            node.transform.SetParent(parent, false);
            var image = node.GetComponent<Image>();
            image.color = color;
            image.raycastTarget = false;
            var rect = (RectTransform)node.transform;
            rect.anchorMin = rect.anchorMax = new Vector2(.5f, .5f);
            rect.pivot = new Vector2(.5f, .5f);
            return image;
        }

        private void CreateLink(int from, int to)
        {
            var link = new Link
            {
                From = from,
                To = to,
                Track = NewDecorativeImage(transform, "Energy line " + from + "-" + to, TrackColor),
                Pulse = NewDecorativeImage(transform, "Energy pulse " + from + "-" + to, PulseColor)
            };
            link.Track.enabled = false;
            link.Pulse.enabled = false;
            links.Add(link);
        }

        /// <summary>
        /// Reflow to exactly the GridLayoutGroup's square area and cell pitch.
        /// </summary>
        public void SetGeometry(float size, float cell, float gap)
        {
            if (root == null) Initialize();
            if (Mathf.Abs(gridSize - size) < .5f &&
                Mathf.Abs(cellSize - cell) < .5f &&
                Mathf.Abs(spacing - gap) < .5f) return;

            gridSize = size;
            cellSize = cell;
            spacing = gap;
            root.sizeDelta = new Vector2(size, size);

            float extent = GridWidth * cell + (GridWidth - 1) * gap;
            float margin = (size - extent) * .5f;
            float pitch = cell + gap;

            foreach (Link link in links)
            {
                link.Start = Position(link.From);
                link.End = Position(link.To);
                Vector2 diff = link.End - link.Start;
                var rect = (RectTransform)link.Track.transform;
                rect.anchoredPosition = (link.Start + link.End) * .5f;
                rect.sizeDelta = new Vector2(diff.magnitude, Mathf.Max(3f, cell * .045f));
                rect.localRotation = Quaternion.Euler(0, 0,
                    Mathf.Atan2(diff.y, diff.x) * Mathf.Rad2Deg);

                var pulseRect = (RectTransform)link.Pulse.transform;
                float pulseSize = Mathf.Clamp(cell * .095f, 5f, 15f);
                pulseRect.sizeDelta = new Vector2(pulseSize, pulseSize);
                pulseRect.localRotation = Quaternion.identity;
            }

            Vector2 Position(int index)
            {
                int x = index % GridWidth;
                int y = index / GridWidth;
                return new Vector2(-size * .5f + margin + cell * .5f + x * pitch,
                    size * .5f - margin - cell * .5f - y * pitch);
            }
        }

        /// <summary>
        /// Only powered neighbors display a route. Moving square pulses convey
        /// direction and activity while keeping the prototype readable.
        /// </summary>
        public void UpdateNetwork(bool[] connected, float time)
        {
            if (root == null || connected == null || connected.Length != GridWidth * GridHeight)
                return;

            for (int i = 0; i < links.Count; i++)
            {
                var link = links[i];
                bool active = connected[link.From] && connected[link.To];
                link.Track.enabled = active;
                link.Pulse.enabled = active;
                if (!active) continue;

                int fx = link.From % GridWidth, fy = link.From / GridWidth;
                int tx = link.To % GridWidth, ty = link.To / GridWidth;
                float sourceDistance = Mathf.Abs(fx - 2) + Mathf.Abs(fy - 2);
                float targetDistance = Mathf.Abs(tx - 2) + Mathf.Abs(ty - 2);
                Vector2 start = sourceDistance <= targetDistance ? link.Start : link.End;
                Vector2 end = sourceDistance <= targetDistance ? link.End : link.Start;
                float offset = Mathf.Repeat(time * .54f + i * .173f, 1f);
                ((RectTransform)link.Pulse.transform).anchoredPosition =
                    Vector2.Lerp(start, end, offset);
                link.Pulse.color = new Color(PulseColor.r, PulseColor.g, PulseColor.b,
                    PulseColor.a * Mathf.Sin(offset * Mathf.PI));
            }
        }
    }
}
