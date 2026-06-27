param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",
    [int]$StartupTimeoutSeconds = 12,
    [switch]$VerifyRuntimeLog,
    [ValidateRange(1, 300)]
    [int]$RuntimeLogTimeoutSeconds = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not ([System.Management.Automation.PSTypeName]'NinjaCrawlerNativeWindows').Type) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class NinjaCrawlerNativeWindows
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
}

function Get-RepoRoot {
    return Split-Path -Parent $PSScriptRoot
}

function Get-ExecutablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$BuildConfiguration
    )

    $targetRoot = Join-Path (Join-Path (Join-Path $RepoRoot "src-tauri") "target") $BuildConfiguration.ToLowerInvariant()
    $exePath = Join-Path $targetRoot "ninjacrawler.exe"

    if (-not (Test-Path -LiteralPath $exePath)) {
        throw "Executavel nao encontrado em '$exePath'. Gere o build antes do smoke test."
    }

    return (Resolve-Path -LiteralPath $exePath).Path
}

function Get-ConflictingProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExecutablePath
    )

    $normalizedPath = [System.IO.Path]::GetFullPath($ExecutablePath)

    foreach ($process in Get-Process -Name "ninjacrawler" -ErrorAction SilentlyContinue) {
        try {
            if ($process.Path -and [System.IO.Path]::GetFullPath($process.Path) -eq $normalizedPath) {
                return $process
            }
        } catch {
            continue
        }
    }

    return $null
}

function Get-ProcessWindowInfo {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId
    )

    $windowInfo = [System.Collections.Generic.List[object]]::new()

    $callback = [NinjaCrawlerNativeWindows+EnumWindowsProc]{
        param(
            [IntPtr]$WindowHandle,
            [IntPtr]$LParam
        )

        $windowProcessId = [uint32]0
        [void][NinjaCrawlerNativeWindows]::GetWindowThreadProcessId($WindowHandle, [ref]$windowProcessId)

        if ($windowProcessId -ne [uint32]$ProcessId) {
            return $true
        }

        $buffer = New-Object System.Text.StringBuilder 1024
        $titleLength = [NinjaCrawlerNativeWindows]::GetWindowText($WindowHandle, $buffer, $buffer.Capacity)
        if ($titleLength -le 0) {
            return $true
        }

        $windowTitle = $buffer.ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($windowTitle)) {
            return $true
        }

        $null = $windowInfo.Add([pscustomobject]@{
                Handle = $WindowHandle
                Title  = $windowTitle
            })

        return $true
    }

    $null = [NinjaCrawlerNativeWindows]::EnumWindows($callback, [IntPtr]::Zero)
    return @($windowInfo)
}

$repoRoot = Get-RepoRoot
$exePath = Get-ExecutablePath -RepoRoot $repoRoot -BuildConfiguration $Configuration
$conflictingProcess = Get-ConflictingProcess -ExecutablePath $exePath

if ($null -ne $conflictingProcess) {
    throw "Ja existe uma instancia aberta do NinjaCrawler neste caminho (PID $($conflictingProcess.Id)). Feche-a antes do smoke test."
}

$runtimeLogEnvVarName = "NINJACRAWLER_DEBUG_OPEN_RUNTIME_LOG"
$originalRuntimeLogEnvValue = [System.Environment]::GetEnvironmentVariable($runtimeLogEnvVarName, "Process")

try {
    if ($VerifyRuntimeLog) {
        [System.Environment]::SetEnvironmentVariable($runtimeLogEnvVarName, "1", "Process")
    }

    $process = Start-Process -FilePath $exePath -PassThru
} finally {
    if ($VerifyRuntimeLog) {
        [System.Environment]::SetEnvironmentVariable($runtimeLogEnvVarName, $originalRuntimeLogEnvValue, "Process")
    }
}

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$windowHandle = 0
$windowTitle = ""

try {
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue

        if ($null -eq $running) {
            throw "O processo encerrou antes de criar a janela principal."
        }

        $null = $running.Refresh()
        $windowHandle = $running.MainWindowHandle
        $windowTitle = $running.MainWindowTitle

        if ($windowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($windowTitle)) {
            break
        }
    }

    if ($windowHandle -eq 0) {
        throw "A janela principal nao foi criada dentro do timeout de $StartupTimeoutSeconds segundos."
    }

    $runtimeLogEvidence = ""
    if ($VerifyRuntimeLog) {
        $requiredWindowTitles = @("NinjaCrawler", "Runtime Log")
        $runtimeDeadline = (Get-Date).AddSeconds($RuntimeLogTimeoutSeconds)
        $matchedWindowInfoByTitle = @{}
        $missingWindowTitles = @($requiredWindowTitles)

        while ((Get-Date) -lt $runtimeDeadline) {
            Start-Sleep -Milliseconds 250
            $running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue

            if ($null -eq $running) {
                throw "O processo encerrou antes de abrir as janelas obrigatorias do runtime log."
            }

            $processWindows = Get-ProcessWindowInfo -ProcessId $process.Id
            $matchedWindowInfoByTitle = @{}

            foreach ($processWindow in $processWindows) {
                if ($requiredWindowTitles -contains $processWindow.Title -and -not $matchedWindowInfoByTitle.ContainsKey($processWindow.Title)) {
                    $matchedWindowInfoByTitle[$processWindow.Title] = $processWindow
                }
            }

            $missingWindowTitles = @()
            foreach ($requiredWindowTitle in $requiredWindowTitles) {
                if (-not $matchedWindowInfoByTitle.ContainsKey($requiredWindowTitle)) {
                    $missingWindowTitles += $requiredWindowTitle
                }
            }

            if ($missingWindowTitles.Count -eq 0) {
                break
            }
        }

        if ($missingWindowTitles.Count -gt 0) {
            $observedWindowTitles = @($matchedWindowInfoByTitle.Keys)
            $observedWindowTitlesText = if ($observedWindowTitles.Count -gt 0) {
                ($observedWindowTitles -join ", ")
            } else {
                "<nenhuma>"
            }

            throw "Nao foi possivel confirmar as janelas obrigatorias para runtime log dentro de $RuntimeLogTimeoutSeconds segundos. Faltando: $($missingWindowTitles -join ", "). Observadas: $observedWindowTitlesText."
        }

        $runtimeWindowEvidenceParts = foreach ($requiredWindowTitle in $requiredWindowTitles) {
            $windowInfo = $matchedWindowInfoByTitle[$requiredWindowTitle]
            "$requiredWindowTitle#$($windowInfo.Handle.ToInt64())"
        }

        $runtimeLogEvidence = " runtimeLogWindows=$($runtimeWindowEvidenceParts -join '|')"
    }

    Write-Output "SMOKE_TEST_OK pid=$($process.Id) windowHandle=$windowHandle windowTitle=$windowTitle$runtimeLogEvidence"
} finally {
    $running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if ($null -ne $running) {
        $closed = $false
        try {
            if (-not $running.HasExited -and $running.MainWindowHandle -ne 0) {
                $closed = $running.CloseMainWindow()
                if ($closed) {
                    Start-Sleep -Seconds 3
                }
            }
        } catch {
            $closed = $false
        }

        $running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($null -ne $running) {
            Stop-Process -Id $process.Id -Force
        }
    }
}
