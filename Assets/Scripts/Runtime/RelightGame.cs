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
        private const string BackupSaveKey = "relight.save.backup.v1";
        private WorldModel world;
        private Machine selected = Machine.Generator;
        private Text header, subtitle, objective, status, hint;
        private RawImage planetView;
        private RectTransform networkContainerRect;
        private RectTransform networkGridRect;
        private GridLayoutGroup networkLayout;
        private EnergyNetworkEffects networkEffects;
        private Image headerBackground;
        private float regionCelebrationSeconds;
        private Texture2D planetTexture;
        private int lastPlanetKey = -1;
        private bool repairPending;
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
            WorldState saved = LoadValidSave(SaveKey);
            if (saved == null)
            {
                saved = LoadValidSave(BackupSaveKey);
                if (saved != null)
                    Debug.LogWarning("Relight restored a valid backup after the primary save was unavailable.");
            }
            world = new WorldModel(saved);
            int beforeOffline = world.State.Region;
            double away = world.ApplyOffline(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            BuildUI();
            if (world.State.Region > beforeOffline)
                status.text = "Welcome back! " + (world.State.Region - beforeOffline) + " region(s) revived offline.";
            else
                status.text = away > 1 ? "Welcome back. Offline production: " + Format(away) + " seconds." : "Restore the first region.";
            Refresh();
        }

        private void Update()
        {
            double dt = Math.Min(Time.unscaledDeltaTime, 0.25f);
            int previousRegion = world.State.Region;
            world.Tick(dt);
            if (networkEffects != null)
                networkEffects.Animate(Time.unscaledTime);
            if (world.State.Region > previousRegion)
                CelebrateRestoration(world.State.Region - previousRegion);
            if (regionCelebrationSeconds > 0f && headerBackground != null)
            {
                regionCelebrationSeconds = Mathf.Max(0f, regionCelebrationSeconds - Time.unscaledDeltaTime);
                float pulse = Mathf.Sin((3f - regionCelebrationSeconds) * 7f) * .5f + .5f;
                headerBackground.color = Color.Lerp(Panel, new Color(.12f,.43f,.35f),
                    (regionCelebrationSeconds / 3f) * pulse);
            }
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
                int previousRegion = world.State.Region;
                double away = world.ApplyOffline(DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                if (world.State.Region > previousRegion)
                    CelebrateRestoration(world.State.Region - previousRegion);
                else if (away > 1 && status != null)
                    status.text = "Offline production: " + Format(away) + " seconds.";
                Refresh();
            }
        }
        private void OnApplicationQuit() { Save(); }
        private void OnDestroy() { if (planetTexture != null) Destroy(planetTexture); }

        private static WorldState LoadValidSave(string key)
        {
            if (!PlayerPrefs.HasKey(key)) return null;
            try
            {
                var state = JsonUtility.FromJson<WorldState>(PlayerPrefs.GetString(key));
                if (WorldModel.Validate(state)) return state;
                Debug.LogWarning("Relight save validation failed for: " + key);
            }
            catch (Exception error)
            {
                Debug.LogWarning("Relight could not read save " + key + ": " + error.Message);
            }
            return null;
        }

        private void Save()
        {
            try
            {
                world.State.SavedAtUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string json = JsonUtility.ToJson(world.State);
                // Keep the last valid primary save, not a malformed value,
                // so a failed write cannot easily destroy all local progress.
                if (LoadValidSave(SaveKey) != null)
                    PlayerPrefs.SetString(BackupSaveKey, PlayerPrefs.GetString(SaveKey));
                PlayerPrefs.SetString(SaveKey, json);
                PlayerPrefs.Save();
            }
            catch (Exception error)
            {
                Debug.LogError("Relight could not save progress: " + error.Message);
            }
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

            // Large planet preview and clear first-session mission are the
            // primary visual hierarchy. The network remains one-thumb playable.
            var top = Block(safe.transform, "Header", new Vector2(.04f,.75f), new Vector2(.96f,.985f), Panel);
            headerBackground = top.GetComponent<Image>();
            header = Label(top.transform, "RELIGHT", 56, TextAnchor.MiddleLeft, Color.white);
            SetAnchors(header.rectTransform, new Vector2(.04f,.70f), new Vector2(.61f,.97f));
            subtitle = Label(top.transform, "", 31, TextAnchor.MiddleLeft, Accent);
            SetAnchors(subtitle.rectTransform, new Vector2(.04f,.38f), new Vector2(.65f,.68f));
            objective = Label(top.transform, "", 28, TextAnchor.MiddleLeft, Color.white);
            SetAnchors(objective.rectTransform, new Vector2(.04f,.06f), new Vector2(.63f,.34f));
            var planetObject = new GameObject("Recovering Planet",
                typeof(RectTransform), typeof(RawImage), typeof(AspectRatioFitter));
            planetObject.transform.SetParent(top.transform, false);
            SetAnchors((RectTransform)planetObject.transform, new Vector2(.59f,.02f), new Vector2(.99f,.98f));
            planetView = planetObject.GetComponent<RawImage>();
            planetView.raycastTarget = false;
            planetView.color = Color.white;
            var aspect = planetObject.GetComponent<AspectRatioFitter>();
            aspect.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
            aspect.aspectRatio = 1f;

            var worldPanel = Block(safe.transform, "World", new Vector2(.04f,.285f), new Vector2(.96f,.735f), Panel);
            networkContainerRect = (RectTransform)worldPanel.transform;
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
            networkGridRect = gridRect;
            networkLayout = grid;
            for (int i = 0; i < tiles.Length; i++)
            {
                int index = i;
                tiles[i] = ButtonWithLabel(gridObject.transform, "Cell " + i, "", 31, () => TapTile(index));
                tileLabels[i] = tiles[i].GetComponentInChildren<Text>();
                tileBackgrounds[i] = tiles[i].GetComponent<Image>();
            }

            var effectObject = new GameObject("Animated Energy Routes", typeof(RectTransform));
            effectObject.transform.SetParent(worldPanel.transform, false);
            networkEffects = effectObject.AddComponent<EnergyNetworkEffects>();
            networkEffects.Initialize();

            var controls = Block(safe.transform, "Build Tools", new Vector2(.04f,.147f), new Vector2(.96f,.27f), Panel);
            var names = new [] { "RELAY", "MINE", "RESTORE", "POWER", "REMOVE" };
            var kinds = new [] { Machine.Relay, Machine.Extractor, Machine.Restorer, Machine.Generator, Machine.Empty };
            for (int i = 0; i < names.Length; i++)
            {
                int index = i;
                toolButtons[i] = ButtonWithLabel(controls.transform, names[i], names[i], 23, () =>
                {
                    selected = kinds[index];
                    repairPending = false;
                    status.text = selected == Machine.Empty ? "Tap a structure to remove it." : "Tap an empty tile to construct " + selected + ".";
                    Refresh();
                });
                SetAnchors((RectTransform)toolButtons[i].transform, new Vector2(.02f + i*.196f,.25f), new Vector2(.198f + i*.196f,.83f));
            }

            var upgrades = Block(safe.transform, "Upgrades", new Vector2(.04f,.062f), new Vector2(.96f,.132f), Panel);
            var mining = ButtonWithLabel(upgrades.transform, "Mining Upgrade", "UPGRADE MINING", 26, () => Upgrade(true));
            SetAnchors((RectTransform)mining.transform, new Vector2(.025f,.15f), new Vector2(.485f,.85f));
            var power = ButtonWithLabel(upgrades.transform, "Power Upgrade", "UPGRADE POWER", 26, () => Upgrade(false));
            SetAnchors((RectTransform)power.transform, new Vector2(.515f,.15f), new Vector2(.975f,.85f));
            hint = Label(upgrades.transform, "", 19, TextAnchor.MiddleCenter, Accent);
            SetAnchors(hint.rectTransform, new Vector2(0,0), new Vector2(1,.15f));

            var bottom = Block(safe.transform, "Status", new Vector2(.04f,.008f), new Vector2(.96f,.055f), Panel);
            status = Label(bottom.transform, "", 24, TextAnchor.MiddleCenter, Color.white);
            SetAnchors(status.rectTransform, new Vector2(.02f,0), new Vector2(.76f,1));
            var repair = ButtonWithLabel(bottom.transform, "Emergency Repair", "REPAIR", 23, Repair);
            SetAnchors((RectTransform)repair.transform, new Vector2(.77f,.10f), new Vector2(.99f,.90f));
        }

        private void CelebrateRestoration(int count)
        {
            regionCelebrationSeconds = 3f;
            status.text = count == 1 ? "REGION REVIVED! Keep the network growing." :
                count + " REGIONS REVIVED! Your world is awakening.";
        }

        private void TapTile(int index)
        {
            repairPending = false;
            if (world.Place(index, selected)) Save();
            status.text = world.LastMessage;
            Refresh();
        }

        private void Upgrade(bool mining)
        {
            repairPending = false;
            if (world.Upgrade(mining)) Save();
            status.text = world.LastMessage;
            Refresh();
        }

        private void Repair()
        {
            if (!repairPending)
            {
                repairPending = true;
                status.text = "Tap REPAIR again to reset the grid (no refunds).";
                return;
            }
            repairPending = false;
            world.ResetGrid();
            status.text = world.LastMessage;
            Save();
            Refresh();
        }

        private void ReflowNetworkGrid()
        {
            if (networkContainerRect == null || networkGridRect == null ||
                networkLayout == null || networkEffects == null) return;

            var geometry = NetworkLayout.Calculate(
                networkContainerRect.rect.width, networkContainerRect.rect.height);
            if (!geometry.Valid) return;
            float size = (float)geometry.Size;
            float gap = (float)geometry.Spacing;
            float cell = (float)geometry.CellSize;

            if (Mathf.Abs(networkGridRect.sizeDelta.x - size) > .5f)
            {
                networkGridRect.sizeDelta = new Vector2(size, size);
                networkLayout.cellSize = new Vector2(cell, cell);
                networkLayout.spacing = new Vector2(gap, gap);
            }
            networkEffects.SetGeometry(size, cell, gap);
        }

        private void Refresh()
        {
            if (header == null) return;
            ReflowNetworkGrid();
            var state = world.State;
            header.text = "RELIGHT   /   REGION " + (state.Region + 1);
            var rates = world.CalculateRates();
            subtitle.text = "SCRAP " + Format(state.Scrap) + "  |  RESTORED " +
                (100.0 * state.Restoration / WorldModel.TargetForRegion(state.Region)).ToString("0") +
                "%\n+" + rates.ScrapPerSecond.ToString("0.0") + "/s   |   POWER " +
                rates.ConnectedConsumers + "/" + rates.PowerCapacity;
            var goal = world.GetFirstSessionGoal();
            switch (goal)
            {
                case FirstSessionGoal.ImproveRestoration:
                    objective.text = "01  POWER THE LIFE ENGINE\nBuild POWER beside LIFE";
                    break;
                case FirstSessionGoal.ExpandProduction:
                    objective.text = "02  EXPAND THE NETWORK\nBuild another MINE";
                    break;
                case FirstSessionGoal.RestoreFirstRegion:
                    objective.text = "03  WATCH THE WORLD AWAKEN\nKeep producing and upgrading";
                    break;
                default:
                    objective.text = "REGION REVIVED\nExplore, optimize, restore";
                    break;
            }
            RefreshPlanet();
            var connected = world.Connected();
            if (networkEffects != null)
                networkEffects.UpdateNetwork(connected);
            int suggested = world.SuggestedFirstSessionTile();
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
                // Only the suggested empty tile pulses. All other valid
                // placements remain available to the player.
                if (i == suggested && machine == Machine.Empty)
                {
                    float pulse = .5f + .5f * Mathf.Sin(Time.unscaledTime * 3f);
                    tileBackgrounds[i].color = Color.Lerp(
                        new Color(.24f,.34f,.24f), new Color(.49f,.72f,.47f), pulse);
                }
            }
            var kinds = new [] { Machine.Relay, Machine.Extractor, Machine.Restorer, Machine.Generator, Machine.Empty };
            for (int i = 0; i < toolButtons.Length; i++)
                toolButtons[i].GetComponent<Image>().color = selected == kinds[i] ? Accent : new Color(.18f,.27f,.36f);
            hint.text = "Mining: " + Format(world.UpgradeCost(true)) + " scrap   |   Power: " + Format(world.UpgradeCost(false)) + " scrap";
        }

        private void RefreshPlanet()
        {
            if (planetView == null) return;
            var state = world.State;
            float local = Mathf.Clamp01((float)(state.Restoration / WorldModel.TargetForRegion(state.Region)));
            float planetRecovery = ((state.Region % 3) + local) / 3f;
            int bucket = Mathf.Clamp(Mathf.FloorToInt(planetRecovery * 24f), 0, 24);
            int key = (state.Region / 3) * 100 + bucket;
            if (key == lastPlanetKey) return;
            var next = PlanetVisual.Generate(state.Region / 3, bucket / 24f);
            planetView.texture = next;
            if (planetTexture != null) Destroy(planetTexture);
            planetTexture = next;
            lastPlanetKey = key;
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
