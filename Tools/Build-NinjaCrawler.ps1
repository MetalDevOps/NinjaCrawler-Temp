param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",
    [switch]$SkipLint,
    [switch]$SkipTests,
    [switch]$PortableOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return Split-Path -Parent $PSScriptRoot
}

function Get-RunnerPath {
    $runner = Join-Path $PSScriptRoot "Run-InVsDevCmd.cmd"
    if (-not (Test-Path $runner)) {
        throw "Run-InVsDevCmd.cmd nao foi encontrado em '$PSScriptRoot'."
    }

    return $runner
}

function Invoke-DesktopCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string[]]$Command
    )

    $runner = Get-RunnerPath
    Write-Host ("> " + ($Command -join " "))

    Push-Location $RepoRoot
    try {
        & $runner @Command
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao executar: $($Command -join ' ')"
        }
    } finally {
        Pop-Location
    }
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

function Get-BuildArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$BuildConfiguration,
        [Parameter(Mandatory = $true)]
        [bool]$IncludeBundles
    )

    $targetRoot = Get-TargetRoot -RepoRoot $RepoRoot -BuildConfiguration $BuildConfiguration
    $portableNames = @("ninjacrawler.exe", "ninjacrawler.pdb")
    $portableArtifacts = foreach ($name in $portableNames) {
        $path = Join-Path $targetRoot $name
        if (Test-Path $path) {
            Get-Item -LiteralPath $path
        }
    }

    $bundleArtifacts = @()
    if ($IncludeBundles) {
        $bundleRoot = Join-Path $targetRoot "bundle"
        $bundleArtifacts = if (Test-Path $bundleRoot) {
            Get-ChildItem -LiteralPath $bundleRoot -File -Recurse |
                Sort-Object FullName
        } else {
            @()
        }
    }

    return @{
        TargetRoot = $targetRoot
        PortableArtifacts = @($portableArtifacts)
        BundleArtifacts = @($bundleArtifacts)
    }
}

$repoRoot = Get-RepoRoot
$prepareBootstrapScript = Join-Path $PSScriptRoot "Prepare-ConnectorBootstrap.ps1"

Push-Location $repoRoot
try {
    & powershell -ExecutionPolicy Bypass -File $prepareBootstrapScript
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao preparar os conectores bootstrap."
    }
} finally {
    Pop-Location
}

if (-not $SkipLint) {
    Invoke-DesktopCommand -RepoRoot $repoRoot -Command @("npm", "run", "lint")
} else {
    Write-Host "Lint ignorado."
}

if (-not $SkipTests) {
    Invoke-DesktopCommand -RepoRoot $repoRoot -Command @("npm", "test")
} else {
    Write-Host "Testes frontend ignorados."
}

$buildCommand = @("npm", "run", "tauri:build")
if ($Configuration -eq "Debug") {
    $buildCommand += @("--", "--debug")
}
if ($PortableOnly) {
    $targetRoot = Get-TargetRoot -RepoRoot $repoRoot -BuildConfiguration $Configuration
    $bundleRoot = Join-Path $targetRoot "bundle"
    if (Test-Path $bundleRoot) {
        Remove-Item -LiteralPath $bundleRoot -Recurse -Force
    }

    if ($buildCommand.Count -eq 3) {
        $buildCommand += "--"
    }

    $buildCommand += "--no-bundle"
}

Invoke-DesktopCommand -RepoRoot $repoRoot -Command $buildCommand

$artifacts = Get-BuildArtifacts -RepoRoot $repoRoot -BuildConfiguration $Configuration -IncludeBundles (-not $PortableOnly)

if ($artifacts.PortableArtifacts.Count -eq 0) {
    throw "O build terminou sem gerar artefatos portateis em '$($artifacts.TargetRoot)'."
}

Write-Host "BuildRoot=$($artifacts.TargetRoot)"
Write-Host "PortableArtifacts:"
$artifacts.PortableArtifacts | ForEach-Object { Write-Host $_.FullName }

Write-Host "BundleArtifacts:"
if ($PortableOnly) {
    Write-Host "(skipped by -PortableOnly)"
} elseif ($artifacts.BundleArtifacts.Count -eq 0) {
    Write-Host "(nenhum)"
} else {
    $artifacts.BundleArtifacts | ForEach-Object { Write-Host $_.FullName }
}
