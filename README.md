# BrainWSP Platform

Plataforma profesional para centralizar WhatsApp en el ecosistema Brain Tech: **Gateway API + BrainPOS/ERP + bandeja de agentes + chat en vivo + Session Manager + colas + tiempo real**.

> Nombre de trabajo: `BrainWSP`. Se puede renombrar sin cambiar la arquitectura.

## Qué incluye este MVP

- Multiempresa desde base de datos (`companyId`).
- Login administrativo con JWT.
- APP KEY + AUTH KEY por integración.
- AUTH KEY autenticado por hash SHA-256 + pepper; se guarda además cifrado (AES-256-GCM) para poder mostrarlo de nuevo desde el panel.
- Endpoint legacy compatible con la integración PHP actual: `POST /api/create-message`.
- API v1 para texto y documentos.
- Instancias WhatsApp por QR con Baileys.
- Estado de autenticación Baileys persistido en PostgreSQL, no en archivos.
- Session Manager con reconexión exponencial.
- Lock/lease distribuido en Redis para impedir sockets duplicados.
- BullMQ para mensajes salientes y comandos de conexión.
- Conversaciones, contactos y mensajes persistidos.
- Bandeja web para agentes con Socket.IO en tiempo real.
- Gestión de usuarios/agentes con roles OWNER, ADMIN, SUPERVISOR y AGENT.
- Departamentos y transferencia manual de conversaciones entre agentes/áreas.
- Redis Pub/Sub entre worker y API.
- Dashboard, pantalla de instancias, QR y configuración de API.
- PostgreSQL + Redis + MinIO preparados con Docker Compose.
- Swagger en `/docs`.

## Stack

- **Frontend:** Next.js 16.3 + React 19 + TypeScript.
- **Backend:** NestJS 11 + TypeScript.
- **WhatsApp QR:** Baileys (`@whiskeysockets/baileys`) 7.0.0-rc14.
- **DB:** PostgreSQL 16 + Prisma 6.19.
- **Queue/cache/locks:** Redis 7 + BullMQ.
- **Realtime:** Socket.IO + Redis Pub/Sub.
- **Archivos:** MinIO (preparado para la siguiente fase).
- **Runtime:** Node.js 22.

## Arquitectura

```text
BrainPOS / ERP / terceros
          |
          | APP KEY + AUTH KEY
          v
+---------------------------+
|      NestJS API           |
| Auth / API / CRM / Chat   |
+-------------+-------------+
              |
        PostgreSQL
              |
        BullMQ / Redis
              |
+-------------v-------------+
|    WhatsApp Worker        |
| Session Manager + Baileys |
+-------------+-------------+
              |
           WhatsApp
              |
         Cliente final

Worker -- Redis Pub/Sub --> API -- Socket.IO --> Agentes web
```

## Inicio rápido con Docker

### Requisitos

- Docker Desktop / Docker Engine con Compose.
- 4 GB de RAM libres como mínimo para desarrollo.

### 1. Configuración

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Para producción cambia obligatoriamente `JWT_SECRET`, `CREDENTIAL_HASH_PEPPER` y la contraseña del administrador.

### 2. Levantar todo

Un solo comando hace todo el trabajo: arranca Docker Desktop si está apagado, avisa si el puerto 3000 ya está ocupado, y construye/levanta los 6 servicios (postgres, redis, minio, api, worker, web).

Windows (PowerShell, desde la raíz del repo):

```powershell
./scripts/setup-local.ps1
```

Linux/macOS:

```bash
./scripts/setup-local.sh
```

Equivalente manual si prefieres no usar el script:

```bash
docker compose up -d --build
```

En el primer inicio el contenedor API crea el esquema y ejecuta el seed de desarrollo. La primera vez tarda varios minutos (build de las 3 imágenes); las siguientes son mucho más rápidas por el caché de Docker.

### 3. Abrir

- Panel: `http://localhost:3000`
- API: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/docs`
- MinIO Console: `http://localhost:9001`

Credenciales iniciales por defecto (entorno local, definidas en `.env`/`seed.ts`):

