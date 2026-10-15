#!/usr/bin/env bash
# Pasa la base de un ambiente a la major de Postgres que pide el compose
# (16 → 18 la primera vez). Corre UNA vez, EN EL SERVIDOR, después del
# `git pull` que trae el compose nuevo y ANTES de ./infra/deploy.sh:
#
#   ./infra/pg-upgrade.sh prod
#   ./infra/deploy.sh prod sha-XXXXXXX
#
# Dump y restore en vez de pg_upgrade: la base es chica (minutos) y no hacen
# falta los binarios de las dos versiones en la misma imagen.
#
#   1. frena la API, la tienda y el backup (nadie escribe durante la copia);
#   2. cuenta las filas de cada tabla y hace un pg_dump del Postgres viejo;
#   3. reemplaza el contenedor por el de la major nueva, con un volumen NUEVO
#      (pgdata<major>): el volumen viejo queda intacto y es la vuelta atrás;
#   4. restaura, recalcula estadísticas y compara los conteos.
#
# No borra nada. Si falla, dice cómo volver atrás.
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  prod | staging) ;;
  *)
    echo "uso: $0 <prod|staging>" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/docker"
ENV_FILE=".env.$ENVIRONMENT"
[ -f "$ENV_FILE" ] || {
  echo "Falta $ENV_FILE." >&2
  exit 1
}
compose() { docker compose -f docker-compose.stack.yml --env-file "$ENV_FILE" "$@"; }
psql_in() { docker exec -i "$1" psql -U tiendafy -d tiendafy -v ON_ERROR_STOP=1 -tA "${@:2}"; }
APP_ENV="$(sed -n 's/^APP_ENV=//p' "$ENV_FILE" | tail -1)"

# Los backups los escribe pg-backup, que corre como root: la carpeta del
# ambiente queda de root y el usuario que corre esto (deploy) no puede escribir
# ahí. Se la devuelve con un contenedor del mismo servicio, que ya la monta
# (estar en el grupo docker alcanza, no hace falta sudo). pg-backup sigue
# escribiendo igual: corre como root.
backups_writable() {
  local dir="backups/$APP_ENV"
  mkdir -p "$dir" 2> /dev/null || true
  [ -w "$dir" ] && return 0
  echo "==> $dir es de root (la crea pg-backup): pasa a $(id -un)"
  compose run --rm --no-deps -T --entrypoint chown pg-backup -R "$(id -u):$(id -g)" /backups
  [ -w "$dir" ] || {
    echo "No pude dejar $dir escribible para $(id -un)." >&2
    return 1
  }
}

# Una línea "tabla filas" por tabla, ordenadas: se comparan antes y después.
COUNT_ROWS="SELECT format('SELECT %L, count(*) FROM %I.%I', table_schema || '.' || table_name, table_schema, table_name)
  FROM information_schema.tables
 WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY 1 \\gexec"

OLD_ID="$(compose ps -q postgres)"
[ -n "$OLD_ID" ] || {
  echo "No hay un Postgres corriendo en $ENVIRONMENT: nada que migrar." >&2
  exit 1
}
PROJECT="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$OLD_ID")"
OLD_VOLUME="$(docker inspect -f '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{end}}{{end}}' "$OLD_ID")"
OLD_MAJOR="$(psql_in "$OLD_ID" -c 'SHOW server_version_num' | cut -c1-2)"
# awk lee toda la lista (Postgres aparece dos veces: la base y el backup). Un
# `head -1` cortaría la lectura y `compose config` moriría de SIGPIPE: con
# pipefail, el script entero, y solo a veces (depende de quién escribe primero).
NEW_MAJOR="$(compose config --images | awk -F: '/^postgres:/ && !seen++ { split($2, v, "-"); print v[1] }')"
NEW_IMAGE="$(compose config --images | awk '/^postgres:/ && !seen++')"
NEW_VOLUME="${PROJECT}_pgdata${NEW_MAJOR}"

[ "$OLD_MAJOR" != "$NEW_MAJOR" ] || {
  echo "Ya corre Postgres $OLD_MAJOR, la que pide el compose: nada que hacer."
  exit 0
}
if docker volume inspect "$NEW_VOLUME" > /dev/null 2>&1; then
  echo "Ya existe el volumen $NEW_VOLUME (¿un intento anterior a medias?)." >&2
  echo "Si no tiene nada que importe: docker volume rm $NEW_VOLUME, y volver a correr." >&2
  exit 1
fi

backups_writable
WORK="backups/$APP_ENV/pg-upgrade-$(date +%Y%m%d-%H%M)"
mkdir -p "$WORK"
echo "==> $ENVIRONMENT: Postgres $OLD_MAJOR → $NEW_MAJOR (copia en infra/docker/$WORK)"

