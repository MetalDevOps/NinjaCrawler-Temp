@echo off
setlocal

set "VSDEVCMD="
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
  for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    set "VSDEVCMD=%%i\Common7\Tools\VsDevCmd.bat"
  )
)

if not defined VSDEVCMD (
  set "VSDEVCMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
)

if not exist "%VSDEVCMD%" (
  echo Visual Studio C++ development environment was not found.
  exit /b 1
)

call "%VSDEVCMD%" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
if "%~1"=="" (
  echo Usage: %~nx0 command [args...]
  exit /b 1
)
call %*
