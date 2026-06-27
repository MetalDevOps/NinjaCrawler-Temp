param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^\d+\.\d+\.\d+$")]
    [string]$Version,
    [string]$OutputRoot = "release"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $repoRoot "src-tauri\target\release"
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputRoot))
$normalizedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'

if (-not $outputPath.StartsWith($normalizedRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputRoot must stay inside the repository: '$outputPath'."
}

$executablePath = Join-Path $releaseRoot "ninjacrawler.exe"
$msiPath = Get-ChildItem (Join-Path $releaseRoot "bundle\msi") -Filter "*.msi" -File |
    Select-Object -First 1
$nsisPath = Get-ChildItem (Join-Path $releaseRoot "bundle\nsis") -Filter "*-setup.exe" -File |
    Select-Object -First 1
$bootstrapPath = Join-Path $repoRoot "connectors\bootstrap"

if (-not (Test-Path -LiteralPath $executablePath)) {
    throw "Release executable not found: '$executablePath'."
}
if (-not $msiPath) {
    throw "MSI bundle not found below '$releaseRoot\bundle\msi'."
}
if (-not $nsisPath) {
    throw "NSIS bundle not found below '$releaseRoot\bundle\nsis'."
}
if (-not (Test-Path -LiteralPath $bootstrapPath)) {
    throw "Connector bootstrap directory not found: '$bootstrapPath'."
}

if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Recurse -Force
}
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$portableName = "NinjaCrawler-$Version-windows-x64"
$portablePath = Join-Path $outputPath $portableName
New-Item -ItemType Directory -Path $portablePath -Force | Out-Null

Copy-Item -LiteralPath $executablePath -Destination (Join-Path $portablePath "ninjacrawler.exe")
Copy-Item -LiteralPath (Join-Path $repoRoot "README.md") -Destination $portablePath
$portableConnectorsPath = Join-Path $portablePath "connectors"
New-Item -ItemType Directory -Path $portableConnectorsPath -Force | Out-Null
Copy-Item -LiteralPath $bootstrapPath -Destination (Join-Path $portableConnectorsPath "bootstrap") -Recurse

$portableZip = Join-Path $outputPath "$portableName-portable.zip"
Compress-Archive -LiteralPath $portablePath -DestinationPath $portableZip -CompressionLevel Optimal
Remove-Item -LiteralPath $portablePath -Recurse -Force

$msiDestination = Join-Path $outputPath "NinjaCrawler-$Version-windows-x64.msi"
$nsisDestination = Join-Path $outputPath "NinjaCrawler-$Version-windows-x64-setup.exe"
Copy-Item -LiteralPath $msiPath.FullName -Destination $msiDestination
Copy-Item -LiteralPath $nsisPath.FullName -Destination $nsisDestination

$assets = @($portableZip, $msiDestination, $nsisDestination)
$checksumLines = foreach ($asset in $assets) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $asset).Hash.ToLowerInvariant()
    "$hash  $([System.IO.Path]::GetFileName($asset))"
}
$checksumPath = Join-Path $outputPath "SHA256SUMS.txt"
[System.IO.File]::WriteAllLines($checksumPath, $checksumLines)

Write-Host "ReleaseAssets:"
Get-ChildItem -LiteralPath $outputPath -File |
    Sort-Object Name |
    ForEach-Object { Write-Host "$($_.Name) [$($_.Length) bytes]" }
