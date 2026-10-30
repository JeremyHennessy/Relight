# Relight: actual Unity editor verification

## Why there are two verification levels

**Core verification (enabled):** GitHub Actions compiles the Unity-independent world model and runs gameplay checks. It parses Unity C# files and validates project configuration, but cannot confirm engine APIs, rendering, touch input, Unity Test Framework execution or mobile packaging.

**Unity Editor verification (opt-in):** `.github/workflows/unity-editor-verification.yml` uses the established GameCI Unity Test Runner to import Relight with **Unity 6000.1.9f1**, compile game scripts in the actual engine and run EditMode tests. It is disabled by default until legitimate Unity licensing is configured. A skipped run does *not* count as a pass.

## Enable the engine check without sharing account secrets in chat

1. In **Repository > Settings > Secrets and variables > Actions**, configure the Unity secrets required by your applicable license. GameCI documents `UNITY_EMAIL`, `UNITY_PASSWORD` and either `UNITY_LICENSE` (Personal) or `UNITY_SERIAL` (professional). Never commit these values or paste them into issues/chats.
2. Under **Variables**, create repository variable `RELIGHT_UNITY_CI` with the exact value `enabled`.
3. Push or update a `feat/**` or `fix/**` development branch. The Unity workflow is designed to run automatically for those branches when enabled.
4. Review the **Unity Editor verification (opt-in)** workflow logs and artifacts. The GameCI runner itself also requires successful account/license activation; configured secrets alone do not prove activation.
5. A successful Unity test run establishes **Unity editor import and EditMode tests only**. It does not mean Android or iOS builds are functional.

The `workflow_dispatch` event is also declared; GitHub normally exposes manual dispatch for workflows present on the default branch. Until this workflow reaches `main`, branch-push triggering is the intended route.

Official reference: https://game.ci/docs/github/test-runner/

## Local Windows alternative (no GitHub licensing setup required)

Use Unity Hub's existing activated Unity 6000.1.9f1 installation with Android Build Support. From repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-unity-windows.ps1
```

Run with `-SkipAndroid` to test only the Editor. An Editor invocation needs a license already valid on that machine. Check `Builds/verification/` for test XML and logs. The script checks that the result is new, at least 13 EditMode tests are discovered, zero fail, and (if selected) that a fresh Android development APK exists.

## Actual mobile gates still required

- Install Android development APK and test touch input, safe areas, visual presentation and pause/resume.
- Confirm offline save/recovery does not duplicate earnings or lose progress.
- Produce iOS build using macOS and Xcode and test on iPhone.
- Collect screenshots and explicit visual approval before treating the UI as stable.
- Production signing, store policy checks and release approval are separate.

## Status

As of 2026-10-30, no licensed Unity editor run, device screenshots or mobile build have been produced here. Do not report one until there is a successful editor/build job with logs or actual device evidence.
