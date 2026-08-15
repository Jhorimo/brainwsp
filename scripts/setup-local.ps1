$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[BrainWSP] Se creó .env desde .env.example"
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
