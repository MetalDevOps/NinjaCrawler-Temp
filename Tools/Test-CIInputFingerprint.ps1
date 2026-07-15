Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'Get-CIInputFingerprint.ps1'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("ci-fingerprint-" + [guid]::NewGuid())

function Invoke-FixtureGit {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = @(& git -C $fixtureRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Fixture git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return $output
}

function Set-FixtureFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $target = Join-Path $fixtureRoot $Path
    $directory = Split-Path -Parent $target
    if ($directory) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    Set-Content -LiteralPath $target -Value $Value -Encoding utf8
}

function Save-FixtureCommit([string]$Message) {
    Invoke-FixtureGit -Arguments @('add', '.') | Out-Null
    Invoke-FixtureGit -Arguments @('commit', '-m', $Message) | Out-Null
    return @(Invoke-FixtureGit -Arguments @('rev-parse', 'HEAD'))[0]
}

function Get-Fingerprint([string]$Ref, [string]$Mode) {
    return & $scriptPath -RepositoryRoot $fixtureRoot -Ref $Ref -Mode $Mode |
        ConvertFrom-Json
}

try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    Invoke-FixtureGit -Arguments @('init') | Out-Null
    Invoke-FixtureGit -Arguments @('config', 'user.name', 'CI Fingerprint Test') | Out-Null
    Invoke-FixtureGit -Arguments @('config', 'user.email', 'ci-fingerprint@example.com') | Out-Null

    Set-FixtureFile -Path 'README.md' -Value '# Initial'
    Set-FixtureFile -Path 'docs/plan.md' -Value '# Plan'
    Set-FixtureFile -Path 'src/App.tsx' -Value 'export const app = true;'
    Set-FixtureFile -Path 'Tools/Test-NinjaCrawlerVersion.ps1' -Value 'Write-Host version'
    $initial = Save-FixtureCommit 'chore: initialize fixture'

    Set-FixtureFile -Path 'README.md' -Value '# Updated'
    Set-FixtureFile -Path 'docs/plan.md' -Value '# Updated plan'
    $docsOnly = Save-FixtureCommit 'docs: update documentation'

    $initialQuality = Get-Fingerprint -Ref $initial -Mode quality
    $docsQuality = Get-Fingerprint -Ref $docsOnly -Mode quality
    $initialWindows = Get-Fingerprint -Ref $initial -Mode windows
    $docsWindows = Get-Fingerprint -Ref $docsOnly -Mode windows
    if ($initialQuality.fingerprint -ne $docsQuality.fingerprint) {
        throw 'Documentation-only changes must not invalidate frontend quality reuse.'
    }
    if ($initialWindows.fingerprint -ne $docsWindows.fingerprint) {
        throw 'Documentation-only changes must not invalidate Windows build reuse.'
    }

    Set-FixtureFile -Path 'src/App.tsx' -Value 'export const app = false;'
    $sourceChange = Save-FixtureCommit 'feat: update source'
    $sourceQuality = Get-Fingerprint -Ref $sourceChange -Mode quality
    $sourceWindows = Get-Fingerprint -Ref $sourceChange -Mode windows
    if ($sourceQuality.fingerprint -eq $docsQuality.fingerprint) {
        throw 'Source changes must invalidate frontend quality reuse.'
    }
    if ($sourceWindows.fingerprint -eq $docsWindows.fingerprint) {
        throw 'Source changes must invalidate Windows build reuse.'
    }

    Set-FixtureFile `
        -Path 'Tools/Test-NinjaCrawlerVersion.ps1' `
        -Value 'Write-Host updated-version'
    $toolingChange = Save-FixtureCommit 'ci: update Windows validation tooling'
    $toolingWindows = Get-Fingerprint -Ref $toolingChange -Mode windows
    if ($toolingWindows.fingerprint -eq $sourceWindows.fingerprint) {
        throw 'Windows validation tooling changes must invalidate Windows build reuse.'
    }

    Write-Host 'CI input fingerprint tests passed.'
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}