# Ensayo con la base andando: si los datos no entran en la major nueva (una
# fila huérfana hace fallar la clave foránea al restaurar), se sabe ACÁ, sin
# haber cortado nada, y no con el contenedor viejo ya reemplazado.
echo "==> ensayo: copia en caliente y restauración en un Postgres $NEW_MAJOR descartable"
docker exec "$OLD_ID" pg_dump -U tiendafy -d tiendafy -Fc > "$WORK/ensayo.dump"
TRIAL="$(docker run -d --rm -e POSTGRES_USER=tiendafy -e POSTGRES_PASSWORD=ensayo -e POSTGRES_DB=tiendafy \
  "$NEW_IMAGE")"
trap 'docker rm -f "$TRIAL" > /dev/null 2>&1 || true' EXIT
# Por TCP: durante la inicialización la imagen levanta un servidor temporal
# que solo escucha por socket, y por socket "listo" llegaría antes de tiempo.
for _ in $(seq 1 60); do
  docker exec "$TRIAL" pg_isready -h 127.0.0.1 -U tiendafy -q && break
  sleep 1
done
if ! docker exec -i "$TRIAL" pg_restore -U tiendafy -d tiendafy --exit-on-error < "$WORK/ensayo.dump"; then
  echo >&2
  echo "El ensayo falló (arriba, el error): la base no entra tal cual en Postgres $NEW_MAJOR." >&2
  echo "No se cortó nada: todo sigue andando con la $OLD_MAJOR. Ver docs/DEPLOY.md → Cambiar de major de Postgres." >&2
  exit 1
fi
docker rm -f "$TRIAL" > /dev/null
rm "$WORK/ensayo.dump"

echo "==> frenando la API, la tienda y el backup"
compose stop api storefront pg-backup
# Hasta reemplazar el contenedor, volver atrás es solo volver a prender.
trap 'echo "FALLÓ antes de tocar la base: vuelvo a prender todo." >&2; compose start api storefront pg-backup' ERR

echo "==> contando filas y copiando la base"
psql_in "$OLD_ID" -F ' ' > "$WORK/filas-antes.txt" <<< "$COUNT_ROWS"
docker exec "$OLD_ID" pg_dump -U tiendafy -d tiendafy -Fc > "$WORK/tiendafy.dump"
[ -s "$WORK/tiendafy.dump" ]
echo "    $(wc -l < "$WORK/filas-antes.txt") tablas, dump de $(du -h "$WORK/tiendafy.dump" | cut -f1)"

rollback_hint() {
  local change
  change="$(git log -1 --format=%h -S "pgdata$NEW_MAJOR" -- docker-compose.stack.yml 2> /dev/null || true)"
  cat >&2 << EOF

FALLÓ. La base vieja está intacta en el volumen $OLD_VOLUME. Para volver a como estaba
(desde infra/docker):
  git checkout ${change:-<commit del cambio de major>}^ -- docker-compose.stack.yml
  docker rm -f \$(docker compose -f docker-compose.stack.yml --env-file $ENV_FILE ps -aq postgres)
  docker compose -f docker-compose.stack.yml --env-file $ENV_FILE up -d
El volumen nuevo ($NEW_VOLUME) se puede borrar. La copia quedó en infra/docker/$WORK.
EOF
}
trap rollback_hint ERR

echo "==> reemplazando el contenedor (el volumen viejo no se toca)"
docker stop "$OLD_ID" > /dev/null
docker rm "$OLD_ID" > /dev/null
compose up -d --no-deps --wait postgres
NEW_ID="$(compose ps -q postgres)"
for _ in $(seq 1 60); do
  docker exec "$NEW_ID" pg_isready -h 127.0.0.1 -U tiendafy -q && break
  sleep 1
done

echo "==> restaurando"
docker exec -i "$NEW_ID" pg_restore -U tiendafy -d tiendafy --exit-on-error < "$WORK/tiendafy.dump"
docker exec "$NEW_ID" vacuumdb -U tiendafy -d tiendafy --analyze-only --quiet

echo "==> comparando filas"
psql_in "$NEW_ID" -F ' ' > "$WORK/filas-despues.txt" <<< "$COUNT_ROWS"
if ! diff "$WORK/filas-antes.txt" "$WORK/filas-despues.txt" >&2; then
  echo "Los conteos no coinciden (arriba, las diferencias)." >&2
  false
fi
trap - ERR

echo
echo "Listo: Postgres $(psql_in "$NEW_ID" -c 'SHOW server_version'), $(wc -l < "$WORK/filas-despues.txt") tablas con las mismas filas."
echo "La API y la tienda siguen frenadas. Ahora:"
echo "  ./infra/deploy.sh $ENVIRONMENT <tag>"
echo
echo "El volumen de la $OLD_MAJOR ($OLD_VOLUME) queda como respaldo. Cuando todo ande unos días:"
echo "  docker volume rm $OLD_VOLUME"
