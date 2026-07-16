param(
    [Parameter(Mandatory = $false)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$CompanionVersion,

    [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version) -and [string]::IsNullOrWhiteSpace($CompanionVersion)) {
    throw "Provide -Version (app), -CompanionVersion, or both."
}

if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Join-Path $PSScriptRoot "..\README.md"
}

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$content = Get-Content -LiteralPath $resolvedPath -Raw
# Match X.Y.Z but allow a following extension (e.g. .zip). Reject only a fourth
# numeric version segment (X.Y.Z.W) via (?!\.\d) and a leading extra segment via
# (?<![\d.]).
$versionPattern = '(?<![\d.])\d+\.\d+\.\d+(?!\.\d)'
$updated = $content

function Update-MarkedBlocks {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text,
        [Parameter(Mandatory = $true)]
        [string]$MarkerName,
        [Parameter(Mandatory = $true)]
        [ValidatePattern('^\d+\.\d+\.\d+$')]
        [string]$TargetVersion,
        [Parameter(Mandatory = $true)]
        [int]$ExpectedBlockCount,
        [Parameter(Mandatory = $true)]
        [string[]]$ExpectedLinks
    )

    $blockPattern = "(?ms)(?<start>^[ \t]*<!--\s*$([regex]::Escape($MarkerName))-start\s*-->[^\r\n]*\r?\n)(?<body>.*?)(?<end>^[ \t]*<!--\s*$([regex]::Escape($MarkerName))-end\s*-->[^\r\n]*$)"
    $blocks = [regex]::Matches($Text, $blockPattern)
    if ($blocks.Count -ne $ExpectedBlockCount) {
        throw "Expected exactly $ExpectedBlockCount '$MarkerName' blocks in the README, found $($blocks.Count)."
    }

    $result = [regex]::Replace(
        $Text,
        $blockPattern,
        {
            param($match)

            $versions = [regex]::Matches($match.Groups['body'].Value, $versionPattern)
            if ($versions.Count -eq 0) {
                throw "A '$MarkerName' block contains no semantic versions."
            }

            $body = [regex]::Replace($match.Groups['body'].Value, $versionPattern, $TargetVersion)
            return $match.Groups['start'].Value + $body + $match.Groups['end'].Value
        }
    )

    foreach ($expectedLink in $ExpectedLinks) {
        if (-not $result.Contains($expectedLink)) {
            throw "Updated README is missing expected release link '$expectedLink'."
        }
    }

    foreach ($block in [regex]::Matches($result, $blockPattern)) {
        $unexpectedVersions = @(
            [regex]::Matches($block.Groups['body'].Value, $versionPattern) |
                ForEach-Object Value |
                Where-Object { $_ -ne $TargetVersion } |
                Select-Object -Unique
        )
        if ($unexpectedVersions.Count -gt 0) {
            throw "'$MarkerName' block still contains unexpected versions: $($unexpectedVersions -join ', ')."
        }
    }

    return $result
}

if (-not [string]::IsNullOrWhiteSpace($Version)) {
    $updated = Update-MarkedBlocks `
        -Text $updated `
        -MarkerName 'ninjacrawler-release' `
        -TargetVersion $Version `
        -ExpectedBlockCount 3 `
        -ExpectedLinks @(
            "releases/download/v$Version/NinjaCrawler-$Version-windows-x64-setup.exe",
            "releases/download/v$Version/NinjaCrawler-$Version-windows-x64-portable.exe",
            "releases/download/v$Version/SHA256SUMS.txt"
        )
}

if (-not [string]::IsNullOrWhiteSpace($CompanionVersion)) {
    $updated = Update-MarkedBlocks `
        -Text $updated `
        -MarkerName 'ninjacrawler-companion-release' `
        -TargetVersion $CompanionVersion `
        -ExpectedBlockCount 3 `
        -ExpectedLinks @(
            "releases/download/companion-v$CompanionVersion/NinjaCrawler-Companion-$CompanionVersion.zip"
        )
}

if ($updated -eq $content) {
    $targets = @()
    if (-not [string]::IsNullOrWhiteSpace($Version)) {
        $targets += "app v$Version"
    }
    if (-not [string]::IsNullOrWhiteSpace($CompanionVersion)) {
        $targets += "companion $CompanionVersion"
    }
    Write-Host "README release links already target $($targets -join ' and ')."
    exit 0
}

[System.IO.File]::WriteAllText(
    $resolvedPath,
    $updated,
    [System.Text.UTF8Encoding]::new($false)
)

$messages = @()
if (-not [string]::IsNullOrWhiteSpace($Version)) {
    $messages += "app v$Version"
}
if (-not [string]::IsNullOrWhiteSpace($CompanionVersion)) {
    $messages += "companion $CompanionVersion"
}
Write-Host "Updated README release links for $($messages -join ' and ')."
