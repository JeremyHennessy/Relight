using NUnit.Framework;
using UnityEngine;

namespace Relight.Tests
{
    /// <summary>
    /// These tests require the actual Unity Editor and have not been run by the
    /// standalone .NET checks. They are the engine-specific acceptance gate.
    /// </summary>
    public sealed class UnityIntegrationTests
    {
        [Test]
        public void UnityJsonUtilityPreservesLongTermProgress()
        {
            var state = WorldState.NewWorld();
            state.Scrap = 432.5;
            state.Restoration = 39.75;
            state.Region = 3;
            state.ExtractorLevel = 2;
            state.PowerLevel = 1;
            state.SavedAtUnix = 1793376000L;
            state.TotalPlayedSeconds = 1234.5;

            string json = JsonUtility.ToJson(state);
            var restored = JsonUtility.FromJson<WorldState>(json);
            Assert.IsTrue(WorldModel.Validate(restored),
                "Unity JSON round-trip must result in a valid saved world.");
            Assert.AreEqual(state.Scrap, restored.Scrap, .0001);
            Assert.AreEqual(state.Restoration, restored.Restoration, .0001);
            Assert.AreEqual(state.Region, restored.Region);
            Assert.AreEqual(state.SavedAtUnix, restored.SavedAtUnix);
            Assert.AreEqual(state.TotalPlayedSeconds, restored.TotalPlayedSeconds, .0001);
            CollectionAssert.AreEqual(state.Cells, restored.Cells);
        }

        [Test]
        public void PlanetRecoveryChangesActualTexturePixels()
        {
            Texture2D dark = null;
            Texture2D restored = null;
            try
            {
                dark = PlanetVisual.Generate(0, 0f, 96);
                restored = PlanetVisual.Generate(0, 1f, 96);
                Assert.AreEqual(96, dark.width);
                Assert.AreEqual(96, restored.height);
                var before = dark.GetPixels32();
                var after = restored.GetPixels32();
                int changed = 0;
                int visible = 0;
                for (int i = 0; i < before.Length; i++)
                {
                    if (before[i].a > 0) visible++;
                    if (before[i].r != after[i].r ||
                        before[i].g != after[i].g ||
                        before[i].b != after[i].b) changed++;
                }
                Assert.Greater(visible, 1000, "Generated planet must contain visible pixels.");
                Assert.Greater(changed, 1000,
                    "Recovery must produce visible changes in the planet texture.");
            }
            finally
            {
                if (dark != null) Object.DestroyImmediate(dark);
                if (restored != null) Object.DestroyImmediate(restored);
            }
        }
    }
}
