@echo off
REM Start the mega-x debug stack: dev_server (port 8000) + Edge with CDP (port 9223).
REM Then in VSCode select 'mega-x (attach Edge :9223)' and press F5.
REM
REM Closing this terminal stops both processes.

setlocal
set ROOT=%~dp0..
set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set USERDIR=%ROOT%\.vscode\.edge-profile
set URL=http://localhost:8000/

echo [debug-edge] mega-x project root: %ROOT%
echo [debug-edge] starting dev server on http://127.0.0.1:8000 ...
start "mega-x dev_server" /MIN cmd /c "cd /d %ROOT% && python tools\dev_server.py 8000"

REM give the server a moment to bind before Edge tries to load the URL
timeout /t 2 /nobreak >nul

echo [debug-edge] starting Edge with --remote-debugging-port=9223
echo [debug-edge] user-data-dir = %USERDIR%
echo.
echo Now switch to VSCode and run the 'mega-x (attach Edge :9223)' debug config.
echo Closing this window will stop Edge but NOT the dev_server window.
echo.

%EDGE% --remote-debugging-port=9223 --user-data-dir="%USERDIR%" --no-first-run --no-default-browser-check %URL%
