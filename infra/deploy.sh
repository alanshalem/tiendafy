#!/usr/bin/env bash
# Deploy de un ambiente. Corre EN EL SERVIDOR (lo llama GitHub Actions por SSH,
# o vos a mano si hace falta).
#
#   ./infra/deploy.sh staging sha-a1b2c3d
#   ./infra/deploy.sh prod    sha-a1b2c3d
#
# El tag es el mismo que se probó en staging: promover es volver a desplegar
# ESE tag, no volver a construir. En staging, sin tag usa el del archivo de
# variables; en producción el tag es obligatorio y no puede ser "latest".
#
# El orden importa: primero se traen las imágenes, después se copia la base,
# corren las migraciones con la imagen NUEVA y recién ahí se recambian los
# contenedores. Al revés, la app nueva arranca contra un esquema viejo y falla
# en producción en el peor momento posible.
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
TAG_ARG="${2:-}"

case "$ENVIRONMENT" in
  prod | staging) ;;
  *)
    echo "uso: $0 <prod|staging> [tag]" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/docker"

ENV_FILE=".env.$ENVIRONMENT"
[ -f "$ENV_FILE" ] || {
  echo "Falta $ENV_FILE (copiar de $ENV_FILE.example y completar)." >&2
  exit 1
}

# El tag del argumento pisa al del archivo: en el shell gana el entorno.
[ -n "$TAG_ARG" ] && export TAG="$TAG_ARG"

compose() { docker compose -f docker-compose.stack.yml --env-file "$ENV_FILE" "$@"; }
# Tag de una imagen "registro/nombre:tag" (lo que va después de los últimos dos puntos).
tag_of() { echo "${1##*:}"; }

NEW_TAG="$(tag_of "$(compose config --images | awk '/-api:/ && !found { print; found = 1 }')")"
if [ "$ENVIRONMENT" = prod ] && { [ -z "$NEW_TAG" ] || [ "$NEW_TAG" = latest ]; }; then
  echo "En producción va un tag concreto, el que se probó: ./infra/deploy.sh prod sha-XXXXXXX" >&2
  echo "(\"latest\" es lo último de main y no deja saber a qué volver)." >&2
  exit 1
fi

# Cambio de major de Postgres: los datos de una major no arrancan con otra.
# Seguir de largo recrearía el contenedor con la imagen nueva y la base
# quedaría caída; la migración es un paso aparte, con su copia y su control.
PG_ID="$(compose ps -q postgres)"
if [ -n "$PG_ID" ]; then
  RUNNING_MAJOR="$(docker exec "$PG_ID" psql -U tiendafy -d tiendafy -tAc 'SHOW server_version_num' | cut -c1-2)"
  WANTED_MAJOR="$(compose config --images | sed -n 's/^postgres:\([0-9]*\).*/\1/p' | head -1)"
  if [ "$RUNNING_MAJOR" != "$WANTED_MAJOR" ]; then
    echo "Corre Postgres $RUNNING_MAJOR y el compose pide la $WANTED_MAJOR. Primero:" >&2
    echo "  ./infra/pg-upgrade.sh $ENVIRONMENT" >&2
    exit 1
  fi
fi

# Lo que corre ahora, para poder volver con un comando si algo sale mal.
API_ID="$(compose ps -q api)"
PREV_TAG=""
[ -n "$API_ID" ] && PREV_TAG="$(tag_of "$(docker inspect -f '{{.Config.Image}}' "$API_ID")")"
rollback_hint() {
  [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$NEW_TAG" ] || return 0
  echo "Para volver a lo que corría antes:  ./infra/deploy.sh $ENVIRONMENT $PREV_TAG" >&2
  [ -n "${PREDEPLOY_DUMP:-}" ] && echo "La base antes de las migraciones: infra/docker/$PREDEPLOY_DUMP" >&2
  return 0
}
trap 'echo "DEPLOY FALLÓ." >&2; rollback_hint' ERR

echo "==> $ENVIRONMENT: ${PREV_TAG:-(nada corriendo)} → $NEW_TAG"
# Solo las imágenes de la app. Postgres usa un tag de major (postgres:18-alpine):
# traerlo acá metería un cambio de versión de la base en cualquier deploy, con
# reinicio incluido. Se actualiza a propósito (docs/DEPLOY.md).
compose pull api storefront admin

# Copia de la base justo antes de migrar: un rollback de imagen no deshace una
# migración, y el backup diario puede tener casi 24 h. Mismo nombre que los
# diarios (tiendafy-*.dump), así entra en la misma retención.
if [ -n "$PG_ID" ]; then
  APP_ENV="$(sed -n 's/^APP_ENV=//p' "$ENV_FILE" | tail -1)"
  mkdir -p "backups/$APP_ENV"
  PREDEPLOY_DUMP="backups/$APP_ENV/tiendafy-predeploy-$(date +%Y%m%d-%H%M)-$NEW_TAG.dump"
  echo "==> copia de la base antes de migrar ($PREDEPLOY_DUMP)"
  docker exec "$PG_ID" pg_dump -U tiendafy -d tiendafy -Fc > "$PREDEPLOY_DUMP.tmp"
  mv "$PREDEPLOY_DUMP.tmp" "$PREDEPLOY_DUMP"
fi

echo "==> migraciones"
compose run --rm api dotnet Api.dll migrate

echo "==> levantando"
compose up -d --remove-orphans

# Esperar a que la API responda antes de dar el deploy por bueno: si el
# contenedor arranca y se cae por config, el compose igual devuelve 0.
# Se pregunta desde el servidor, por el puerto publicado: la imagen de la API
# no trae wget ni curl.
API_ADDR="$(compose port api 5080 2> /dev/null || echo 127.0.0.1:5080)"
echo -n "==> esperando la API "
api_ok=false
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://$API_ADDR/health" 2> /dev/null; then
    api_ok=true
    break
  fi
  echo -n "."
  sleep 3
done
if [ "$api_ok" != true ]; then
  echo " FALLÓ"
  echo "La API no respondió. Últimas líneas del log:" >&2
  compose logs --tail 40 api >&2
  rollback_hint
  exit 1
fi
echo "OK"

# La tienda y el panel: alcanza con que contesten algo que no sea un error del
# servidor (por IP, la tienda no sabe qué comercio es y contesta su 404).
for svc in storefront:3000 admin:8080; do
  addr="$(compose port "${svc%%:*}" "${svc##*:}" 2> /dev/null || true)"
  [ -n "$addr" ] || continue
  code="000"
  for _ in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://$addr/" 2> /dev/null || true)"
    [ "$code" != "000" ] && [ "$code" -lt 500 ] && break
    sleep 2
  done
  if [ "$code" = "000" ] || [ "$code" -ge 500 ]; then
    echo "==> ${svc%%:*} no responde bien (HTTP $code). Log:" >&2
    compose logs --tail 40 "${svc%%:*}" >&2
    rollback_hint
    exit 1
  fi
  echo "==> ${svc%%:*} OK (HTTP $code)"
done

compose ps
[ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$NEW_TAG" ] && echo "Si algo no anda: ./infra/deploy.sh $ENVIRONMENT $PREV_TAG"
exit 0
