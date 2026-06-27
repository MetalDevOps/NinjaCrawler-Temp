param(
    [string]$PublishRoot = "F:\NinjaCrawler",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [switch]$SkipBuild,
    [switch]$SkipLint,
    [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return Split-Path -Parent $PSScriptRoot
}

function Get-TargetRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$BuildConfiguration
    )

    $targetName = $BuildConfiguration.ToLowerInvariant()
    return Join-Path (Join-Path (Join-Path $RepoRoot "src-tauri") "target") $targetName
}

function Invoke-Build {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$BuildConfiguration,
        [Parameter(Mandatory = $true)]
        [bool]$DoLint,
        [Parameter(Mandatory = $true)]
        [bool]$DoTests
    )

    $scriptPath = Join-Path $PSScriptRoot "Build-NinjaCrawler.ps1"
    $buildArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $scriptPath,
        "-Configuration", $BuildConfiguration
    )

    if (-not $DoLint) {
        $buildArgs += "-SkipLint"
    }

    if (-not $DoTests) {
        $buildArgs += "-SkipTests"
    }

    Push-Location $RepoRoot
    try {
        & powershell @buildArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao compilar o NinjaCrawler antes da publicacao."
        }
    } finally {
        Pop-Location
    }
}

function Get-PublishMappings {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$BuildConfiguration,
        [Parameter(Mandatory = $true)]
        [string]$PublishDestination
    )

    $targetRoot = Get-TargetRoot -RepoRoot $RepoRoot -BuildConfiguration $BuildConfiguration
    $bundleRoot = Join-Path $targetRoot "bundle"
    $mappings = New-Object System.Collections.Generic.List[hashtable]

    $portableNames = @("ninjacrawler.exe", "ninjacrawler.pdb")
    foreach ($name in $portableNames) {
        $source = Join-Path $targetRoot $name
        if (Test-Path $source) {
            $mappings.Add(@{
                    Src = $source
                    Dst = (Join-Path (Join-Path $PublishDestination "app") $name)
                }) | Out-Null
        }
    }

    if (Test-Path $bundleRoot) {
        $bundleFiles = Get-ChildItem -LiteralPath $bundleRoot -File -Recurse
        foreach ($file in $bundleFiles) {
            $relative = $file.FullName.Substring($bundleRoot.Length).TrimStart('\')
            $mappings.Add(@{
                    Src = $file.FullName
                    Dst = (Join-Path (Join-Path $PublishDestination "bundle") $relative)
                }) | Out-Null
        }
    }

    $bootstrapRoot = Join-Path $RepoRoot "connectors\bootstrap"
    if (Test-Path $bootstrapRoot) {
        $bootstrapFiles = Get-ChildItem -LiteralPath $bootstrapRoot -File -Recurse
        foreach ($file in $bootstrapFiles) {
            $relative = $file.FullName.Substring($bootstrapRoot.Length).TrimStart('\')
            $mappings.Add(@{
                    Src = $file.FullName
                    Dst = (Join-Path (Join-Path (Join-Path $PublishDestination "app") "connectors\bootstrap") $relative)
                }) | Out-Null
        }
    }

    if ($mappings.Count -eq 0) {
        throw "Nenhum artefato de build foi encontrado em '$targetRoot'."
    }

    return @($mappings)
}

function Assert-SourceFilesExist {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable[]]$Mappings
    )

    $missing = @()
    foreach ($item in $Mappings) {
        if (-not (Test-Path $item.Src)) {
            $missing += $item.Src
        }
    }

    if ($missing.Count -gt 0) {
        throw "Arquivos de saida nao encontrados:`n$($missing -join "`n")"
    }
}

function Assert-NoRunningPublishedProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PublishDestination
    )

    $appRoot = Join-Path (Join-Path $PublishDestination "app") ""
    $normalizedAppRoot = [System.IO.Path]::GetFullPath($appRoot)
    $running = Get-CimInstance Win32_Process |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($normalizedAppRoot, [System.StringComparison]::OrdinalIgnoreCase) } |
        Select-Object ProcessId, Name, ExecutablePath

    if ($running) {
        $details = $running | ForEach-Object { "$($_.Name) [PID $($_.ProcessId)] - $($_.ExecutablePath)" }
        throw "Feche os processos publicados antes de copiar novos artefatos:`n$($details -join "`n")"
    }
}

function Get-Sha256Hash {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $getFileHash = Get-Command Get-FileHash -ErrorAction SilentlyContinue
    if ($getFileHash) {
        return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
    }

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $sha256.ComputeHash($stream)
            return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
        } finally {
            $sha256.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Publish-Files {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PublishDestination,
        [Parameter(Mandatory = $true)]
        [hashtable[]]$Mappings
    )

    New-Item -ItemType Directory -Force -Path $PublishDestination | Out-Null

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupRoot = Join-Path (Join-Path $PublishDestination "_backup") $timestamp
    New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

    $backedUp = New-Object System.Collections.Generic.List[string]
    $copied = New-Object System.Collections.Generic.List[string]

    foreach ($item in $Mappings) {
        $destinationDirectory = Split-Path -Parent $item.Dst
        New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null

        if (Test-Path $item.Dst) {
            $relative = $item.Dst.Substring($PublishDestination.Length).TrimStart('\')
            $backupPath = Join-Path $backupRoot $relative
            $backupDirectory = Split-Path -Parent $backupPath
            New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
            Copy-Item -LiteralPath $item.Dst -Destination $backupPath -Force
            $backedUp.Add($relative) | Out-Null
        }

        Copy-Item -LiteralPath $item.Src -Destination $item.Dst -Force
        $copied.Add($item.Dst.Substring($PublishDestination.Length).TrimStart('\')) | Out-Null
    }

    $hashMismatches = @()
    foreach ($item in $Mappings) {
        $sourceHash = Get-Sha256Hash -Path $item.Src
        $destinationHash = Get-Sha256Hash -Path $item.Dst
        if ($sourceHash -ne $destinationHash) {
            $hashMismatches += $item.Dst
        }
    }

    if ($hashMismatches.Count -gt 0) {
        throw "Falha na verificacao por hash:`n$($hashMismatches -join "`n")"
    }

    Write-Host "Backup=$backupRoot"
    Write-Host "BackedUpCount=$($backedUp.Count)"
    Write-Host "CopiedCount=$($copied.Count)"
    Write-Host "CopiedFiles:"
    $copied | ForEach-Object { Write-Host $_ }
}

$repoRoot = Get-RepoRoot
$PublishRoot = [System.IO.Path]::GetFullPath($PublishRoot)

if (-not $SkipBuild) {
    Invoke-Build -RepoRoot $repoRoot `
                 -BuildConfiguration $Configuration `
                 -DoLint (-not $SkipLint) `
                 -DoTests (-not $SkipTests)
} else {
    Write-Host "Build ignorado."
}

$mappings = Get-PublishMappings -RepoRoot $repoRoot `
                                -BuildConfiguration $Configuration `
                                -PublishDestination $PublishRoot

Assert-SourceFilesExist -Mappings $mappings
Assert-NoRunningPublishedProcesses -PublishDestination $PublishRoot
Publish-Files -PublishDestination $PublishRoot -Mappings $mappings
