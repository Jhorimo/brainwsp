#!/bin/bash
# ============================================================
# MAPA DEL SERVIDOR - solo lectura
# Uso:  mapa.sh          -> reporte de texto
#       mapa.sh --json   -> salida JSON (para una web futura)
# ============================================================

JSON_MODE=false
[ "$1" = "--json" ] && JSON_MODE=true

PROXY=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i proxy | head -1)
IP_PUB=$(curl -s -m 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

# ---------- helpers ----------
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# nombre de contenedor a partir de una IP interna
cont_por_ip() {
    local ip="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | while read -r c; do
        docker inspect "$c" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null \
          | grep -qw "$ip" && echo "$c" && return
    done | head -1
}

# ---------- recoleccion ----------
recolectar_vhosts() {
    # devuelve: dominio|contenedor|puerto|estado
    docker ps --format '{{.Names}}' 2>/dev/null | while read -r c; do
        vh=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^VIRTUAL_HOST=' | cut -d= -f2-)
        [ -z "$vh" ] && continue
        vp=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^VIRTUAL_PORT=' | cut -d= -f2-)
        [ -z "$vp" ] && vp=$(docker inspect "$c" --format '{{range $p, $v := .Config.ExposedPorts}}{{$p}} {{end}}' 2>/dev/null | tr ' ' '\n' | head -1 | cut -d/ -f1)
        [ -z "$vp" ] && vp="?"
        echo "$vh" | tr ',' '\n' | while read -r d; do
            d=$(echo "$d" | xargs)
            [ -z "$d" ] && continue
            estado="ok"
            if [ -n "$PROXY" ]; then
                docker exec "$PROXY" grep -A6 "^upstream $d {" /etc/nginx/conf.d/default.conf 2>/dev/null \
                  | grep -q " down;" && estado="CAIDO"
            fi
            echo "$d|$c|$vp|$estado"
        done
    done
}

ssl_dias() {
    local dom="$1" f="/etc/letsencrypt/live/$dom/cert.pem"
    [ -f "$f" ] || { echo "-"; return; }
    local fin; fin=$(openssl x509 -enddate -noout -in "$f" 2>/dev/null | cut -d= -f2)
    [ -z "$fin" ] && { echo "-"; return; }
    echo $(( ( $(date -d "$fin" +%s) - $(date +%s) ) / 86400 ))
}

# ============================================================
#                        SALIDA JSON
# ============================================================
if $JSON_MODE; then
    printf '{\n'
    printf '  "generado": "%s",\n' "$(date -Iseconds)"
    printf '  "host": {"nombre": "%s", "ip": "%s", "so": "%s", "kernel": "%s", "uptime": "%s"},\n' \
        "$(hostname)" "$IP_PUB" "$(. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME")" "$(uname -r)" "$(uptime -p 2>/dev/null)"

    read -r tot usa lib <<< "$(free -m | awk '/^Mem:/{print $2, $3, $7}')"
    swp=$(free -m | awk '/^Swap:/{print $2}')
    printf '  "memoria_mb": {"total": %s, "usada": %s, "disponible": %s, "swap": %s},\n' "$tot" "$usa" "$lib" "$swp"

    read -r dtot duso dlib dpct <<< "$(df -BG --output=size,used,avail,pcent / | tail -1 | tr -d 'G%')"
    printf '  "disco_gb": {"total": %s, "usado": %s, "libre": %s, "porcentaje": %s},\n' "$dtot" "$duso" "$dlib" "$dpct"
    printf '  "cpu": {"nucleos": %s, "carga": "%s"},\n' "$(nproc)" "$(cut -d' ' -f1-3 /proc/loadavg)"

    # sitios
    printf '  "sitios": [\n'
    primero=true
    while IFS='|' read -r dom cont puerto estado; do
        [ -z "$dom" ] && continue
        $primero || printf ',\n'; primero=false
        printf '    {"dominio": "%s", "contenedor": "%s", "puerto": "%s", "estado": "%s", "ssl_dias_restantes": "%s"}' \
            "$(esc "$dom")" "$(esc "$cont")" "$puerto" "$estado" "$(ssl_dias "$dom")"
    done < <(recolectar_vhosts)
    printf '\n  ],\n'

    # puertos publicos
    printf '  "puertos_publicos": [\n'
    primero=true
    while read -r linea; do
        [ -z "$linea" ] && continue
        p=$(echo "$linea" | awk '{print $5}' | sed 's/.*://')
        proc=$(echo "$linea" | grep -oP 'users:\(\("\K[^"]+' | head -1)
        dir=$(echo "$linea" | awk '{print $5}' | sed 's/:[0-9]*$//')
        exp="interno"; [ "$dir" = "0.0.0.0" ] || [ "$dir" = "[::]" ] || [ "$dir" = "*" ] && exp="INTERNET"
        $primero || printf ',\n'; primero=false
        printf '    {"puerto": "%s", "proceso": "%s", "expuesto": "%s"}' "$p" "$(esc "$proc")" "$exp"
    done < <(ss -tlnp 2>/dev/null | tail -n +2)
    printf '\n  ],\n'

    # contenedores
    printf '  "contenedores": [\n'
    primero=true
    while read -r nombre; do
        [ -z "$nombre" ] && continue
        img=$(docker inspect "$nombre" --format '{{.Config.Image}}' 2>/dev/null)
        est=$(docker inspect "$nombre" --format '{{.State.Status}}' 2>/dev/null)
        sal=$(docker inspect "$nombre" --format '{{.State.Health.Status}}' 2>/dev/null)
        [ "$sal" = "<no value>" ] && sal="sin-healthcheck"
        redes=$(docker inspect "$nombre" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}},{{end}}' 2>/dev/null | sed 's/,$//')
        mem=$(docker stats --no-stream --format '{{.MemUsage}}' "$nombre" 2>/dev/null | cut -d/ -f1 | xargs)
        codigo=$(docker inspect "$nombre" --format \
          '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}=>{{.Destination}} {{end}}{{end}}' 2>/dev/null \
          | tr ' ' '\n' | grep -E '=>(/var/www|/app|/usr/src|/srv)' | head -1)
        if [ -n "$codigo" ]; then
            modo="manual"; ubic=$(echo "$codigo" | cut -d'=' -f1)
        elif echo "$img" | grep -qiE '^(postgres|redis|mysql|mariadb|mongo|minio/|memcached|rabbitmq|nginx:)'; then
            modo="base"; ubic=""
        else
            modo="imagen"; ubic="$img"
        fi
        $primero || printf ',\n'; primero=false
        printf '    {"nombre": "%s", "imagen": "%s", "estado": "%s", "salud": "%s", "redes": "%s", "memoria": "%s", "modo_despliegue": "%s", "codigo_en": "%s"}' \
            "$(esc "$nombre")" "$(esc "$img")" "$est" "$sal" "$(esc "$redes")" "$(esc "$mem")" "$modo" "$(esc "$ubic")"
    done < <(docker ps --format '{{.Names}}' 2>/dev/null)
    printf '\n  ],\n'

    # volumenes
    printf '  "volumenes": [\n'
    primero=true
    while read -r v; do
        [ -z "$v" ] && continue
        ruta=$(docker volume inspect "$v" --format '{{.Mountpoint}}' 2>/dev/null)
        tam=$(du -sh "$ruta" 2>/dev/null | cut -f1)
        usado=$(docker ps -a --filter "volume=$v" --format '{{.Names}}' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        $primero || printf ',\n'; primero=false
        printf '    {"nombre": "%s", "ruta": "%s", "tamano": "%s", "usado_por": "%s"}' \
            "$(esc "$v")" "$(esc "$ruta")" "${tam:-?}" "$(esc "$usado")"
    done < <(docker volume ls -q 2>/dev/null)
    printf '\n  ],\n'

    # proyectos
    printf '  "proyectos": [\n'
    primero=true
    while read -r g; do
        [ -z "$g" ] && continue
        d=$(dirname "$g")
        rem=$(git -C "$d" remote get-url origin 2>/dev/null)
        ram=$(git -C "$d" branch --show-current 2>/dev/null)
        tam=$(du -sh "$d" 2>/dev/null | cut -f1)
        $primero || printf ',\n'; primero=false
        printf '    {"ruta": "%s", "repositorio": "%s", "rama": "%s", "tamano": "%s"}' \
            "$(esc "$d")" "$(esc "$rem")" "$(esc "$ram")" "$tam"
    done < <(find /root /home /var/www /opt -maxdepth 4 -name .git -type d 2>/dev/null)
    printf '\n  ]\n'
    printf '}\n'
    exit 0
fi

# ============================================================
#                       SALIDA DE TEXTO
# ============================================================
B=$(printf '\033[1m'); N=$(printf '\033[0m')
R=$(printf '\033[31m'); G=$(printf '\033[32m'); Y=$(printf '\033[33m'); C=$(printf '\033[36m')

echo
echo "${B}================================================================${N}"
echo "${B}  MAPA DEL SERVIDOR  ·  $(hostname)  ·  $(date '+%Y-%m-%d %H:%M')${N}"
echo "${B}================================================================${N}"

# ---------- 1. RESUMEN ----------
echo
echo "${B}${C}[1] RESUMEN DEL SERVIDOR${N}"
echo "-----------------------------------------------------------------"
. /etc/os-release 2>/dev/null
printf "  %-18s %s\n" "IP publica:"  "$IP_PUB"
printf "  %-18s %s\n" "Sistema:"     "$PRETTY_NAME"
printf "  %-18s %s\n" "Kernel:"      "$(uname -r)"
printf "  %-18s %s\n" "Encendido:"   "$(uptime -p 2>/dev/null)"
printf "  %-18s %s nucleos  ·  carga: %s\n" "CPU:" "$(nproc)" "$(cut -d' ' -f1-3 /proc/loadavg)"
free -h | awk '/^Mem:/{printf "  %-18s %s total  ·  %s usada  ·  %s disponible\n","RAM:",$2,$3,$7}'
free -h | awk '/^Swap:/{printf "  %-18s %s\n","Swap:",($2=="0B"?"NO CONFIGURADO":$2)}'
df -h / | awk 'NR==2{printf "  %-18s %s total  ·  %s usado (%s)  ·  %s libre\n","Disco:",$2,$3,$5,$4}'

# ---------- 2. MAPA DE TRAFICO ----------
echo
echo "${B}${C}[2] MAPA DE TRAFICO  (como llega un visitante a tu codigo)${N}"
echo "-----------------------------------------------------------------"
echo
echo "   INTERNET"
echo "      |"
echo "   ${B}$IP_PUB${N}"
echo "      |"
echo "      +-- :80 / :443  -->  ${B}${PROXY:-sin proxy}${N}  (reparte por dominio)"
echo "      |"

recolectar_vhosts | sort | while IFS='|' read -r dom cont puerto estado; do
    [ -z "$dom" ] && continue
    dias=$(ssl_dias "$dom")
    if [ "$estado" = "CAIDO" ]; then marca="${R}[CAIDO]${N}"; else marca="${G}[ok]${N}"; fi
    if [ "$dias" = "-" ]; then ssl="${Y}sin SSL${N}"
    elif [ "$dias" -lt 15 ] 2>/dev/null; then ssl="${R}SSL ${dias}d${N}"
    else ssl="SSL ${dias}d"; fi
    printf "      +--> %-28s --> %-22s :%-5s %s  %s\n" "$dom" "$cont" "$puerto" "$marca" "$ssl"
done

echo "      |"
ss -tlnp 2>/dev/null | tail -n +2 | while read -r l; do
    p=$(echo "$l" | awk '{print $5}' | sed 's/.*://')
    dir=$(echo "$l" | awk '{print $5}' | sed 's/:[0-9]*$//')
    proc=$(echo "$l" | grep -oP 'users:\(\("\K[^"]+' | head -1)
    case "$p" in 80|443|22) continue;; esac
    if [ "$dir" = "0.0.0.0" ] || [ "$dir" = "[::]" ]; then
        printf "      +-- :%-6s %s  ${R}<-- EXPUESTO A INTERNET${N}\n" "$p" "$proc"
    fi
