[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),

    [string]$Ref = 'HEAD',

    [Parameter(Mandatory = $true)]
    [ValidateSet('quality', 'windows')]
    [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = @(& git -C $resolvedRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }
    return $output
}

$windowsPatterns = @(
    '^src/',
    '^src-tauri/',
    '^public/',
    '^connectors/',
    '^index\.html$',
    '^package(-lock)?\.json$',
    '^(vite|vitest)\.config\.',
    '^tsconfig[^/]*\.json$',
    '^Tools/(Build-NinjaCrawler|Get-CIBuildImpact|Get-CIInputFingerprint|Get-CIPromotionValidation|Package-NinjaCrawlerRelease|Test-NinjaCrawlerVersion)\.ps1$',
    '^\.github/workflows/(ci|release|cross-build-validation|cross-build-self-hosted)\.yml$'
)

$entries = @(
    Invoke-Git -Arguments @('ls-tree', '-r', '--full-tree', $Ref) |
        ForEach-Object {
            if ($_ -notmatch '^(?<mode>\d+)\s+(?<type>\S+)\s+(?<object>[0-9a-f]+)\t(?<path>.+)$') {
                throw "Could not parse git tree entry: $_"
            }
            [pscustomobject]@{
                mode = $Matches.mode
                type = $Matches.type
                object = $Matches.object
                path = $Matches.path.Replace('\', '/')
            }
        } |
        Where-Object {
            if ($Mode -eq 'quality') {
                return $_.path -ne 'README.md' -and
                    $_.path -ne 'CHANGELOG.md' -and
                    -not $_.path.StartsWith('docs/', [StringComparison]::Ordinal)
            }

            $path = $_.path
            return @($windowsPatterns | Where-Object { $path -match $_ }).Count -gt 0
        } |
        Sort-Object path
)

$payload = @($entries | ForEach-Object {
    "$($_.mode) $($_.type) $($_.object)`t$($_.path)"
}) -join "`n"
$bytes = [Text.Encoding]::UTF8.GetBytes($payload)
$fingerprint = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData($bytes)
).ToLowerInvariant()

[pscustomobject]@{
    mode = $Mode
    ref = $Ref
    fingerprint = $fingerprint
    pathCount = $entries.Count
    paths = @($entries | ForEach-Object path)
} | ConvertTo-Json -Depth 4 -Compress
