#!/bin/bash
set -e

# ============================================================
# BrainWSP - script de despliegue en servidor
#
# Uso:
#   sudo ./deploy.sh tu-dominio.com
#   sudo ./deploy.sh tu-dominio.com api.tu-dominio.com
#
# Primera corrida: instala Docker, arma el proxy compartido
# (mismo patrón que usas en tus otros proyectos: rash07/nginx-proxy
# + red "proxynet" + certbot), clona el repo, genera secretos y
# levanta todo. Si lo vuelves a correr sobre una instalación
# existente, hace git pull + rebuild + restart (redeploy).
# ============================================================

# ===== PARÁMETROS =====
HOST=${1:-'dominio'}
API_HOST=${2:-"api.$HOST"}
GIT_REPO='https://github.com/Jhorimo/brainwsp.git'
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if [ "$HOST" = "dominio" ]; then
    echo "No ha ingresado dominio. Uso: ./deploy.sh tu-dominio.com [api.tu-dominio.com]"
    exit 1
fi

# Si el script se corre desde dentro de un checkout de BrainWSP (lo normal, ya que
# vive en el repo), se despliega ESE checkout con git pull. Si se descargó suelto en
# una carpeta vacía de operaciones, clona el repo en una subcarpeta.
if [ -f "$SCRIPT_DIR/apps/api/package.json" ]; then
    PATH_INSTALL=$(dirname "$SCRIPT_DIR")
    REPO_DIR="$SCRIPT_DIR"
else
    PATH_INSTALL=$SCRIPT_DIR
    REPO_DIR="$PATH_INSTALL/brainwsp"
fi

gen_secret() { head /dev/urandom | tr -dc A-Za-z0-9 | head -c "$1" ; echo '' ; }

# ===== BOOTSTRAP DEL SERVIDOR (idempotente) =====
if ! command -v docker &> /dev/null; then
    echo "Actualizando sistema"
    apt-get -y update

    echo "Instalando git y certbot"
    apt-get -y install git-core apt-transport-https ca-certificates curl gnupg-agent software-properties-common letsencrypt ufw

    echo "Instalando Docker"
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    apt-get -y update
    apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker

    echo "Configurando firewall (solo SSH, HTTP y HTTPS quedan expuestos al público)"
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
else
    echo "Docker ya está instalado, se omite el bootstrap"
fi

mkdir -p "$PATH_INSTALL/certs"
docker network inspect proxynet >/dev/null 2>&1 || docker network create proxynet

# ===== PROXY COMPARTIDO (mismo que usas en tus otros proyectos) =====
if [ ! -d "$PATH_INSTALL/proxy" ]; then
    echo "Configurando proxy"
    mkdir -p "$PATH_INSTALL/proxy"
    cat << EOF > "$PATH_INSTALL/proxy/docker-compose.yml"
version: '3'

services:
    proxy:
        image: rash07/nginx-proxy:2.0
        ports:
            - "80:80"
            - "443:443"
        volumes:
            - ./../certs:/etc/nginx/certs
            - /var/run/docker.sock:/tmp/docker.sock:ro
        restart: always
        privileged: true
networks:
    default:
        external:
            name: proxynet
EOF
    (cd "$PATH_INSTALL/proxy" && docker compose up -d)
else
    echo "El proxy compartido ya existe, se omite"
fi

# ===== CLONAR O ACTUALIZAR EL PROYECTO =====
FIRST_RUN=false
if [ ! -d "$REPO_DIR" ]; then
    FIRST_RUN=true
    echo "Clonando BrainWSP"
    git clone "$GIT_REPO" "$REPO_DIR"
else
    echo "Actualizando BrainWSP"
    (cd "$REPO_DIR" && git pull)
fi

cd "$REPO_DIR"

