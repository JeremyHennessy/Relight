using System;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace Relight
{
    // The first playable is generated at runtime: no purchased art, prefabs or binary scenes.
    public sealed class RelightGame : MonoBehaviour
    {
        private const string SaveKey = "relight.save.v1";
        private WorldModel world;
        private Machine selected = Machine.Relay;
        private Text header, subtitle, status, hint;
        private readonly Button[] tiles = new Button[25];
        private readonly Text[] tileLabels = new Text[25];
        private readonly Image[] tileBackgrounds = new Image[25];
        private readonly Button[] toolButtons = new Button[5];
        private float refreshClock, saveClock;
        private Font font;
        private static readonly Color Background = new Color(0.035f, 0.055f, 0.10f);
        private static readonly Color Panel = new Color(0.08f, 0.12f, 0.19f);
        private static readonly Color Accent = new Color(0.30f, 0.82f, 0.73f);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Launch()
        {
            var go = new GameObject("Relight Game");
            DontDestroyOnLoad(go);
            go.AddComponent<RelightGame>();
        }

        private void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.orientation = ScreenOrientation.Portrait;
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            WorldState saved = null;
            try
            {
                if (PlayerPrefs.HasKey(SaveKey))
                    saved = JsonUtility.FromJson<WorldState>(PlayerPrefs.GetString(SaveKey));
            }
            catch (Exception error) { Debug.LogWarning("Relight save rejected: " + error.Message); }
            world = new WorldModel(saved);
            double away = world.ApplyOffline(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            BuildUI();
            status.text = away > 1 ? "Welcome back. Offline production: " + Format(away) + " seconds." : "Restore the first region.";
            Refresh();
        }

        private void Update()
        {
            double dt = Math.Min(Time.unscaledDeltaTime, 0.25f);
            world.Tick(dt);
            refreshClock += Time.unscaledDeltaTime;
            saveClock += Time.unscaledDeltaTime;
            if (refreshClock >= 0.25f) { Refresh(); refreshClock = 0; }
            if (saveClock >= 15f) { Save(); saveClock = 0; }
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused) Save();
            else if (world != null)
            {
                double away = world.ApplyOffline(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                if (away > 1 && status != null)
                    status.text = "Offline production: " + Format(away) + " seconds.";
                Refresh();
            }
        }
        private void OnApplicationQuit() { Save(); }

        private void Save()
        {
            world.State.SavedAtUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            PlayerPrefs.SetString(SaveKey, JsonUtility.ToJson(world.State));
            PlayerPrefs.Save();
        }

        private static string Format(double value)
        {
            if (value >= 1000000) return (value / 1000000).ToString("0.0") + "M";
            if (value >= 1000) return (value / 1000).ToString("0.0") + "K";
            return value.ToString("0");
        }

        private void BuildUI()
        {
            if (FindFirstObjectByType<EventSystem>() == null)
            {
                var events = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
                DontDestroyOnLoad(events);
            }
            var canvasObject = new GameObject("Relight Canvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            DontDestroyOnLoad(canvasObject);
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            var backdrop = Block(canvasObject.transform, "Backdrop", Vector2.zero, Vector2.one, Background);
            var safe = new GameObject("Safe Area", typeof(RectTransform));
            safe.transform.SetParent(backdrop.transform, false);
            var safeRect = (RectTransform)safe.transform;
            Rect area = Screen.safeArea;
            safeRect.anchorMin = new Vector2(area.xMin / Screen.width, area.yMin / Screen.height);
            safeRect.anchorMax = new Vector2(area.xMax / Screen.width, area.yMax / Screen.height);
            safeRect.offsetMin = safeRect.offsetMax = Vector2.zero;

            var top = Block(safe.transform, "Header", new Vector2(.05f,.84f), new Vector2(.95f,.985f), Panel);
            header = Label(top.transform, "RELIGHT", 52, TextAnchor.UpperLeft, Color.white);
            SetAnchors(header.rectTransform, new Vector2(.04f,.40f), new Vector2(.96f,.95f));
            subtitle = Label(top.transform, "", 29, TextAnchor.MiddleLeft, Accent);
            SetAnchors(subtitle.rectTransform, new Vector2(.04f,.06f), new Vector2(.96f,.44f));

            var worldPanel = Block(safe.transform, "World", new Vector2(.04f,.38f), new Vector2(.96f,.825f), Panel);
            var gridObject = new GameObject("Energy Network", typeof(RectTransform), typeof(GridLayoutGroup));
            gridObject.transform.SetParent(worldPanel.transform, false);
            var gridRect = (RectTransform)gridObject.transform;
            gridRect.anchorMin = gridRect.anchorMax = new Vector2(.5f,.5f);
            gridRect.sizeDelta = new Vector2(800,800);
            gridRect.anchoredPosition = Vector2.zero;
            var grid = gridObject.GetComponent<GridLayoutGroup>();
            grid.cellSize = new Vector2(150,150);
            grid.spacing = new Vector2(8,8);
            grid.childAlignment = TextAnchor.MiddleCenter;
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = 5;
            for (int i = 0; i < tiles.Length; i++)
            {
                int index = i;
                tiles[i] = ButtonWithLabel(gridObject.transform, "Cell " + i, "", 31, () => TapTile(index));
                tileLabels[i] = tiles[i].GetComponentInChildren<Text>();
                tileBackgrounds[i] = tiles[i].GetComponent<Image>();
            }

            var controls = Block(safe.transform, "Build Tools", new Vector2(.04f,.20f), new Vector2(.96f,.365f), Panel);
            var names = new [] { "RELAY", "MINE", "RESTORE", "POWER", "REMOVE" };
            var kinds = new [] { Machine.Relay, Machine.Extractor, Machine.Restorer, Machine.Generator, Machine.Empty };
            for (int i = 0; i < names.Length; i++)
            {
                int index = i;
                toolButtons[i] = ButtonWithLabel(controls.transform, names[i], names[i], 23, () =>
                {
                    selected = kinds[index];
                    status.text = selected == Machine.Empty ? "Tap a structure to remove it." : "Tap an empty tile to construct " + selected + ".";
                    Refresh();
                });
                SetAnchors((RectTransform)toolButtons[i].transform, new Vector2(.02f + i*.196f,.25f), new Vector2(.198f + i*.196f,.83f));
            }

            var upgrades = Block(safe.transform, "Upgrades", new Vector2(.04f,.085f), new Vector2(.96f,.185f), Panel);
            var mining = ButtonWithLabel(upgrades.transform, "Mining Upgrade", "UPGRADE MINING", 26, () => Upgrade(true));
            SetAnchors((RectTransform)mining.transform, new Vector2(.025f,.15f), new Vector2(.485f,.85f));
            var power = ButtonWithLabel(upgrades.transform, "Power Upgrade", "UPGRADE POWER", 26, () => Upgrade(false));
            SetAnchors((RectTransform)power.transform, new Vector2(.515f,.15f), new Vector2(.975f,.85f));
            hint = Label(upgrades.transform, "", 19, TextAnchor.MiddleCenter, Accent);
            SetAnchors(hint.rectTransform, new Vector2(0,0), new Vector2(1,.15f));

            var bottom = Block(safe.transform, "Status", new Vector2(.04f,.015f), new Vector2(.96f,.075f), Panel);
            status = Label(bottom.transform, "", 24, TextAnchor.MiddleCenter, Color.white);
        }

        private void TapTile(int index)
        {
            if (world.Place(index, selected)) Save();
            status.text = world.LastMessage;
            Refresh();
        }

        private void Upgrade(bool mining)
        {
            if (world.Upgrade(mining)) Save();
            status.text = world.LastMessage;
            Refresh();
        }

        private void Refresh()
        {
            if (header == null) return;
            var state = world.State;
            header.text = "RELIGHT   /   REGION " + (state.Region + 1);
            subtitle.text = "SCRAP " + Format(state.Scrap) + "     RESTORED " +
                (100.0 * state.Restoration / WorldModel.TargetForRegion(state.Region)).ToString("0") +
                "%     POWER " + world.ActiveConsumers() + "/" + world.PowerCapacity();
            var connected = world.Connected();
            var icons = new [] { "+", "CORE", "LINK", "MINE", "LIFE", "GEN" };
            for (int i = 0; i < tiles.Length; i++)
            {
                var machine = (Machine)state.Cells[i];
                tileLabels[i].text = icons[(int)machine];
                bool active = connected[i];
                tileBackgrounds[i].color = machine == Machine.Empty ? new Color(.11f,.16f,.22f) :
                    machine == Machine.Core ? new Color(.25f,.65f,.67f) :
                    !active ? new Color(.30f,.22f,.26f) :
                    machine == Machine.Restorer ? new Color(.22f,.55f,.36f) :
                    machine == Machine.Generator ? new Color(.67f,.50f,.19f) : new Color(.20f,.36f,.50f);
            }
            var kinds = new [] { Machine.Relay, Machine.Extractor, Machine.Restorer, Machine.Generator, Machine.Empty };
            for (int i = 0; i < toolButtons.Length; i++)
                toolButtons[i].GetComponent<Image>().color = selected == kinds[i] ? Accent : new Color(.18f,.27f,.36f);
            hint.text = "Mining: " + Format(world.UpgradeCost(true)) + " scrap   |   Power: " + Format(world.UpgradeCost(false)) + " scrap";
        }

        private static GameObject Block(Transform parent, string name, Vector2 min, Vector2 max, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            SetAnchors((RectTransform)go.transform, min, max);
            go.GetComponent<Image>().color = color;
            return go;
        }

        private Text Label(Transform parent, string value, int size, TextAnchor alignment, Color color)
        {
            var go = new GameObject("Label", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            SetAnchors((RectTransform)go.transform, Vector2.zero, Vector2.one);
            var label = go.GetComponent<Text>();
            label.font = font;
            label.fontSize = size;
            label.alignment = alignment;
            label.color = color;
            label.text = value;
            label.resizeTextForBestFit = true;
            label.resizeTextMinSize = 15;
            label.resizeTextMaxSize = size;
            return label;
        }

        private Button ButtonWithLabel(Transform parent, string name, string value, int size, Action onClick)
        {
            var go = Block(parent, name, Vector2.zero, Vector2.one, new Color(.18f,.27f,.36f));
            var button = go.AddComponent<Button>();
            button.onClick.AddListener(() => onClick());
            var label = Label(go.transform, value, size, TextAnchor.MiddleCenter, Color.white);
            label.raycastTarget = false;
            return button;
        }

        private static void SetAnchors(RectTransform rect, Vector2 min, Vector2 max)
        {
            rect.anchorMin = min;
            rect.anchorMax = max;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
        }
    }
}
