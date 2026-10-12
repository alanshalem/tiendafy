#!/usr/bin/env bash
# Deploy de un ambiente. Corre EN EL SERVIDOR (lo llama GitHub Actions por SSH,
# o vos a mano si hace falta).
#
#   ./infra/deploy.sh staging sha-a1b2c3d
#   ./infra/deploy.sh prod    sha-a1b2c3d
#
# El tag es el mismo que se probó en staging: promover es volver a desplegar
# ESE tag, no volver a construir. Sin tag, usa el del archivo de variables.
#
# El orden importa: primero se traen las imágenes, después corren las
# migraciones con la imagen NUEVA y recién ahí se recambian los contenedores.
# Al revés, la app nueva arranca contra un esquema viejo y falla en producción
# en el peor momento posible.
set -euo pipefail

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

echo "==> $ENVIRONMENT — imágenes ${TAG_ARG:-(del $ENV_FILE)}"
compose pull

echo "==> migraciones"
compose run --rm api dotnet Api.dll migrate

echo "==> levantando"
compose up -d --remove-orphans

# Esperar a que la API responda antes de dar el deploy por bueno: si el
# contenedor arranca y se cae por config, el compose igual devuelve 0.
# Se pregunta desde el servidor, por el puerto publicado: la imagen de la API
# no trae wget ni curl.
API_ADDR="$(compose port api 5080 2>/dev/null || echo 127.0.0.1:5080)"
echo -n "==> esperando health "
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://$API_ADDR/health" 2>/dev/null; then
    echo "OK"
    compose ps
    exit 0
  fi
  echo -n "."
  sleep 3
done

echo " FALLÓ"
echo "La API no respondió. Últimas líneas del log:" >&2
compose logs --tail 40 api >&2
exit 1
