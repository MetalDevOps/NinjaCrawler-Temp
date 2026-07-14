Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$validator = Join-Path $PSScriptRoot "Test-ReleaseCandidateIntegrity.ps1"
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("release-intent-" + [guid]::NewGuid())

function Invoke-FixtureGit {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = @(& git -C $fixtureRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Fixture git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return $output
}

function New-FixtureCommit {
    param(
        [Parameter(Mandatory)][string]$Message,
        [Parameter(Mandatory)][hashtable]$Files
    )

    foreach ($entry in $Files.GetEnumerator()) {
        $path = Join-Path $fixtureRoot $entry.Key
        $directory = Split-Path -Parent $path
        if ($directory) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }
        Set-Content -LiteralPath $path -Value $entry.Value -Encoding utf8
    }
    Invoke-FixtureGit -Arguments @("add", ".") | Out-Null
    Invoke-FixtureGit -Arguments @("commit", "-m", $Message) | Out-Null
    $sha = @(Invoke-FixtureGit -Arguments @("rev-parse", "HEAD"))
    return $sha[0]
}

try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    Invoke-FixtureGit -Arguments @("init") | Out-Null
    Invoke-FixtureGit -Arguments @("config", "user.name", "Release Test") | Out-Null
    Invoke-FixtureGit -Arguments @("config", "user.email", "release-test@example.com") | Out-Null

    New-FixtureCommit -Message "chore: initialize fixture" -Files @{
        "NinjaCrawler.Companion/manifest.json" = '{"version":"0.15.1"}'
        "NinjaCrawler.Companion/CHANGELOG.md" = "# Changelog"
        "NinjaCrawler.Companion/src/core.js" = "export const version = 1;"
        "src/App.tsx" = "export const app = true;"
    } | Out-Null

    $metadataOnly = New-FixtureCommit -Message "fix(release): sync metadata" -Files @{
        "NinjaCrawler.Companion/manifest.json" = '{"version":"0.15.2"}'
        "NinjaCrawler.Companion/CHANGELOG.md" = "# Changelog`n`nmetadata only"
    }
    $metadataResult = & $validator -RepositoryRoot $fixtureRoot -CommitSha $metadataOnly |
        ConvertFrom-Json
    if ($metadataResult.eligible) {
        throw "Metadata-only commits must not be eligible for a Companion release."
    }

    $appOnly = New-FixtureCommit -Message "fix(app): update application" -Files @{
        "src/App.tsx" = "export const app = false;"
    }
    $appResult = & $validator -RepositoryRoot $fixtureRoot -CommitSha $appOnly |
        ConvertFrom-Json
    if ($appResult.eligible) {
        throw "App-only commits must not be eligible for a Companion release."
    }

    $functional = New-FixtureCommit -Message "fix(companion): update runtime" -Files @{
        "NinjaCrawler.Companion/src/core.js" = "export const version = 2;"
    }
    $functionalResult = & $validator -RepositoryRoot $fixtureRoot -CommitSha $functional |
        ConvertFrom-Json
    if (-not $functionalResult.eligible) {
        throw "A functional Companion commit must be eligible for release."
    }

    $combined = New-FixtureCommit -Message "feat(companion): update runtime and metadata" -Files @{
        "NinjaCrawler.Companion/src/core.js" = "export const version = 3;"
        "NinjaCrawler.Companion/manifest.json" = '{"version":"0.16.0"}'
    }
    $combinedResult = & $validator -RepositoryRoot $fixtureRoot -CommitSha $combined |
        ConvertFrom-Json
    if (-not $combinedResult.eligible) {
        throw "Combined functional and metadata changes must remain eligible."
    }

    $bodyPath = Join-Path $fixtureRoot "release-pr.md"
    Set-Content -LiteralPath $bodyPath -Encoding utf8 -Value @"
### Bug Fixes

* metadata-only change (https://github.com/MetalDevOps/NinjaCrawler/commit/$metadataOnly)
"@
    $bodyRejected = $false
    try {
        & $validator -RepositoryRoot $fixtureRoot -PullRequestBodyPath $bodyPath `
            -RequireFunctionalChange | Out-Null
    } catch {
        $bodyRejected = $true
    }
    if (-not $bodyRejected) {
        throw "A metadata-only release PR body must be rejected."
    }

    Write-Host "Release candidate integrity tests passed."
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}