done
echo

# ---------- 3. CONTENEDORES ----------
echo "${B}${C}[3] CONTENEDORES${N}"
echo "-----------------------------------------------------------------"
printf "  %-22s %-30s %-10s %s\n" "NOMBRE" "IMAGEN" "SALUD" "RAM"
docker ps --format '{{.Names}}' 2>/dev/null | sort | while read -r c; do
    img=$(docker inspect "$c" --format '{{.Config.Image}}' 2>/dev/null | cut -c1-30)
    sal=$(docker inspect "$c" --format '{{.State.Health.Status}}' 2>/dev/null)
    [ "$sal" = "<no value>" ] && sal="-"
    mem=$(docker stats --no-stream --format '{{.MemUsage}}' "$c" 2>/dev/null | cut -d/ -f1 | xargs)
    printf "  %-22s %-30s %-10s %s\n" "$c" "$img" "$sal" "$mem"
done

# ---------- 3b. MODO DE DESPLIEGUE ----------
echo
echo "${B}${C}[3b] MODO DE DESPLIEGUE  (como actualizas cada uno)${N}"
echo "-----------------------------------------------------------------"
echo "  ${B}MANUAL${N} = codigo en el host, se despliega con git pull"
echo "  ${B}IMAGEN${N} = codigo dentro de la imagen, requiere rebuild (CI)"
echo "  ${B}BASE  ${N} = servicio de infraestructura, sin codigo tuyo"
echo
printf "  %-22s %-8s %s\n" "CONTENEDOR" "MODO" "DONDE VIVE EL CODIGO"
docker ps --format '{{.Names}}' 2>/dev/null | sort | while read -r c; do
    img=$(docker inspect "$c" --format '{{.Config.Image}}' 2>/dev/null)
    # buscar bind mount que parezca codigo
    codigo=$(docker inspect "$c" --format \
      '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}=>{{.Destination}} {{end}}{{end}}' 2>/dev/null \
      | tr ' ' '\n' | grep -E '=>(/var/www|/app|/usr/src|/srv|/var/www/html)' | head -1)
    if [ -n "$codigo" ]; then
        modo="MANUAL"; ubic=$(echo "$codigo" | cut -d'=' -f1)
    elif echo "$img" | grep -qiE '^(postgres|redis|mysql|mariadb|mongo|minio/|memcached|rabbitmq|nginx:)'; then
        modo="BASE";   ubic="(sin codigo propio)"
    else
        modo="IMAGEN"; ubic="dentro de $img"
    fi
    case "$modo" in
        MANUAL) col="$G";;
        IMAGEN) col="$C";;
        *)      col="";;
    esac
    printf "  %-22s ${col}%-8s${N} %s\n" "$c" "$modo" "$(echo "$ubic" | cut -c1-45)"
