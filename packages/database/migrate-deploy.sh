#!/bin/sh
# Aplica las migraciones commiteadas en packages/database/migrations (equivalente a
# `php artisan migrate` pero con Prisma). Usado tanto por el CMD de apps/api/Dockerfile
# (arranque normal del contenedor) como por el paso "Aplicar el esquema" del workflow de
# GitHub Actions (pre-chequeo en un contenedor descartable antes de reemplazar produccion).
set -e
SCHEMA="packages/database/schema.prisma"
BASELINE="20260821232835_init"

if ! npx prisma migrate deploy --schema "$SCHEMA"; then
  echo "migrate deploy fallo en el primer intento: asumiendo una base de datos que ya" >&2
  echo "tiene estas tablas por el viejo flujo de 'db push' (sin historial de migraciones)." >&2
  echo "Marcando la migracion baseline como aplicada (sin ejecutar SQL) y reintentando." >&2
  npx prisma migrate resolve --applied "$BASELINE" --schema "$SCHEMA"
  npx prisma migrate deploy --schema "$SCHEMA"
fi
