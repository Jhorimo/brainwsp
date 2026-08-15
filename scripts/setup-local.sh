#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[BrainWSP] Se creó .env desde .env.example"
fi

echo "[BrainWSP] Construyendo y levantando servicios..."
docker compose up -d --build

echo ""
echo "BrainWSP iniciado:"
echo "  Panel:   http://localhost:3000"
echo "  API:     http://localhost:4000/api"
echo "  Swagger: http://localhost:4000/docs"
echo ""
echo "Consulta las credenciales APP KEY / AUTH KEY del seed con:"
echo "  docker compose logs api | tail -80"