# ===== .env (solo se genera la primera vez, para no perder credenciales ya usadas) =====
if [ ! -f .env ]; then
    echo "Generando .env con credenciales nuevas"
    cp .env.example .env

    JWT_SECRET=$(gen_secret 64)
    PEPPER=$(gen_secret 32)
    ENCRYPTION_KEY=$(gen_secret 32)
    POSTGRES_PASSWORD=$(gen_secret 24)
    MINIO_PASSWORD=$(gen_secret 24)
    ADMIN_PASSWORD=$(gen_secret 12)
    SUPERADMIN_PASSWORD=$(gen_secret 12)

    read -p "Nombre de la empresa (para el usuario administrador inicial): " company_name
    company_name=${company_name:-'Mi Empresa'}
    admin_email="admin@$HOST"

    sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT_SECRET#" .env
    sed -i "s#^CREDENTIAL_HASH_PEPPER=.*#CREDENTIAL_HASH_PEPPER=$PEPPER#" .env
    sed -i "s#^CREDENTIAL_ENCRYPTION_KEY=.*#CREDENTIAL_ENCRYPTION_KEY=$ENCRYPTION_KEY#" .env
    sed -i "s#^WEB_ORIGIN=.*#WEB_ORIGIN=https://$HOST#" .env
    sed -i "s#^NEXT_PUBLIC_API_URL=.*#NEXT_PUBLIC_API_URL=https://$API_HOST/api#" .env
    sed -i "s#^NEXT_PUBLIC_SOCKET_URL=.*#NEXT_PUBLIC_SOCKET_URL=https://$API_HOST#" .env
    sed -i "s#^SEED_COMPANY_NAME=.*#SEED_COMPANY_NAME=$company_name#" .env
    sed -i "s#^SEED_COMPANY_SLUG=.*#SEED_COMPANY_SLUG=$(echo "$company_name" | tr '[:upper:] ' '[:lower:]-')#" .env
    sed -i "s#^SEED_ADMIN_NAME=.*#SEED_ADMIN_NAME=Administrador#" .env
    sed -i "s#^SEED_ADMIN_EMAIL=.*#SEED_ADMIN_EMAIL=$admin_email#" .env
    sed -i "s#^SEED_ADMIN_PASSWORD=.*#SEED_ADMIN_PASSWORD=$ADMIN_PASSWORD#" .env
    sed -i "s#^SEED_SUPERADMIN_EMAIL=.*#SEED_SUPERADMIN_EMAIL=superadmin@$HOST#" .env
    sed -i "s#^SEED_SUPERADMIN_PASSWORD=.*#SEED_SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD#" .env

    cat << EOF >> .env

# Generado por deploy.sh — usados por docker-compose.prod.yml
HOST=$HOST
API_HOST=$API_HOST
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
MINIO_ACCESS_KEY=brainwsp
MINIO_SECRET_KEY=$MINIO_PASSWORD

# Orígenes extra (además de https://\$HOST) que el API debe aceptar por CORS/WebSocket,
# separados por coma. Ej: https://otra-app.com,https://otra-app2.com
EXTRA_WEB_ORIGINS=

# Agente IA (opcional): pon tu API key aquí cuando quieras activarlo.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
EOF
else
    echo ".env ya existe, se conservan las credenciales actuales"
    # Variables nuevas que versiones anteriores de .env no tenían: si falta, se
    # genera ahora. Sin esto, una actualización silenciosamente cae al valor
    # por defecto inseguro definido en el código (ver apps/api/src/common/utils/secret.ts).
    if ! grep -q "^CREDENTIAL_ENCRYPTION_KEY=" .env; then
        echo "Agregando CREDENTIAL_ENCRYPTION_KEY (variable nueva) a .env existente"
        echo "CREDENTIAL_ENCRYPTION_KEY=$(gen_secret 32)" >> .env
    fi
    if ! grep -q "^EXTRA_WEB_ORIGINS=" .env; then
        echo "Agregando EXTRA_WEB_ORIGINS (variable nueva) a .env existente"
        echo "EXTRA_WEB_ORIGINS=" >> .env
    fi
fi

