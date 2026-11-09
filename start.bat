@echo off
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"
node "%~dp0server.js" --host 0.0.0.0 --port %PORT%
