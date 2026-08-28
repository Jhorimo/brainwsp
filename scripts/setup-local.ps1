$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[BrainWSP] Se creó .env desde .env.example"
}

# Asegura que el motor de Docker esté arriba (Docker Desktop en Windows no
# arranca solo). Sin esto, "docker compose up" falla con un error de pipe.
try {
    docker info *> $null
} catch {
    $dockerInfoFailed = $true
}
if ($LASTEXITCODE -ne 0 -or $dockerInfoFailed) {
    Write-Host "[BrainWSP] Docker no responde, iniciando Docker Desktop..."

    # La instalación puede ser "para todos los usuarios" (Program Files) o
    # "solo este usuario" (AppData\Local\Programs). Probamos ambas antes de
    # rendirnos, y si tampoco aparece ahí, preguntamos al registro de
    # Windows por la ruta real de instalación.
    $dockerExeCandidates = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
    )
    $dockerExe = $dockerExeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

    if (-not $dockerExe) {
        $uninstallKeys = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        $installLocation = Get-ItemProperty $uninstallKeys -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq "Docker Desktop" } |
            Select-Object -ExpandProperty InstallLocation -First 1
        if ($installLocation) {
            $candidate = Join-Path $installLocation "Docker Desktop.exe"
            if (Test-Path $candidate) { $dockerExe = $candidate }
        }
    }

    if (-not $dockerExe) {
        throw "No se encontró Docker Desktop.exe (se probó Program Files, AppData\Local\Programs y el registro). Ábrelo manualmente y reintenta."
    }

    Start-Process $dockerExe

    $elapsed = 0
    $timeoutSeconds = 180
    while ($true) {
        try { docker info *> $null } catch {}
        if ($LASTEXITCODE -eq 0) { break }
        if ($elapsed -ge $timeoutSeconds) {
            throw "Docker Desktop no arrancó en ${timeoutSeconds}s. Ábrelo manualmente y reintenta."
        }
        if ($elapsed -gt 0 -and $elapsed % 15 -eq 0) {
            Write-Host "[BrainWSP] Esperando a Docker Desktop... (${elapsed}s)"
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    Write-Host "[BrainWSP] Docker listo tras ${elapsed}s."
}

# Avisa si el puerto 3000 ya está ocupado (p.ej. un "next dev" suelto de una
# sesión anterior). NO lo mata automáticamente: en Windows, Docker Desktop
# también puede tener su propio proceso de forwarding en ese puerto, y
# matarlo a ciegas tumba el motor de Docker completo (y con él, cualquier
# sesión de WhatsApp en curso en el worker). Si es un proceso propio, ciérralo
# a mano: Stop-Process -Id <PID> -Force
$stalePort = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($stalePort) {
    foreach ($conn in $stalePort) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
        Write-Host "[BrainWSP] Aviso: el puerto 3000 ya está en uso por PID $($conn.OwningProcess) ($($proc.Name))."
        Write-Host "[BrainWSP]   Si es un 'next dev' suelto, ciérralo con: Stop-Process -Id $($conn.OwningProcess) -Force"
    }
}

Write-Host "[BrainWSP] Construyendo y levantando servicios..."
docker compose up -d --build

Write-Host ""
Write-Host "BrainWSP iniciado:"
Write-Host "  Panel:   http://localhost:3000"
Write-Host "  API:     http://localhost:4000/api"
Write-Host "  Swagger: http://localhost:4000/docs"
Write-Host ""
Write-Host "Credenciales del seed: docker compose logs api"
