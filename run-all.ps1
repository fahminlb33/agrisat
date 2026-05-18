# run-all.ps1 — Start all AgriSat services in parallel

$Root = $PSScriptRoot
$Python = "$Root\.venv\Scripts\python.exe"

# --- agrisat-api (FastAPI on port 8000) ---
$api = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root\src\agrisat-api'; `$env:DSN='data.db'; `$env:API_USERNAME='agrisat-demo'; `$env:API_PASSWORD='agrisat-demo'; & '$Python' -m fastapi dev main.py --port 8000"
) -PassThru

# --- agrisat-agent (ADK agent on port 8080) ---
$agent = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root\src\agrisat-agent'; & '$Python' main.py"
) -PassThru

# --- agrisat-web (Vite dev server on port 5000) ---
$web = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root\src\agrisat-web'; pnpm dev"
) -PassThru

Write-Host ""
Write-Host "AgriSat services started:" -ForegroundColor Green
Write-Host "  API   -> http://localhost:8000  (PID $($api.Id))"
Write-Host "  Agent -> http://localhost:8080  (PID $($agent.Id))"
Write-Host "  Web   -> http://localhost:5000  (PID $($web.Id))"
Write-Host ""
Write-Host "Each service runs in its own PowerShell window."
Write-Host "Close those windows (or press Ctrl+C in them) to stop individual services."
Write-Host ""
Write-Host "To stop ALL services at once, run:" -ForegroundColor Yellow
Write-Host "  Stop-Process -Id $($api.Id),$($agent.Id),$($web.Id)"
