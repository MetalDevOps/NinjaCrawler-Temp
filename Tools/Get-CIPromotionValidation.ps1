[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter(Mandatory = $true)]
    [string]$Repository,

    [Parameter(Mandatory = $true)]
    [string]$HeadSha,

    [string]$MergeRef = 'HEAD',

    [string]$SourceRef = 'refs/ci/source-pr'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$fingerprintScript = Join-Path $PSScriptRoot 'Get-CIInputFingerprint.ps1'

function New-Result {
    param(
        [bool]$QualityReuse,
        [bool]$WindowsReuse,
        [string]$Reason,
        [int]$SourcePullRequest = 0
    )

    [pscustomobject]@{
        qualityReuse = $QualityReuse
        windowsReuse = $WindowsReuse
        reason = $Reason
        sourcePullRequest = $SourcePullRequest
    } | ConvertTo-Json -Compress
}

function Get-Fingerprint([string]$Ref, [string]$Mode) {
    return & $fingerprintScript -RepositoryRoot $resolvedRoot -Ref $Ref -Mode $Mode |
        ConvertFrom-Json
}

try {
    $pulls = @(
        & gh api `
            -H 'Accept: application/vnd.github+json' `
            "repos/$Repository/commits/$HeadSha/pulls" |
            ConvertFrom-Json
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not resolve pull requests associated with $HeadSha."
    }

    $sourcePullMatches = @($pulls | Where-Object {
        $_.merged_at -and
        $_.base.ref -eq 'develop' -and
        $_.merge_commit_sha -eq $HeadSha
    } | Select-Object -First 1)
    if ($sourcePullMatches.Count -ne 1) {
        New-Result $false $false `
            'No merged develop pull request provides validation provenance for the promotion head.'
        exit 0
    }

    $sourcePull = $sourcePullMatches[0]
    & git -C $resolvedRoot fetch --force --no-tags origin `
        "+refs/pull/$($sourcePull.number)/head:$SourceRef" *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not fetch source PR #$($sourcePull.number)."
    }

    $sourceQuality = Get-Fingerprint -Ref $SourceRef -Mode quality
    $headQuality = Get-Fingerprint -Ref $HeadSha -Mode quality
    $mergeQuality = Get-Fingerprint -Ref $MergeRef -Mode quality
    $sourceWindows = Get-Fingerprint -Ref $SourceRef -Mode windows
    $headWindows = Get-Fingerprint -Ref $HeadSha -Mode windows
    $mergeWindows = Get-Fingerprint -Ref $MergeRef -Mode windows

    $checkData = & gh api `
        -H 'Accept: application/vnd.github+json' `
        "repos/$Repository/commits/$($sourcePull.head.sha)/check-runs?per_page=100" |
        ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read checks for source PR #$($sourcePull.number)."
    }
    $checks = @($checkData.check_runs)
    $frontendCheck = @($checks | Where-Object {
        $_.name -eq 'Frontend quality' -and $_.app.slug -eq 'github-actions'
    } | Sort-Object completed_at -Descending | Select-Object -First 1)
    $windowsCheck = @($checks | Where-Object {
        $_.name -eq 'Windows cross-build' -and $_.app.slug -eq 'github-actions'
    } | Sort-Object completed_at -Descending | Select-Object -First 1)
    $frontendPassed = $frontendCheck.Count -eq 1 -and
        $frontendCheck[0].conclusion -eq 'success'
    $windowsPassed = $windowsCheck.Count -eq 1 -and
        $windowsCheck[0].conclusion -eq 'success'

    $qualityInputsMatch =
        $sourceQuality.fingerprint -eq $headQuality.fingerprint -and
        $headQuality.fingerprint -eq $mergeQuality.fingerprint
    $windowsInputsMatch =
        $sourceWindows.fingerprint -eq $headWindows.fingerprint -and
        $headWindows.fingerprint -eq $mergeWindows.fingerprint

    $qualityReuse = $frontendPassed -and $qualityInputsMatch
    $windowsReuse = $windowsPassed -and $windowsInputsMatch
    $reasonParts = @()
    if ($qualityReuse) {
        $reasonParts += 'frontend inputs and validation match'
    } elseif (-not $frontendPassed) {
        $reasonParts += 'source Frontend quality is unavailable'
    } else {
        $reasonParts += 'frontend inputs differ'
    }
    if ($windowsReuse) {
        $reasonParts += 'Windows inputs and validation match'
    } elseif (-not $windowsPassed) {
        $reasonParts += 'source Windows cross-build is unavailable'
    } else {
        $reasonParts += 'Windows inputs differ'
    }

    New-Result $qualityReuse $windowsReuse `
        "Source PR #$($sourcePull.number): $($reasonParts -join '; ')." `
        -SourcePullRequest $sourcePull.number
} catch {
    New-Result $false $false `
        "Promotion validation lookup failed closed: $($_.Exception.Message)"
}
