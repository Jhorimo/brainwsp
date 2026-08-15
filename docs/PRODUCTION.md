# Producción

## Topología inicial recomendada

Para una primera producción seria:

- 1 VPS/App node para API + Web.
- 1 VPS/Worker node para Baileys.
- PostgreSQL administrado o servidor dedicado.
- Redis administrado o protegido en red privada.
- S3 compatible para multimedia.
- Nginx/Traefik con HTTPS.

No publiques PostgreSQL (`5432`), Redis (`6379`) ni MinIO (`9000`) a Internet.

## Despliegues

El worker debe desplegarse con estrategia de drenado:

1. detener consumo de nuevos jobs;
2. cerrar workers BullMQ;
3. cerrar sockets y liberar leases;
4. iniciar la nueva versión;
5. las instancias vuelven a conectarse usando el auth state persistido.

## Métricas mínimas

- cantidad de instancias CONNECTED/RECONNECTING/LOGGED_OUT;
- tiempo desde última conexión;
- reconnect attempts;
- tamaño y edad de cola outbound;
- mensajes FAILED;
- latencia API;
- CPU/RAM por worker;
- eventos `connectionReplaced`;
- tasa de mensajes por instancia.

## Migraciones de base de datos

El `docker-compose.yml` incluido usa `prisma db push` únicamente para acelerar el entorno local. Para producción:

1. genera y revisa migraciones versionadas durante desarrollo con `npm run db:migrate`;
2. guarda `packages/database/migrations/` en Git;
3. despliega con `npm run db:migrate:deploy` antes de iniciar la nueva versión del API/worker;
4. nunca uses `db push` como mecanismo normal de cambios de esquema en producción.
