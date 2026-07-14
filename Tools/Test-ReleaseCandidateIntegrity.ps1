param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PackagePath = "NinjaCrawler.Companion",
    [string[]]$MetadataPaths = @(
        "NinjaCrawler.Companion/CHANGELOG.md",
        "NinjaCrawler.Companion/manifest.json"
    ),
    [string]$CommitRange,
    [string[]]$CommitSha,
    [string]$PullRequestBodyPath,
    [switch]$RequireFunctionalChange
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$inputModeCount = 0
if (-not [string]::IsNullOrWhiteSpace($CommitRange)) {
    $inputModeCount++
}
if ($null -ne $CommitSha -and $CommitSha.Count -gt 0) {
    $inputModeCount++
}
if (-not [string]::IsNullOrWhiteSpace($PullRequestBodyPath)) {
    $inputModeCount++
}
if ($inputModeCount -ne 1) {
    throw "Specify exactly one of -CommitRange, -CommitSha, or -PullRequestBodyPath."
}

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$normalizedPackagePrefix = $PackagePath.TrimEnd("/", "\").Replace("\", "/") + "/"
$normalizedMetadataPaths = @($MetadataPaths | ForEach-Object { $_.Replace("\", "/") })

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = @(& git -C $resolvedRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return $output
}

$commits = @()
if (-not [string]::IsNullOrWhiteSpace($CommitRange)) {
    $commits = @(Invoke-Git -Arguments @("rev-list", "--no-merges", $CommitRange))
} elseif ($null -ne $CommitSha -and $CommitSha.Count -gt 0) {
    $commits = @($CommitSha)
} else {
    $bodyPath = (Resolve-Path -LiteralPath $PullRequestBodyPath).Path
    $body = Get-Content -LiteralPath $bodyPath -Raw
    $matches = [regex]::Matches(
        $body,
        '/commit/(?<sha>[0-9a-fA-F]{7,40})(?:\b|\))'
    )
    $commits = @(
        $matches |
            ForEach-Object { $_.Groups['sha'].Value.ToLowerInvariant() } |
            Select-Object -Unique
    )
    if ($commits.Count -eq 0) {
        throw "The release PR body does not reference any source commits."
    }
}

$functionalCommits = @()
$inspectedCommits = @()
foreach ($commit in $commits) {
    if ([string]::IsNullOrWhiteSpace($commit)) {
        continue
    }

    $files = @(
        Invoke-Git -Arguments @(
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--name-only",
            "-r",
            $commit
        ) |
            ForEach-Object { $_.Trim().Replace("\", "/") } |
            Where-Object { $_ }
    )
    $functionalFiles = @(
        $files | Where-Object {
            $_.StartsWith($normalizedPackagePrefix, [StringComparison]::Ordinal) -and
            $_ -notin $normalizedMetadataPaths
        }
    )
    $entry = [ordered]@{
        sha = $commit
        package_files = @($files | Where-Object {
            $_.StartsWith($normalizedPackagePrefix, [StringComparison]::Ordinal)
        })
        functional_files = $functionalFiles
    }
    $inspectedCommits += $entry
    if ($functionalFiles.Count -gt 0) {
        $functionalCommits += $entry
    }
}

$result = [ordered]@{
    package = $PackagePath
    eligible = $functionalCommits.Count -gt 0
    inspected_commits = $inspectedCommits
    functional_commits = $functionalCommits
}

if ($RequireFunctionalChange -and -not $result.eligible) {
    $commitList = @($inspectedCommits | ForEach-Object { $_.sha }) -join ", "
    throw "Release candidate has no functional changes under '$PackagePath'. Inspected commits: $commitList"
}

$result | ConvertTo-Json -Depth 6 -Compress
