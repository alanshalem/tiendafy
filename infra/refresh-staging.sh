#!/usr/bin/env bash
# Rehace la base de STAGING con una copia ANONIMIZADA de producción.
#
#   ./infra/refresh-staging.sh                 # último backup de producción
#   ./infra/refresh-staging.sh ruta/al.dump    # uno puntual
#
# Para qué: probar contra volumen y formas de datos reales — una migración que
# tarda dos minutos con diez pedidos puede tardar media hora con cincuenta mil.
#
# La copia NO se usa tal cual. Restaurar producción en staging sin anonimizar
# es la forma más común de mandarle un email a un cliente real desde un
# ambiente de prueba, y de tener claves de cobro donde no corresponde.
#
# Destruye lo que haya en staging. Eso es lo que se espera de staging.
set -euo pipefail

cd "$(dirname "$0")/docker"

ENV_FILE=".env.staging"
[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE." >&2; exit 1; }

DUMP="${1:-$(ls -t ./backups/prod/tiendafy-*.dump 2>/dev/null | head -1 || true)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || {
  echo "No encontré un backup. Pasá la ruta como argumento." >&2
  exit 1
}

stg() { docker compose -f docker-compose.stack.yml --env-file "$ENV_FILE" "$@"; }

echo "==> backup a usar: $DUMP"
echo "==> ESTO BORRA LA BASE DE STAGING. Ctrl+C para cancelar."
sleep 5

echo "==> bajando la app de staging (la base queda arriba)"
stg stop api storefront admin

echo "==> restaurando"
# --clean --if-exists deja la base como el dump, sin arrastrar tablas que ya
# no existan. El pg_restore devuelve != 0 por avisos sin importancia, así que
# lo que decide si salió bien es la verificación de más abajo.
stg exec -T postgres pg_restore -U tiendafy -d tiendafy --clean --if-exists --no-owner < "$DUMP" || true

echo "==> anonimizando"
stg exec -T postgres psql -q -U tiendafy -d tiendafy -v ON_ERROR_STOP=1 \
  -c "SET tiendafy.allow_anonymize = 'yes'" -f - < ../sql/anonymize-staging.sql

echo "==> verificando que no haya quedado nada real"
leftovers=$(stg exec -T postgres psql -U tiendafy -d tiendafy -tA -c "
  SELECT
    (SELECT count(*) FROM customers WHERE email IS NOT NULL AND email NOT LIKE '%@example.invalid')
  + (SELECT count(*) FROM orders WHERE buyer_email IS NOT NULL AND buyer_email NOT LIKE '%@example.invalid')
  + (SELECT count(*) FROM mp_connections)
  + (SELECT count(*) FROM fiscal_certificates);")

if [ "$(echo "$leftovers" | tr -d '[:space:]')" != "0" ]; then
  echo "PARÁ: quedaron datos reales sin anonimizar ($leftovers). No levanto staging." >&2
  exit 1
fi

echo "==> migraciones (el dump puede venir de una versión anterior)"
stg run --rm api dotnet Api.dll migrate

echo "==> levantando"
stg up -d
echo "Listo. Staging tiene los datos de producción, sin los datos de nadie."