done

# ---------- 4. REDES ----------
echo
echo "${B}${C}[4] REDES DOCKER  (quien puede hablar con quien)${N}"
echo "-----------------------------------------------------------------"
docker network ls --format '{{.Name}}' 2>/dev/null | grep -vE '^(host|none)$' | while read -r red; do
    miembros=$(docker network inspect "$red" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)
    [ -z "$(echo "$miembros" | xargs)" ] && continue
    echo "  ${B}$red${N}"
    for m in $miembros; do echo "      - $m"; done
done

# ---------- 5. ALMACENAMIENTO ----------
echo
echo "${B}${C}[5] ALMACENAMIENTO  (donde viven los datos)${N}"
echo "-----------------------------------------------------------------"
printf "  %-38s %-8s %s\n" "VOLUMEN" "TAMANO" "USADO POR"
docker volume ls -q 2>/dev/null | while read -r v; do
    ruta=$(docker volume inspect "$v" --format '{{.Mountpoint}}' 2>/dev/null)
    tam=$(du -sh "$ruta" 2>/dev/null | cut -f1)
    usa=$(docker ps -a --filter "volume=$v" --format '{{.Names}}' 2>/dev/null | tr '\n' ' ')
    printf "  %-38s %-8s %s\n" "$(echo "$v" | cut -c1-38)" "${tam:-?}" "${usa:-(huerfano)}"
