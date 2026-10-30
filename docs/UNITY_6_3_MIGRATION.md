# Relight — Unity 6.3 LTS migration checkpoint
**Date:** October 30, 2026  
**Target:** Unity **6000.3.27f1** (official release October 20, 2026; changeset `672d562a42a7`)  
**Status:** committed source migration; **Unity Build Automation patch availability, Unity compilation and APK remain unverified**.

## Why the migration is required — confirmed root cause

A Unity Build Automation manual build submission returned HTTP 500 with:
> Detected project using Unity Version 6000_1_9f1, but this version is not available currently. Please update your project to use a supported version of Unity, or manually select a version for Build Automation to build with.

Request ID: `d3914c0e-ba8f-4ed2-b5af-70995d57f254`. No Build History entry was created.

Unity's published 2026 Build Automation deprecation notice states that **Unity 6000.1.x was removed after October 6, 2026**, whereas **Unity 6000.3 LTS remains enabled and supported until December 2027**.

- Official deprecation: https://discussions.unity.com/t/unity-devops-build-automation-2026-dependency-deprecation-cycle/1724029
- Official 6.3.27 release: https://unity.com/releases/editor/whats-new/6000.3.27f1
- Official LTS support: https://unity.com/releases/unity-6/support
- Supported Unity versions (family, not necessarily every patch): https://docs.unity.com/en-us/build-automation/reference/supported-unity-versions

**Important distinction:** the exact **6000.3.27f1 patch has not been confirmed available in this Unity account's Build Automation inventory**. A supported LTS family and public Editor release do not prove patch availability on the cloud builder. Check the build configuration dropdown / API result before claiming successful cloud compatibility.

## Approval and preservation

- Migrated **in a new branch** `migration/unity-6000.3-lts` from `feat/offline-return-economy` at `6cf187355dfcfe8a101a66f76b450181034121ea`.
- The prior implementation, gameplay models, visual work, baseline documentation, tests and existing branches are preserved.
- The default `main` branch was not changed.
- No user-approved visual baseline has been established. Do not change game UI or economy just to disguise a build problem.
- The earlier `build/opt-in-android-development-apk` branch remains unchanged as a rollback reference.

## Targeted code/config changes

1. `ProjectSettings/ProjectVersion.txt`: Unity `6000.3.27f1` and official Editor revision.
2. `Packages/manifest.json`: `com.unity.test-framework` updated from `1.5.1` to `1.6.0`; this matches the Unity 6.3 LTS baseline used in Unity's own examples. `com.unity.ugui` remains `2.0.0`.
3. Windows verification helper and optional GitHub GameCI workflows point to 6000.3.27f1. GameCI jobs remain gated and **are not a substitute for the already connected Unity Build Automation project**.
4. A source-level CI contract check rejects obsolete 6000.1 pins and version mismatches.

The actual C# gameplay, UI, data, saves and custom Build Automation pre-export hook are preserved unchanged until Unity logs justify a separate fix.

## Unity Build Automation — next controlled test

In Unity Dashboard > DevOps > Build Automation > Configurations > **Relight Android Dev**:

| Field | Value |
| --- | --- |
| GitHub repository | `JeremyHennessy/Relight` (existing connected source control) |
| Branch | `migration/unity-6000.3-lts` |
| Project subfolder | blank |
| Unity version | Auto-detect from `ProjectSettings/ProjectVersion.txt` (6000.3.27f1) |
| Fallback | Closest patch optional; **do not rely on this as proof** |
| Alternative | Manually select **6000.3.27f1 only if offered**; if absent, check which exact **6000.3.x** patch is available before any further changes |
| Builder OS | `windows11_24h2` |
| Android SDK | `android_sdk_36` |
| Machine | Windows Micro (development experiment) |
| Bundle ID | `com.jeremyhennessy.relight` |
| Credentials | Auto-generated **development** debug keystore |
| Android bundle | OFF for initial APK |
| Auto-build / schedule | OFF / none for controlled manual attempts |
| Pre-Export Method | `Relight.Editor.RelightProjectSetup.Initialize` |
| Build Profile path, scenes override | blank |
| Other hooks | blank |
| Tests in Cloud Build | Off initially; separate Unity test run after successful import |

**One controlled manual attempt** after confirming an available editor version. If a new submission error occurs, copy *the response detail and request ID* before making any other change.

**Success gate 1:** Build History entry appears and the Unity Editor actually starts.
**Success gate 2:** Unity scripts compile and all required tests pass.
**Success gate 3:** Android development APK is produced and runs on a real device.
**Success gate 4:** Screenshot, interaction, offline progress and UI reviewed and accepted.

No part of this migration is marked successful merely because source CI passes.

## Local Windows alternative

Install Unity Hub and exact `6000.3.27f1` Editor with Android Build Support (SDK/NDK/OpenJDK), select the migration branch, then run the repository's `scripts/verify-unity-windows.ps1` from PowerShell. The script requires the current number of Editor tests and checks for a fresh APK. No `UNITY_LICENSE` file from Google login is required for local Unity Personal activation.

## Security and future updates

Unity published October 2026 security advisories affecting versions through 6000.3.27f1 and marked patches **pending as of October 28, 2026**. This does not prevent a diagnostic development build, but **store release must reassess new patched Editors and advisories**, then migrate on a separately verified checkpoint. Source: https://unity.com/security/unity-emudhra-compromise and https://unity.com/security/unity-brotli-decoder-vulnerability .

## Evidence register
- Prior UBA failure: GitHub issue #11 and Unity request ID above.
- Last verified prior gameplay: standalone .NET CI pass on `feat/offline-return-economy`, not a Unity build.
- New migration: compare this feature branch with its base; use GitHub Actions results for source-level checks only.
