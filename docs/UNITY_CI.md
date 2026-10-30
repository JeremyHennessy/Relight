# Relight Unity CI: verification levels and licensing caveat

**2026-10-30 correction:** The original Unity CI onboarding guidance assumed a Unity Personal `.ulf` file and a standalone Unity password. That is not reliably compatible with current Unity Personal **named-user** licensing and Google sign-in.

## Verification levels

- **Standalone Core verification:** Automatically compiles the Unity-free gameplay model and executes source-level assertions, Unity C# syntax parsing and JSON configuration checks. It does **not** run Unity or produce an APK.
- **GameCI Unity Editor verification:** `.github/workflows/unity-editor-verification.yml` is opt-in and has been **skipped**, not passed. It needs a compatible, supported Unity license activation route.
- **GameCI Android Development APK:** `.github/workflows/unity-android-development.yml` is also opt-in. It has **not** built an APK.
- **Local Windows Unity Editor:** Uses the activated Unity Hub Personal license on the developer's Windows machine. This is the recommended first actual engine verification route.
- **Unity Build Automation (UBA):** A separate Unity-hosted cloud service can connect to GitHub through the Unity Dashboard without using GameCI's `UNITY_LICENSE` secret mechanism. Eligibility/available build minute limits must be checked in the Unity Dashboard.

## Licensing facts verified against Unity's own documents

Unity Personal activates on sign-in to Unity Hub. Unity lists Windows named-user licenses under `%LOCALAPPDATA%\Unity\licenses\UnityEntitlementLicense.xml`, and serial-based license files under `%PROGRAMDATA%\Unity\Unity_lic.ulf`. Unity's manual activation documentation states that Personal manual activation is not supported.

GameCI's third-party activation guide still describes a Personal `.ulf` process. Do not assume that a missing `.ulf` is an error, do not substitute `UnityEntitlementLicense.xml` for `UNITY_LICENSE`, and do not create or share a password solely to satisfy a legacy workflow. Current GameCI compatibility with this account has **not** been established.

## Safety gate

Both GameCI workflows have an additional guard: `RELIGHT_GAMECI_LICENSE_CONFIRMED=yes` must be set before they can run, *in addition to* `RELIGHT_UNITY_CI=enabled` or `RELIGHT_ANDROID_CI=enabled`. This guard is not a substitute for real license compatibility or a passing build and must not be set until that compatibility is confirmed with evidence.

## Suggested first successful Unity verification

1. Sign into Unity Hub using Google and confirm Personal activation.
2. Open the checked-out project using Unity 6000.1.9f1, run Unity's EditMode tests and inspect the scene.
3. Run `scripts/verify-unity-windows.ps1` after closing any open Editor instance.
4. Inspect new XML results, logs, APK output, and physical-device behavior.
5. Only after that, choose whether to configure a cloud build (Unity Build Automation may be preferable).

For step-by-step details, see [First Unity build](FIRST_UNITY_BUILD.md).

## Current status

Source tests have passed previously. **No Unity Editor tests, real device screenshots, or APK have been verified** through these workflows.

Official sources:
- https://docs.unity.com/en-us/hub/manage-license
- https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/licenses-and-activation/activation-faq
- https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/licenses-and-activation/license-activation-methods
- https://docs.unity.com/en-us/build-automation
- https://game.ci/docs/github/activation/
