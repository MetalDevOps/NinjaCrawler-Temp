@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
if "%~1"=="" (
  echo Usage: %~nx0 command [args...]
  exit /b 1
)
call %*
