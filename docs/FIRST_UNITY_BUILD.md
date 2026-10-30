# Relight — First Unity build (Unity 6.3 LTS)

**Version decision (October 30, 2026):** Migrating from Unity `6000.1.9f1` (removed from Build Automation) to **Unity `6000.3.27f1`**, official 6.3 LTS release of October 20, 2026. **This is a source migration, not a successful Unity build.**

Authoritative rationale and preflight: [UNITY_6_3_MIGRATION.md](UNITY_6_3_MIGRATION.md).

## Fastest route: already connected Unity Build Automation

Your Unity Cloud project already has a GitHub repository connection. **Do not change the token, developer accounts, or legacy GameCI license secrets.** Open Unity Dashboard > DevOps > Build Automation > Configurations > `Relight Android Dev` > Edit.

Change the **branch** to:
```text
migration/unity-6000.3-lts
```

Keep **project subfolder** blank. Under **Unity Version**, use **Auto-detect** which reads `ProjectSettings/ProjectVersion.txt` (the branch now specifies `6000.3.27f1`). If you prefer manual selection, confirm **`6000.3.27f1` is actually offered**. A supported major/minor version does not guarantee a particular cloud patch is installed; do not infer availability from the published Unity release archive.

Keep existing known settings: Windows 11 24H2, Android SDK 36, Windows Micro, `com.jeremyhennessy.relight`, auto-generated debug keystore, **APK (not AAB)**, no project subfolder or Build Profile override, and pre-export hook:

```text
Relight.Editor.RelightProjectSetup.Initialize
```

Keep auto-build and scheduled builds off during initial diagnosis. Save once, then manually **Build Now**. If a build-creation failure occurs, inspect **Chrome DevTools > Network > failed POST > Response** and record the error detail and request ID. **Do not make five speculative setting changes.** If the build starts, Build History should show a record and logs: use those logs to fix compile errors one at a time.

Pre-export hook creates the startup scene because Relight's current scene is generated in the Editor. The hook only executes after Unity compiles the scripts. The project currently contains 18 Unity EditMode tests in source; none have been executed in Unity yet.

## Local Windows alternative

Unity Hub Personal normally activates through your Unity ID/Google sign-in; you should not need to find or paste `UNITY_LICENSE`.

1. Install Unity `6000.3.27f1` with Android Build Support, Android SDK/NDK Tools and OpenJDK.
2. Clone the repository and checkout `migration/unity-6000.3-lts`.
3. Open from Unity Hub, select **Relight > Initialize Playable Scene**, and inspect Console.
4. Close the Unity Editor. From PowerShell in the project root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-unity-windows.ps1
```

The helper checks for a **fresh** EditMode result with at least **18 tests** and a new development APK. This script remains unverified in a real Unity Editor.

## Verified vs unverified

- **Confirmed by Unity server:** Old Unity version `6000.1.9f1` is unavailable; request ID `d3914c0e-ba8f-4ed2-b5af-70995d57f254`, HTTP 500. No Build History entry.
- **Confirmed by Unity publication:** `6000.3.27f1` is an official release in the supported 6.3 LTS family.
- **Not confirmed:** This exact patch exists in your Cloud Build target's version list, imports our source, runs 18 EditMode tests, or creates an Android APK.
- **Not attempted:** iOS Xcode/TestFlight or store signing.

## Legacy GameCI caveat

The repository contains separate GitHub Actions GameCI editor/build jobs, but these are **gated and disabled** until an independently confirmed license-compatible setup exists. Unity Personal's named-user license cannot be assumed interchangeable with the older serial-based `.ulf` mechanism. The current Unity **Build Automation** connection is our preferred hosted route; do not share credentials here.

Unity source documentation:
- https://discussions.unity.com/t/unity-devops-build-automation-2026-dependency-deprecation-cycle/1724029
- https://unity.com/releases/editor/whats-new/6000.3.27f1
- https://docs.unity.com/en-us/build-automation/basic-build-configuration/overview
- https://docs.unity.com/en-us/build-automation/advanced-build-configuration/run-custom-scripts-during-the-build-process