done

# ---------- 6. PROYECTOS ----------
echo
echo "${B}${C}[6] PROYECTOS EN DISCO${N}"
echo "-----------------------------------------------------------------"
find /root /home /var/www /opt -maxdepth 4 -name .git -type d 2>/dev/null | while read -r g; do
    d=$(dirname "$g")
    printf "  ${B}%s${N}  (%s)\n" "$d" "$(du -sh "$d" 2>/dev/null | cut -f1)"
    printf "      repo:  %s\n" "$(git -C "$d" remote get-url origin 2>/dev/null || echo 'sin remoto')"
    printf "      rama:  %s\n" "$(git -C "$d" branch --show-current 2>/dev/null)"
done

# ---------- 7. SSL ----------
echo
echo "${B}${C}[7] CERTIFICADOS SSL${N}"
echo "-----------------------------------------------------------------"
if [ -d /etc/letsencrypt/live ]; then
    for d in /etc/letsencrypt/live/*/; do
        dom=$(basename "$d"); [ "$dom" = "*" ] && continue
        dias=$(ssl_dias "$dom")
        if [ "$dias" = "-" ]; then est="${Y}?${N}"
        elif [ "$dias" -lt 15 ] 2>/dev/null; then est="${R}RENOVAR YA${N}"
        elif [ "$dias" -lt 30 ] 2>/dev/null; then est="${Y}pronto${N}"
        else est="${G}ok${N}"; fi
        printf "  %-32s %4s dias  %s\n" "$dom" "$dias" "$est"
    done
else
    echo "  (sin certbot)"
fi

# ---------- 8. ALERTAS ----------
echo
echo "${B}${C}[8] ALERTAS${N}"
echo "-----------------------------------------------------------------"
alertas=0
ss -tlnp 2>/dev/null | tail -n +2 | while read -r l; do
    p=$(echo "$l" | awk '{print $5}' | sed 's/.*://')
    dir=$(echo "$l" | awk '{print $5}' | sed 's/:[0-9]*$//')
    case "$p" in 80|443|22) continue;; esac
    if [ "$dir" = "0.0.0.0" ] || [ "$dir" = "[::]" ]; then
        echo "  ${R}[!]${N} Puerto $p abierto a todo internet"
    fi
done
[ "$(free -m | awk '/^Swap:/{print $2}')" = "0" ] && echo "  ${Y}[!]${N} Sin swap configurado"
ufw status 2>/dev/null | grep -qi inactive && echo "  ${Y}[!]${N} Firewall (ufw) desactivado"
systemctl is-active fail2ban >/dev/null 2>&1 || echo "  ${Y}[!]${N} fail2ban no activo"
recolectar_vhosts | grep -q "CAIDO" && echo "  ${R}[!]${N} Hay sitios con upstream CAIDO (502)"
df -h / | awk 'NR==2{gsub("%","",$5); if ($5+0 > 85) print "  [!] Disco al "$5"%"}'
docker ps --format '{{.Names}}' 2>/dev/null | while read -r c; do
    docker inspect "$c" --format '{{.HostConfig.Privileged}}' 2>/dev/null | grep -q true \
      && echo "  ${Y}[!]${N} Contenedor '$c' corre en modo privileged"
done

echo
echo "${B}================================================================${N}"
echo "  Para JSON:  $0 --json"
echo "${B}================================================================${N}"
echo
