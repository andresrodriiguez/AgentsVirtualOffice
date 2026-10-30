@echo off
rem Abre la oficina en el navegador. Si el servidor no está en marcha, lo arranca antes.
cd /d "%~dp0.."

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "Oficina - servidor (no cierres esta ventana)" /min cmd /c npm run dev
  powershell -NoProfile -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1"
  if errorlevel 1 (
    echo No se pudo arrancar la oficina. Abre una terminal en esta carpeta y ejecuta: npm run dev
    pause
    exit /b 1
  )
)
start "" http://localhost:5173