# ===== OVERRIDE DE PRODUCCIÓN (routing del proxy + credenciales reales) =====
echo "Generando docker-compose.prod.yml"
cat << 'EOF' > docker-compose.prod.yml
services:
    postgres:
        environment:
            POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    minio:
        environment:
            MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
            MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    api:
        environment:
            DATABASE_URL: postgresql://brainwsp:${POSTGRES_PASSWORD}@postgres:5432/brainwsp?schema=public
            WEB_ORIGIN: https://${HOST},${EXTRA_WEB_ORIGINS}
            VIRTUAL_HOST: ${API_HOST}
            VIRTUAL_PORT: 4000
            CERT_NAME: ${HOST}
    worker:
        environment:
            DATABASE_URL: postgresql://brainwsp:${POSTGRES_PASSWORD}@postgres:5432/brainwsp?schema=public
    web:
        build:
            args:
                NEXT_PUBLIC_API_URL: https://${API_HOST}/api
                NEXT_PUBLIC_SOCKET_URL: https://${API_HOST}
        environment:
            NEXT_PUBLIC_API_URL: https://${API_HOST}/api
            NEXT_PUBLIC_SOCKET_URL: https://${API_HOST}
            VIRTUAL_HOST: ${HOST}
            VIRTUAL_PORT: 3000
            CERT_NAME: ${HOST}
EOF

# ===== BUILD Y ARRANQUE =====
echo "Construyendo y levantando contenedores (puede tardar varios minutos la primera vez)"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# El esquema de base de datos y el usuario administrador se crean solos al iniciar
# el contenedor "api" (ver CMD en apps/api/Dockerfile: prisma migrate deploy + seed).
# Las migraciones pendientes viven en packages/database/migrations/ y se generan con
# `npm run db:migrate` (ver AGENTS.md) — deben commitearse junto al cambio de schema.prisma.
echo "Esperando a que la API prepare la base de datos..."
sleep 15
docker compose logs api --tail 40

# ===== SSL GRATUITO =====
if [ "$FIRST_RUN" = true ] || [ ! -f /etc/letsencrypt/live/$HOST/privkey.pem ]; then
    read -p "¿Instalar SSL gratuito con Let's Encrypt ahora? si[s] no[n]: " ssl
    if [ "$ssl" = "s" ]; then
        echo "--IMPORTANTE--"
        echo "Copia los registros TXT sin usar [ctrl+c] (cancela el proceso)."
        echo "Necesitas crear los TXT en el DNS de $HOST antes de continuar."
        certbot certonly --manual -d "*.$HOST" -d "$HOST" --agree-tos --no-bootstrap --manual-public-ip-logging-ok --preferred-challenges dns-01 --server https://acme-v02.api.letsencrypt.org/directory

        if [ ! -f /etc/letsencrypt/live/$HOST/privkey.pem ]; then
            echo "No se generó el certificado."
        else
            cp /etc/letsencrypt/live/$HOST/privkey.pem "$PATH_INSTALL/certs/$HOST.key"
            cp /etc/letsencrypt/live/$HOST/fullchain.pem "$PATH_INSTALL/certs/$HOST.crt"
            (cd "$PATH_INSTALL/proxy" && docker compose restart)
            echo "SSL activo para $HOST y $API_HOST (cubiertos por el mismo comodín)."
        fi
    fi
fi

# ===== RESUMEN =====
SUMMARY="$PATH_INSTALL/$HOST.txt"
cat << EOF | tee "$SUMMARY"

============================================================
BrainWSP desplegado
============================================================
Ruta del proyecto: $REPO_DIR
Panel:             https://$HOST
API / Swagger:     https://$API_HOST/docs
------------------------------------------------------------
Usuario admin:     $(grep '^SEED_ADMIN_EMAIL=' .env | cut -d= -f2)
Contraseña admin:  $(grep '^SEED_ADMIN_PASSWORD=' .env | cut -d= -f2)
------------------------------------------------------------
Para actualizar en el futuro, vuelve a correr:
  cd $PATH_INSTALL && ./deploy.sh $HOST $API_HOST
============================================================
EOF
echo "Resumen guardado en $SUMMARY"
