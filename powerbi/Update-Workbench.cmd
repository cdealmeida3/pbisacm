@echo off
rem Double-click: carries your settings and apps from the previous SACM Workbench folder into this one (D339).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-Workbench.ps1" %*
pause
