#!/usr/bin/env bash
# El freno de deploy.sh que impide que staging use los buckets de producción.
# Antes comparaba el texto crudo del archivo, y se esquivaba con el formato del
# valor (comillas, CRLF, un comentario al final) que compose sí resuelve.
#
#   bash infra/tests/deploy-buckets.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
deploy="$here/../deploy.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# Que no se cuele lo que haya en el shell de quien lo corre.
unset MEDIA_BUCKET MEDIA_PRIVATE_BUCKET

# Las dos funciones, tal cual están en deploy.sh (sin correr el resto del script).
eval "$(sed -n '/^env_file_value() {/,/^}/p; /^staging_buckets_guard() {/,/^}/p' "$deploy")"

failures=0
# caso <nombre> <esperado: pasa|frena> <MEDIA_BUCKET en staging (línea cruda)> [MEDIA_BUCKET en prod]
caso() {
  local name="$1" expected="$2" line="$3" prod="${4:-}"
  printf '%s\nMEDIA_PRIVATE_BUCKET=tiendafy-stg-private\n' "$line" > "$work/stg"
  rm -f "$work/prod"
  [ -n "$prod" ] && printf 'MEDIA_BUCKET=%s\nMEDIA_PRIVATE_BUCKET=prod-private\n' "$prod" > "$work/prod"
  local got
  if (staging_buckets_guard "$work/stg" "$work/prod") 2> /dev/null; then got=pasa; else got=frena; fi
  if [ "$got" = "$expected" ]; then
    echo "ok    $name"
  else
    echo "FALLA $name: esperaba $expected y $got"
    failures=$((failures + 1))
  fi
}

caso 'distinto de producción' pasa 'MEDIA_BUCKET=tiendafy-stg-media'
caso 'distinto, con comillas y comentario' pasa 'MEDIA_BUCKET="tiendafy-stg-media" # staging'
caso 'vacío' frena 'MEDIA_BUCKET='
caso 'sin definir' frena '# MEDIA_BUCKET=tiendafy-stg-media'
caso 'el de fábrica' frena 'MEDIA_BUCKET=tiendafy-media'
caso 'el de fábrica entre comillas dobles' frena 'MEDIA_BUCKET="tiendafy-media"'
caso 'el de fábrica entre comillas simples' frena "MEDIA_BUCKET='tiendafy-media'"
caso 'el de fábrica con CRLF' frena $'MEDIA_BUCKET=tiendafy-media\r'
caso 'el de fábrica con un comentario' frena 'MEDIA_BUCKET=tiendafy-media # prod'
caso 'el de fábrica con espacios' frena 'MEDIA_BUCKET = tiendafy-media '
caso 'el de fábrica con export' frena 'export MEDIA_BUCKET=tiendafy-media'
caso 'comillas vacías' frena 'MEDIA_BUCKET=""'
caso 'igual al de .env.prod' frena 'MEDIA_BUCKET=fotos-prod' 'fotos-prod'
caso 'igual al de .env.prod, con comillas y CRLF' frena $'MEDIA_BUCKET="fotos-prod"\r' 'fotos-prod'
caso 'distinto del de .env.prod' pasa 'MEDIA_BUCKET=fotos-stg' 'fotos-prod'

# Una variable del shell le gana al archivo (como en compose), aunque esté vacía.
MEDIA_BUCKET=tiendafy-media caso 'el del shell es el de fábrica' frena 'MEDIA_BUCKET=tiendafy-stg-media'
MEDIA_BUCKET= caso 'el del shell está vacío' frena 'MEDIA_BUCKET=tiendafy-stg-media'

[ "$failures" -eq 0 ] && echo "todo bien" || echo "$failures caso(s) fallaron"
exit "$failures"
