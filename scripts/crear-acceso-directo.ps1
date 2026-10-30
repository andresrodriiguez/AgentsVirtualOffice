# Crea el acceso directo "Oficina" en el escritorio. Uso: powershell -File scripts\crear-acceso-directo.ps1
$repo = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$link = Join-Path $desktop "Oficina.lnk"
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
$s.TargetPath = Join-Path $repo "scripts\Oficina.bat"
$s.WorkingDirectory = $repo
$s.WindowStyle = 7
$s.Description = "Abre la oficina de agentes en el navegador"
$s.Save()
Write-Output "Acceso directo creado: $link"