```text
Admin (empresa Brain Tech Peru):
  Usuario:  admin@braintech.com.pe
  Password: ChangeMe-123456!

Superadmin (plataforma):
  Usuario:  superadmin@braintech.com.pe
  Password: SuperAdmin-123456!
```

Estas son solo las de desarrollo local. En producción, `deploy.sh` genera contraseñas aleatorias para ambas cuentas y las muestra al final del despliegue (también quedan guardadas en `../tudominio.com.txt`).

Revisa el log del API para obtener el primer APP KEY / AUTH KEY:

```bash
docker compose logs api
```

### Comandos útiles

```bash
docker compose ps                 # estado de los 6 servicios
docker compose logs -f worker     # seguir el log del worker de WhatsApp
docker compose restart api        # reiniciar solo el API (no toca la sesión de WhatsApp)
docker compose down               # apagar todo (los datos persisten en volúmenes)
```

> Evita `docker compose restart worker` o `down` mientras haya una sesión de WhatsApp conectada en producción: fuerza una reconexión del socket de Baileys. Es seguro en desarrollo.

### Solución de problemas

- **`docker compose up` falla al construir `api` con `COPY ... apps/api/dist: not found`**: hay un `tsconfig.tsbuildinfo` desactualizado colado en el contexto de build. Debe estar en `.gitignore`/`.dockerignore` (ya corregido); si reaparece, bórralo (`git rm --cached apps/api/tsconfig.tsbuildinfo`) y reconstruye con `docker compose build --no-cache api`.
- **El API arranca pero lanza `ECONNREFUSED 127.0.0.1:9000`**: el cliente de MinIO está resolviendo `localhost` en vez del servicio `minio` de la red de Docker. Las variables `MINIO_ENDPOINT=minio` (y el resto de `MINIO_*`) ya están fijadas en `docker-compose.yml` para `api` y `worker`; no deben depender del `.env` local.
- **El puerto 3000 ya está en uso al iniciar `web`**: normalmente es un `next dev` local suelto de una sesión anterior. `./scripts/setup-local.ps1` te avisa con el PID y el nombre del proceso, pero no lo mata automáticamente — en Windows ese puerto también puede estar ocupado por el propio proceso de forwarding de Docker Desktop, y matarlo a ciegas tumba el motor de Docker entero (con cualquier sesión de WhatsApp activa en el worker). Verifica el nombre del proceso antes de cerrarlo: `Get-Process -Id <PID>`.

El AUTH KEY se muestra solamente cuando se crea la credencial.

## Conectar WhatsApp

1. Ingresa al panel.
2. Abre **WhatsApp**.
3. Crea o usa `WhatsApp Principal`.
4. Presiona **Conectar**.
5. Cuando aparezca `QR_PENDING`, abre **Ver QR**.
6. En el teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo.
7. El estado pasa a `CONNECTED`.

La sesión se persiste en PostgreSQL. Una caída de red normal debe provocar reconexión automática sin solicitar QR otra vez. `LOGGED_OUT` sí requiere una vinculación nueva.

## Equipo y agentes

Desde **Equipo y agentes** puedes crear usuarios, definir roles, crear departamentos y asignar miembros. En **Conversaciones** un agente puede tomar una conversación o transferirla a otro agente/departamento.

## API compatible con tu PHP actual

Este endpoint está diseñado para recibir el mismo `multipart/form-data` que genera `CURLOPT_POSTFIELDS` cuando PHP recibe un array:

```php
$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://TU-DOMINIO/api/create-message',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array(
    'appkey' => 'TU_APP_KEY',
    'authkey' => 'TU_AUTH_KEY',
    'to' => '51987654321',
    'message' => 'Gracias por su compra',
    'sandbox' => 'false'
  ),
));

$response = curl_exec($curl);
curl_close($curl);
echo $response;
```

Respuesta inmediata:

```json
{
  "success": true,
  "message_id": "uuid-del-mensaje",
  "status": "queued",
  "instance": "principal"
}
```

`queued` significa que BrainWSP aceptó y persistió el mensaje. El worker lo procesa de forma independiente.

## API v1 recomendada

### Texto

```http
POST /api/v1/messages/text
X-App-Key: APP_KEY
X-Auth-Key: AUTH_KEY
Content-Type: application/json
```

