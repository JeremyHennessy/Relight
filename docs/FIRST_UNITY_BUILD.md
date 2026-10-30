# First real Relight Unity build — corrected licensing guidance
**Reviewed: 2026-10-30.** Source branch: `build/opt-in-android-development-apk` (draft PR #10). No actual Unity Editor run, mobile APK, or device test has yet been verified.

## Important correction: Unity 6 Personal licenses and GameCI

Our original instructions assumed that a Unity Personal license would create `C:\ProgramData\Unity\Unity_lic.ulf`, and asked the owner to use this file as GitHub's `UNITY_LICENSE` secret. **That is not a reliable assumption for a modern Unity Personal installation.**

Unity's current official documentation says:
- Unity Personal is activated by signing in to **Unity Hub**, including a Unity account accessed through Google sign-in. Usually no extra license activation is necessary.
- Unity Personal uses a **named-user** license; on Windows the entitlement is normally at `%LOCALAPPDATA%\Unity\licenses\UnityEntitlementLicense.xml`.
- The older `%PROGRAMDATA%\Unity\Unity_lic.ulf` path is documented for **serial-based** licenses.
- Manual activation is not supported for Unity Personal.

GameCI's activation guide still describes a Personal `.ulf` workflow. Until we have direct, valid evidence that the documented GameCI method works with this particular Unity account and Unity Editor version, **do not** create a new Unity password, upload a named-user XML file as `UNITY_LICENSE`, or turn on the GitHub GameCI workflows based on these old assumptions. Never paste a license, password, PAT or XML entitlement in chat or repository source.

Primary sources:
- Unity Hub Personal licensing: https://docs.unity.com/en-us/hub/manage-license
- Unity license file types: https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/licenses-and-activation/activation-faq
- Unity activation methods: https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/licenses-and-activation/license-activation-methods
- Potentially conflicting GameCI instructions: https://game.ci/docs/github/activation/

## Recommended first proof: Windows + Unity Hub

This is the lowest-risk way to verify the actual game without a new password or a guessed license file.

1. Install [Unity Hub](https://unity.com/download) and **sign in using Google as normal**. Check Hub Settings > Licenses to verify Unity Personal is active.
2. Install **Unity Editor 6000.1.9f1** and the Android Build Support module including SDK/NDK tools and OpenJDK. We preserve the repository's target version until a real import/build proves whether any change is necessary.
3. From PowerShell, clone the project and select the current reviewable branch:

   ```powershell
   git clone https://github.com/JeremyHennessy/Relight.git
   cd Relight
   git switch build/opt-in-android-development-apk
   ```

4. In Unity Hub > **Add project from disk**, select the `Relight` repository directory. Open it and check Unity Console for compile/package errors.
5. In the Editor select **Relight > Initialize Playable Scene**, then open `Assets/Scenes/Relight.unity` and press Play. Inspect actual UI before assuming it renders correctly.
6. Close Unity Editor to avoid simultaneous processes using one project. In PowerShell at repo root, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\verify-unity-windows.ps1
   ```

   The script attempts 17 Unity EditMode tests and builds `Builds/Relight-dev.apk`. Inspect `Builds/verification/` logs and XML. The script is **unverified in a real Editor**; a failed first run is evidence to investigate, not permission to claim a working APK.
7. If the new APK is produced, install it on a real Android phone and verify the network, UI scaling, REVIVE, offline progression and save recovery. Capture screenshots for first visual approval.

## Cloud alternative: Unity Build Automation

If the goal is builds without Unity installed on Windows, consider **Unity Build Automation (UBA)** through the [Unity Dashboard](https://cloud.unity.com/), using the existing Unity ID/Google sign-in. Unity documents direct GitHub source control access and Android build configurations. This is **not** the same as GameCI and does not require placing your Unity Personal entitlement into a GitHub Actions secret.

High-level configuration:
1. In Unity Dashboard, open **DevOps > Build Automation** and activate/configure the service as appropriate to the account and available free-plan usage.
2. Connect GitHub and the `JeremyHennessy/Relight` repository. Unity's documentation specifies GitHub authorization (typically a fine-grained PAT with minimal repository permissions); create/store it **only in Unity's secure configuration**, not this repo or chat.
3. Configure an Android development build from branch `build/opt-in-android-development-apk` with the Unity version from `ProjectSettings/ProjectVersion.txt`, **if available**. Unity currently lists 6000.1 as deprecated in Build Automation, so verify available editor images before assuming compatibility.
4. The current repository initializes its boot scene via `Relight.Editor.RelightProjectSetup.Initialize`; ensure scene setup happens before the cloud build, for example using a properly configured Unity pre-export method. Confirm with logs.
5. Run the first build, inspect logs and artifacts, then install on a phone.

Unity references:
- https://docs.unity.com/en-us/build-automation
- https://docs.unity.com/en-us/build-automation/get-started-with-build-automation/connect-your-version-control-system
- https://docs.unity.com/en-us/build-automation/basic-build-configuration/overview
- https://docs.unity.com/en-us/build-automation/reference/supported-unity-versions
- https://docs.unity.com/en-us/devops/pricing/free-plan

**Cloud billing, available build minutes and supported Unity versions must be verified for the account before assuming a free/working build.** No UBA service has been connected in this conversation.

## GameCI on GitHub — held for license compatibility review

The two workflows, `unity-editor-verification.yml` and `unity-android-development.yml`, remain **opt-in** and must not be presented as a ready-to-use Unity Personal solution. They require an explicitly verified compatible GameCI license activation method, which has not been established. They are also gated on `RELIGHT_GAMECI_LICENSE_CONFIRMED=yes` in addition to their respective opt-in variables. Do not set that guard simply to silence a skipped build.

## Release gates still outstanding

Actual Unity compilation, all 17 Editor tests, an Android development APK, physical-device testing, iOS build, app-store signing and app-store review are all unverified. The current default branch is not changed by this documentation correction.
