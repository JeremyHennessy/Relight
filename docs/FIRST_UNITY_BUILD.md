# First real Relight Unity build — setup and evidence gate

**Checkpoint:** 2026-10-30. Current development branch: `build/opt-in-android-development-apk`, stacked above `feat/first-session-polish-and-pacing` (PR #9). This branch is **not merged to main**. Unity source has not yet been compiled by the engine or run on a phone.

## Recommended: opt-in GitHub Unity builds

You do **not** need to install the full Unity editor on Windows to use the hosted GitHub runner, but **Unity must be properly activated**. With a Unity Personal license, GameCI's documented setup starts with Unity Hub activation on your machine.

### One-time steps requiring the repository owner

1. Create/sign in to a Unity account and install Unity Hub: https://unity.com/download.
2. In Unity Hub, activate the appropriate license. For a free Personal license, open Hub **Preferences > Licenses > Add > Get a free personal license**. If using Unity Pro, use its licensed serial instead. Always comply with Unity license terms.
3. If using Personal, read the license file `C:\ProgramData\Unity\Unity_lic.ulf` (Windows) **on your own machine**. Do **not** commit it, post it to a GitHub issue, or paste it in ChatGPT.
4. Navigate to `https://github.com/JeremyHennessy/Relight/settings/secrets/actions`. Under **Repository secrets**, add:
   - `UNITY_EMAIL`: your Unity account email
   - `UNITY_PASSWORD`: your Unity account password
   - `UNITY_LICENSE`: content of your `.ulf` file **for Personal**; **OR** `UNITY_SERIAL`: your Pro license serial for a professional license
5. Under **Repository variables**, initially set `RELIGHT_UNITY_CI` to `enabled`. This enables an actual Unity Editor test runner on feature/build branch pushes.
6. After the Editor tests pass, set `RELIGHT_ANDROID_CI` to `enabled` and push a new change to the branch (or commit a dedicated no-code build trigger) to launch a development Android APK build.
7. In the repository's **Actions** tab, inspect `Unity Editor verification (opt-in)` and `Unity Android development APK (opt-in)`. Successful build artifacts are uploaded under the Android run.

**Note:** Hosted Unity jobs require CI runner time and a supported Unity editor image; license setup alone does not guarantee a passing editor import or build. The test and build jobs are opt-in so they do not consume resources on every experimental commit. Workflows placed only on feature branches may not offer manual Run workflow in GitHub until present on `main`; branch pushes are the intended trigger here.

Sources: https://game.ci/docs/github/activation/, https://game.ci/docs/github/test-runner/, https://game.ci/docs/github/builder/.

### Expected GitHub artifact

- Workflow: `Unity Android development APK (opt-in)`
- Builder: `game-ci/unity-builder@v4`
- Unity version: `6000.1.9f1`
- Build method: `Relight.Editor.RelightProjectSetup.BuildAndroid`, which generates and registers the empty boot scene before creating a development APK
- Internal build path: `Builds/Relight-dev.apk`
- GitHub artifact name: `Relight-Android-Dev-<commitSHA>`
- **Not** an App Store or Play Store signed production build

Any failed, skipped, or absent job is **not verified**. After a successful APK build, test touch, performance, safe area, save/offline logic and rendering on Android.

## Alternative: local Windows build

1. Install Unity Hub and **Unity Editor 6000.1.9f1** from https://unity.com/releases/editor/whats-new/6000.1.9f1.
2. Install Editor modules **Android Build Support**, **Android SDK & NDK Tools**, and **OpenJDK**.
3. Clone Relight: `git clone https://github.com/JeremyHennessy/Relight.git`; `cd Relight`; `git switch build/opt-in-android-development-apk`.
4. Launch Unity Hub > Add project from disk > select the repository root. Wait for asset/package import and check Console errors.
5. Close the Unity Editor before running a second headless Unity instance against the same project.
6. From PowerShell in repo root:
   `powershell -ExecutionPolicy Bypass -File .\scripts\verify-unity-windows.ps1`
7. Inspect `Builds/verification/` for import/test/build logs and EditMode XML. The verification script expects **17** tests and a fresh `Builds/Relight-dev.apk`.
8. Install development APK on an Android phone, capture actual screenshots, and record any defects. A Unity compile pass alone is not a mobile verification.

## Remaining store-release work

Neither path signs a store-ready Android AAB or builds an iPhone package. Production requires verified compatibility with current store Android SDK levels; unique package identifier; release signing; privacy/consent and store listing; optional ad and purchase integrations only after testing; and iOS Xcode/TestFlight setup on macOS.

## Security and change control

- Never share or commit license files, passwords, Unity serials, Android signing keystores or Apple credentials.
- Keep all experimental changes in draft PR branches until actual editor/device evidence supports merging.
- Do not call a skipped Unity workflow “passed.”
- If the first real Unity build fails, retain its logs and fix one compile/packaging problem at a time.
