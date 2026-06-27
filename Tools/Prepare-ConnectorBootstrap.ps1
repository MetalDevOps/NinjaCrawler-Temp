param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Get-RepoRoot {
    return Split-Path -Parent $PSScriptRoot
}

function Invoke-DownloadRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$OutFile
    )

    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $true

    $client = [System.Net.Http.HttpClient]::new($handler)
    try {
        $client.DefaultRequestHeaders.UserAgent.ParseAdd("NinjaCrawler-Bootstrap/0.1.0")
        $client.DefaultRequestHeaders.Accept.ParseAdd("application/octet-stream")

        $response = $client.GetAsync($Uri).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "Download falhou para '$Uri' com status $([int]$response.StatusCode) $($response.ReasonPhrase)."
        }

        $destinationDirectory = Split-Path -Parent $OutFile
        New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null

        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        [System.IO.File]::WriteAllBytes($OutFile, $bytes)
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Expand-ZipMember {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath,
        [Parameter(Mandatory = $true)]
        [string]$MemberName,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName -ieq $MemberName } | Select-Object -First 1
        if (-not $entry) {
            throw "Arquivo '$MemberName' nao encontrado em '$ArchivePath'."
        }

        $destinationDirectory = Split-Path -Parent $DestinationPath
        New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null

        $source = $entry.Open()
        try {
            $target = [System.IO.File]::Open($DestinationPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
            try {
                $source.CopyTo($target)
            } finally {
                $target.Dispose()
            }
        } finally {
            $source.Dispose()
        }
    } finally {
        $archive.Dispose()
    }
}

$repoRoot = Get-RepoRoot
$manifestPath = Join-Path $repoRoot "connectors\bootstrap\manifest.json"
if (-not (Test-Path $manifestPath)) {
    throw "Manifesto de bootstrap nao encontrado em '$manifestPath'."
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$bootstrapRoot = Join-Path $repoRoot "connectors\bootstrap"
$tempRoot = Join-Path $repoRoot "Temp\connector-bootstrap"
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

foreach ($connector in $manifest.connectors) {
    $releaseTag = if ($connector.PSObject.Properties.Name -contains 'releaseTag') {
        [string]$connector.releaseTag
    } else {
        [string]$connector.bundledVersion
    }

    $targetDirectory = Join-Path $bootstrapRoot ([System.IO.Path]::Combine([string]$connector.key, [string]$connector.bundledVersion))
    $targetPath = Join-Path $targetDirectory ([string]$connector.executableName)
    if (Test-Path $targetPath) {
        Write-Host "Bootstrap pronto: $targetPath"
        continue
    }

    $assetName = [string]$connector.assetName
    $downloadUrl = "https://github.com/" +
        ($connector.releaseApiUrl -replace '^https://api.github.com/repos/', '' -replace '/releases/latest$', '') +
        "/releases/download/$releaseTag/$assetName"
    $downloadPath = Join-Path $tempRoot $assetName

    Write-Host "Baixando $assetName..."
    Invoke-DownloadRequest -Uri $downloadUrl -OutFile $downloadPath

    if ($connector.PSObject.Properties.Name -contains 'archiveMemberName' -and $connector.archiveMemberName) {
        Expand-ZipMember -ArchivePath $downloadPath -MemberName ([string]$connector.archiveMemberName) -DestinationPath $targetPath
    } else {
        New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
        Copy-Item -LiteralPath $downloadPath -Destination $targetPath -Force
    }

    Write-Host "Bootstrap preparado: $targetPath"
}
