param([string]$WorkspaceRoot)

$VITE_PORT = 5173
$CDP_PORT  = 9223
$EDGE      = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$USER_DIR  = Join-Path $WorkspaceRoot ".vscode\.edge-debug"
$URL       = "http://localhost:$VITE_PORT/"

# 1. kill stale Vite process on 5173
$conns = Get-NetTCPConnection -LocalPort $VITE_PORT -ErrorAction SilentlyContinue
if ($conns) {
    $conns | Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

# 2. kill stale CDP process on 9223
$conns = Get-NetTCPConnection -LocalPort $CDP_PORT -ErrorAction SilentlyContinue
if ($conns) {
    $conns | Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

# 3. start Vite dev server in background
Write-Host "Starting Vite dev server on :$VITE_PORT ..."
$vite = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" `
    -WorkingDirectory $WorkspaceRoot -PassThru -WindowStyle Hidden

# 4. poll localhost:5173 until Vite is ready (max 30 s)
$deadline = (Get-Date).AddSeconds(30)
$viteReady = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing $URL -TimeoutSec 1
        if ($r.StatusCode -eq 200) { $viteReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}
if (-not $viteReady) {
    Write-Error "Timed out waiting for Vite on :$VITE_PORT"
    exit 1
}
Write-Host "Vite ready on :$VITE_PORT"

# 5. launch Edge with remote debugging
$proc = Start-Process -FilePath $EDGE -ArgumentList @(
    "--remote-debugging-port=$CDP_PORT",
    "--user-data-dir=$USER_DIR",
    "--no-first-run",
    "--no-default-browser-check",
    $URL
) -PassThru

Write-Host "Launched Edge PID $($proc.Id), waiting for CDP on :$CDP_PORT ..."

# 6. poll until CDP responds (max 25 s)
$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$CDP_PORT/json" -TimeoutSec 1
        if ($r.StatusCode -eq 200) {
            Write-Host "Edge CDP ready on :$CDP_PORT"
            exit 0
        }
    } catch {}
    Start-Sleep -Milliseconds 500
}

Write-Error "Timed out waiting for Edge CDP on :$CDP_PORT"
exit 1
