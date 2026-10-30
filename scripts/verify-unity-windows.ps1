# Requires Windows PowerShell 5.1+ and a licensed Unity 6000.1.9f1 install.
# Does not upload secrets or modify Unity license activation.
param(
    [string]$UnityExe = "C:\Program Files\Unity\Hub\Editor\6000.1.9f1\Editor\Unity.exe",
    [switch]$SkipAndroid
)

$ErrorActionPreference = "Stop"
$project = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$verification = Join-Path $project "Builds\verification"
New-Item -ItemType Directory -Force -Path $verification | Out-Null

if (-not (Test-Path -LiteralPath $UnityExe)) {
    throw "Unity editor not found: $UnityExe. Pass -UnityExe with the correct path."
}

function Invoke-Unity([string]$Label, [string[]]$UnityArgs) {
    Write-Host "==> $Label"
    & $UnityExe @UnityArgs
    $exit = $LASTEXITCODE
    if ($exit -ne 0) {
        throw "$Label failed with Unity exit code $exit. Review log under $verification."
    }
}

$setupLog = Join-Path $verification "01-setup.log"
Invoke-Unity "Initialize playable scene" @(
    "-batchmode", "-nographics", "-quit",
    "-projectPath", $project,
    "-executeMethod", "Relight.Editor.RelightProjectSetup.Initialize",
    "-logFile", $setupLog
)

$testsLog = Join-Path $verification "02-editmode.log"
$testsXml = Join-Path $verification "editmode-results.xml"
# Do not accept a stale Passed result from an earlier run.
if (Test-Path -LiteralPath $testsXml) {
    Remove-Item -LiteralPath $testsXml -Force
}
# Unity Test Framework handles editor exit after -runTests.
# Unity explicitly does not support supplying -quit during a test run.
Invoke-Unity "Execute Unity EditMode tests" @(
    "-batchmode", "-nographics",
    "-projectPath", $project,
    "-runTests", "-testPlatform", "EditMode",
    "-testResults", $testsXml, "-logFile", $testsLog
)

if (-not (Test-Path -LiteralPath $testsXml)) {
    throw "Unity did not produce EditMode test results: $testsXml."
}

[xml]$results = Get-Content -LiteralPath $testsXml -Raw
$testRun = $results.'test-run'
if ($null -eq $testRun) {
    throw "Unity produced an unrecognized XML test result. Review $testsXml."
}
$total = [int]$testRun.total
$failed = [int]$testRun.failed
if ($testRun.result -ne "Passed" -or $total -lt 16 -or $failed -ne 0) {
    throw "Unity EditMode tests incomplete/failed: result=$($testRun.result), total=$total, failed=$failed. Review $testsXml and $testsLog."
}

Write-Host "Unity EditMode suite PASSED ($total discovered, $failed failed). Output: $testsXml"

if (-not $SkipAndroid) {
    $androidLog = Join-Path $verification "03-android.log"
    $apk = Join-Path $project "Builds\Relight-dev.apk"
    # A previous successful APK must never masquerade as a new build.
    if (Test-Path -LiteralPath $apk) {
        Remove-Item -LiteralPath $apk -Force
    }
    Invoke-Unity "Build Android development APK" @(
        "-batchmode", "-nographics", "-quit",
        "-projectPath", $project,
        "-buildTarget", "Android",
        "-executeMethod", "Relight.Editor.RelightProjectSetup.BuildAndroid",
        "-logFile", $androidLog
    )
    $apk = Join-Path $project "Builds\Relight-dev.apk"
    if (-not (Test-Path -LiteralPath $apk)) {
        throw "Unity returned success but no development APK was found: $apk."
    }
    Write-Host "Development APK produced: $apk"
}

Write-Host "Local verification passed the requested checks. Real-device installation and visual approval remain separate gates."
