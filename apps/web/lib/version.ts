// Commit (corto) + fecha del build que generó esta imagen — lo setea deploy.sh como
// NEXT_PUBLIC_APP_VERSION al construir el contenedor "web" (ver docker-compose.yml), así
// nunca hay dudas de si un deploy realmente tomó el último cambio. "dev" fuera de Docker
// (npm run dev), donde no hay build que lo haya inyectado.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
