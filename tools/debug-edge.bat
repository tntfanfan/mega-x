@echo off
REM Launch Edge with remote debugging for VSCode attach.
REM Usage: double-click this file, or run from VSCode terminal.
REM Then in VSCode select 'mega-x (attach to running Edge :9223)' and press F5.

set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set USERDIR=%~dp0..\\.vscode\\.edge-profile
set URL=http://localhost:8000/

echo Starting Edge with CDP on :9223
echo   user-data-dir = %USERDIR%
echo   url           = %URL%

%EDGE% --remote-debugging-port=9223 --user-data-dir="%USERDIR%" --no-first-run --no-default-browser-check %URL%
