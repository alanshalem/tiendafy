#!/usr/bin/env bash
# El freno de deploy.sh que rechaza los valores de relleno del .env de ejemplo
# (cambiar-por-uno-fuerte, <ACCOUNT_ID>…): el `:?` de compose solo mira que la
# variable no esté vacía y los dejaba pasar.
#
#   bash infra/tests/deploy-placeholders.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
deploy="$here/../deploy.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

eval "$(sed -n '/^env_file_value() {/,/^}/p; /^placeholder_guard() {/,/^}/p' "$deploy")"

failures=0
# caso <nombre> <esperado: pasa|frena> <contenido del archivo>
caso() {
  local name="$1" expected="$2" content="$3" got
  printf '%s\n' "$content" > "$work/env"
  if (placeholder_guard "$work/env") 2> /dev/null; then got=pasa; else got=frena; fi
  if [ "$got" = "$expected" ]; then
    echo "ok    $name"
  else
    echo "FALLA $name: esperaba $expected y $got"
    failures=$((failures + 1))
  fi
}

caso 'valores reales' pasa $'POSTGRES_PASSWORD=Xk29sd8fh3\nMEDIA_ENDPOINT=https://abc123.r2.cloudflarestorage.com'
caso 'la contraseña del ejemplo de prod' frena 'POSTGRES_PASSWORD=cambiar-por-uno-fuerte'
caso 'la contraseña del ejemplo de staging' frena 'POSTGRES_PASSWORD=cambiar-por-uno-fuerte-y-distinto-al-de-prod'
caso 'entre comillas' frena 'POSTGRES_PASSWORD="cambiar-por-uno-fuerte"'
caso 'con CRLF' frena $'POSTGRES_PASSWORD=cambiar-por-uno-fuerte\r'
caso 'con export' frena 'export POSTGRES_PASSWORD=cambiar-por-uno-fuerte'
caso 'cualquier secreto, no solo la base' frena $'POSTGRES_PASSWORD=Xk29sd8fh3\nREVALIDATE_SECRET=cambiar-esto'
caso 'el endpoint de R2 sin completar' frena $'POSTGRES_PASSWORD=Xk29sd8fh3\nMEDIA_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com'
caso 'una contraseña real que contiene "cambiar"' pasa 'POSTGRES_PASSWORD=unaClaveParaCambiarlo9'
caso 'el placeholder solo en un comentario' pasa $'# POSTGRES_PASSWORD=cambiar-por-uno-fuerte\nPOSTGRES_PASSWORD=Xk29sd8fh3'
caso 'variables vacías' pasa $'POSTGRES_PASSWORD=Xk29sd8fh3\nRESEND_API_KEY='

# Los ejemplos del repo sí los frena (traen relleno a propósito).
for example in "$here"/../docker/.env.prod.example "$here"/../docker/.env.staging.example; do
  if (placeholder_guard "$example") 2> /dev/null; then
    echo "FALLA $(basename "$example"): el ejemplo sin completar debería frenar"
    failures=$((failures + 1))
  else
    echo "ok    $(basename "$example") sin completar frena"
  fi
done

[ "$failures" -eq 0 ] && echo "todo bien" || echo "$failures caso(s) fallaron"
exit "$failures"
