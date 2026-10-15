#!/usr/bin/env bash
# ¿El último backup se puede restaurar? Un backup que nunca se probó es una
# esperanza, no un backup. Restaura el dump más nuevo en una base aparte
# (tiendafy_restore_check) dentro del Postgres del ambiente, cuenta tablas y
# tiendas, revisa que el keyring del mismo día se pueda abrir, y la borra.
# No toca la base real.
#
#   ./infra/check-backup.sh prod
#
# Pensado para cron (semanal), en el crontab del usuario deploy:
#   0 7 * * 1  /srv/tiendafy/infra/check-backup.sh prod >> /srv/tiendafy/infra/docker/backups/check.log 2>&1
set -euo pipefail

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

APP_ENV="$(sed -n 's/^APP_ENV=//p' "$ENV_FILE" | tail -1)"
DIR="backups/$APP_ENV"
# El más nuevo por nombre (la fecha va en el nombre): los .tmp a medio
# escribir empiezan con punto y no entran.
DUMP="$(find "$DIR" -maxdepth 1 -name 'tiendafy-*.dump' -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
KEYS="$(find "$DIR" -maxdepth 1 -name 'dpkeys-*.tgz' -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -1 | cut -d' ' -f2-)"

echo "== $(date '+%F %T') $ENVIRONMENT"
[ -n "$DUMP" ] || {
  echo "FALLA: no hay ningún dump en $DIR" >&2
  exit 1
}
AGE_H=$((($(date +%s) - $(stat -c %Y "$DUMP")) / 3600))
echo "dump: $DUMP (hace ${AGE_H} h)"
[ "$AGE_H" -le 36 ] || echo "AVISO: el último dump tiene más de 36 h; ¿anda pg-backup?" >&2

PG_ID="$(compose ps -q postgres)"
[ -n "$PG_ID" ] || {
  echo "FALLA: Postgres no está corriendo." >&2
  exit 1
}
q() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$PG_ID" psql -U tiendafy -v ON_ERROR_STOP=1 -tA "$@"; }

trap 'q -d postgres -c "DROP DATABASE IF EXISTS tiendafy_restore_check WITH (FORCE)" > /dev/null 2>&1 || true' EXIT
q -d postgres -c "DROP DATABASE IF EXISTS tiendafy_restore_check WITH (FORCE)" > /dev/null
q -d postgres -c "CREATE DATABASE tiendafy_restore_check" > /dev/null
docker exec -i "$PG_ID" pg_restore -U tiendafy -d tiendafy_restore_check --exit-on-error < "$DUMP"

TABLES="$(q -d tiendafy_restore_check -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
TENANTS="$(q -d tiendafy_restore_check -c "SELECT count(*) FROM tenants")"
echo "restaurado: $TABLES tablas, $TENANTS tiendas"
[ "$TABLES" -gt 50 ] && [ "$TENANTS" -gt 0 ] || {
  echo "FALLA: la restauración salió vacía o incompleta." >&2
  exit 1
}

if [ -n "$KEYS" ] && tar tzf "$KEYS" | grep -q 'key-.*\.xml'; then
  echo "keyring: $KEYS ($(tar tzf "$KEYS" | grep -c 'key-.*\.xml') claves)"
else
  echo "FALLA: no hay copia legible del keyring (dpkeys-*.tgz) en $DIR." >&2
  exit 1
fi
echo "OK"
