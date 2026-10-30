using UnityEngine;

namespace Relight
{
    /// <summary>
    /// Deterministic, original planet art generated entirely from code.
    /// No external assets or network requests. Rebuilt only when the recovery
    /// milestone changes, not every frame.
    /// </summary>
    public static class PlanetVisual
    {
        public static Texture2D Generate(int region, float recovery, int size = 192)
        {
            recovery = Mathf.Clamp01(recovery);
            size = Mathf.Clamp(size, 64, 512);
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.name = "Relight Planet - Region " + region;
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];

            // A different, repeatable continental pattern for each region.
            float seedX = 14.37f + region * 19.1f;
            float seedY = 32.89f + region * 23.7f;
            // World identity is visible through four original color families.
            // Actual biome-specific gameplay rules are a separate, later gate.
            Color barrenLand = new Color(.28f, .31f, .37f);
            Color livingLand = new Color(.12f, .61f, .38f);
            Color barrenOcean = new Color(.075f, .12f, .19f);
            Color livingOcean = new Color(.055f, .35f, .69f);
            switch (region % 4)
            {
                case 1: // Glacial ocean world
                    barrenLand = new Color(.30f, .38f, .43f);
                    livingLand = new Color(.53f, .77f, .71f);
                    livingOcean = new Color(.13f, .48f, .72f);
                    break;
                case 2: // Copper desert with emerging oases
                    barrenLand = new Color(.38f, .23f, .20f);
                    livingLand = new Color(.50f, .54f, .25f);
                    barrenOcean = new Color(.16f, .09f, .10f);
                    livingOcean = new Color(.19f, .45f, .58f);
                    break;
                case 3: // Violet storm world
                    barrenLand = new Color(.23f, .19f, .33f);
                    livingLand = new Color(.40f, .48f, .68f);
                    barrenOcean = new Color(.09f, .07f, .21f);
                    livingOcean = new Color(.22f, .28f, .62f);
                    break;
            }

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float nx = (2f * (x + .5f) / size) - 1f;
                    float ny = (2f * (y + .5f) / size) - 1f;
                    float r2 = nx * nx + ny * ny;
                    int index = y * size + x;
                    if (r2 > 1.19f)
                    {
                        pixels[index] = new Color32(0, 0, 0, 0);
                        continue;
                    }
                    if (r2 > 1f)
                    {
                        float aura = (1.19f - r2) / .19f;
                        pixels[index] = (Color)new Color(.13f, .56f, .85f, aura * recovery * .34f);
                        continue;
                    }

                    // Project hemisphere coordinates to spherical surface for depth.
                    float z = Mathf.Sqrt(Mathf.Max(0f, 1f - r2));
                    float n = Mathf.PerlinNoise(seedX + nx * 1.7f + z * .45f, seedY + ny * 1.7f);
                    float detail = Mathf.PerlinNoise(seedX + nx * 5.2f, seedY + ny * 5.2f + z);
                    bool land = n * .72f + detail * .28f > .51f;
                    float restoration = Mathf.SmoothStep(0f, 1f,
                        Mathf.Clamp01((recovery - .08f) * 1.22f + (detail - .5f) * .30f));
                    Color landColor = Color.Lerp(barrenLand, livingLand, restoration);
                    Color seaColor = Color.Lerp(barrenOcean, livingOcean, recovery);
                    Color surface = land ? landColor : seaColor;
                    float latitudeIce = Mathf.SmoothStep(.72f, .99f, Mathf.Abs(ny));
                    surface = Color.Lerp(surface, Color.Lerp(new Color(.33f,.37f,.43f),
                        new Color(.76f,.91f,.95f), recovery), latitudeIce * .75f);
                    float light = Mathf.Clamp01(.19f + .81f * (nx * -.47f + ny * .29f + z * .82f));
                    surface *= light;
                    // Pale, evolving cloud banks become visible as the air returns.
                    float cloud = Mathf.PerlinNoise(seedX + nx * 8.4f + z, seedY + ny * 8.4f);
                    if (recovery > .30f && cloud > .69f)
                    {
                        float cloudAlpha = Mathf.Clamp01((cloud - .69f) * 3.1f) *
                            Mathf.Clamp01((recovery - .30f) * 1.4f) * .32f;
                        surface = Color.Lerp(surface, new Color(.70f, .83f, .90f), cloudAlpha * light);
                    }
                    // Repaired settlements illuminate the dark hemisphere.
                    float city = Mathf.PerlinNoise(seedX + nx * 21.0f, seedY + ny * 21.0f);
                    if (land && recovery > .55f && light < .49f && city > .78f)
                        surface = Color.Lerp(surface, new Color(.93f,.73f,.35f),
                            Mathf.Clamp01((city - .78f) * 3f) * (recovery - .55f) * 1.5f);
                    // A thin atmospheric edge makes restoration visible even at small size.
                    float edge = Mathf.Pow(1f - z, 4f);
                    surface = Color.Lerp(surface, new Color(.22f,.77f,.91f), edge * recovery * .57f);
                    surface.a = 1f;
                    pixels[index] = surface;
                }
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, false);
            return texture;
        }
    }
}