```json
{
  "to": "51987654321",
  "message": "Gracias por su compra",
  "instance": "principal"
}
```

### Documento / PDF

```http
POST /api/v1/messages/document
X-App-Key: APP_KEY
X-Auth-Key: AUTH_KEY
Content-Type: application/json
```

```json
{
  "to": "51987654321",
  "url": "https://erp.midominio.com/comprobantes/F001-00001234.pdf",
  "fileName": "F001-00001234.pdf",
  "mimeType": "application/pdf",
  "caption": "Adjuntamos su comprobante electrónico.",
  "instance": "principal"
}
```

### Consultar estado

```http
GET /api/v1/messages/{message_id}
X-App-Key: APP_KEY
X-Auth-Key: AUTH_KEY
```

Estados previstos:

```text
QUEUED -> PROCESSING -> SENT -> DELIVERED -> READ
                         \
                          -> FAILED
```

## Desarrollo sin Docker para Node

Levanta primero PostgreSQL y Redis, configura `.env`, y después:

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

## Diseño del Session Manager

Cada instancia posee un lease Redis:

```text
brainwsp:instance:{instanceId}:owner
```

Solo un worker puede tener el socket activo. El lease dura 30 segundos y se renueva cada 10 segundos.

Reconexión transitoria:

```text
1s -> 2s -> 4s -> 8s -> 16s -> 30s (máximo) + jitter
```

Casos especiales:

- `loggedOut`: no reconecta; solicita QR nuevo.
- `connectionReplaced`: detiene el socket para evitar dos dueños.
- `restartRequired`: reconecta rápidamente usando las mismas credenciales.
- pérdida de red / socket: reconexión automática.

## Estructura del repositorio

```text
brainwsp-platform/
├── apps/
│   ├── api/              NestJS
│   ├── worker/           Baileys + BullMQ
│   └── web/              Next.js
├── packages/
│   └── database/         Prisma schema + seed
├── docs/
├── scripts/
├── docker-compose.yml
├── .env.example
└── AGENTS.md
```

## Importante antes de producción

Este repositorio es una base profesional de MVP, pero antes de venderlo como servicio deben completarse como mínimo:

1. HTTPS y reverse proxy de producción.
2. Secret Manager y rotación de secretos.
3. Migraciones Prisma versionadas, en lugar de `db push` al arrancar.
4. Backup/restore automatizado de PostgreSQL.
5. Observabilidad (logs centralizados, métricas, alertas, uptime de sesiones).
6. Rate limits y cuotas por plan/API key.
7. Webhooks con firma HMAC y reintentos.
8. Descarga/almacenamiento de multimedia en S3/MinIO.
9. Pruebas E2E con un número WhatsApp dedicado.
10. Meta Cloud API como proveedor oficial para clientes que requieran canal oficial/SLA.

## Licencias y canal WhatsApp

Baileys implementa WhatsApp Web y no es una API oficial de Meta. El producto debe presentar el canal QR como una integración no oficial y reservar Meta Cloud API para escenarios que requieran soporte oficial.

## Despliegue local

Manual paso a paso (instalación rápida con Docker o entorno de desarrollo con Node.js, credenciales, verificación y problemas comunes): **[Instalación BrainWSP](https://claude.ai/code/artifact/440bbbc7-7514-451c-a545-399976417017)**.

## Despliegue en VPS

Antes de empezar, apunta el DNS de tu dominio (y el subdominio de la API) a la IP del VPS:

```text
tudominio.com       A   IP_DEL_VPS
api.tudominio.com   A   IP_DEL_VPS
```

Luego, en el VPS (Ubuntu, como root o con sudo):

```bash
apt-get update && apt-get install -y git
git clone https://github.com/Jhorimo/brainwsp.git
cd brainwsp
chmod +x deploy.sh
./deploy.sh tudominio.com
```

El script instala Docker, arma el proxy con SSL, genera credenciales seguras, construye las imágenes y levanta todo. Al final entrega la URL, el usuario y la contraseña del administrador (también quedan guardados en `../tudominio.com.txt`). Volver a correr el mismo comando actualiza el despliegue (`git pull` + rebuild) sin perder las credenciales existentes.

