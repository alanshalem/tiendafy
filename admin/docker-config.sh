#!/bin/sh
# Escribe la config de runtime del admin desde las variables del contenedor.
#
# nginx-unprivileged corre todo lo que haya en /docker-entrypoint.d antes de
# arrancar, así que esto pasa una vez por deploy y sin CMD propio.
#
# Los nombres siguen siendo VITE_* para no tener dos vocabularios: son las
# mismas variables, pero leídas al arrancar en vez de horneadas al compilar.
#
# Todo se escribe en /tmp (un tmpfs en el stack) y no en el directorio del
# sitio: así el sistema de archivos del contenedor puede ser de solo lectura.
# nginx sirve /config.js desde acá (ver nginx.conf).
set -eu

dir=/tmp/tiendafy
mkdir -p "$dir"
target="$dir/config.js"

cat > "$target" <<JS
window.__TIENDAFY_CONFIG__ = {
  apiUrl: "${VITE_API_URL:-}",
  storefrontOrigin: "${VITE_STOREFRONT_ORIGIN:-}",
  primaryStoreSubdomain: "${VITE_PRIMARY_STORE_SUBDOMAIN:-}",
  sentryDsn: "${VITE_SENTRY_DSN:-}",
  envName: "${APP_ENV:-production}",
  brandName: "${VITE_BRAND_NAME:-}"
};
JS

# connect-src acotado a ESTE ambiente: la API y, si hay, el host de Sentry.
# El header estático (security-headers.conf) deja connect-src 'self' https:; los
# navegadores aplican las dos políticas y gana la más estricta. Solo el origen
# (esquema + host + puerto): una URL con ruta o comillas no puede colar nada.
origin_of() {
  printf '%s' "$1" | sed -n 's#^\(https\{0,1\}://[A-Za-z0-9._-]*\(:[0-9]\{1,5\}\)\{0,1\}\).*#\1#p'
}
api_origin="$(origin_of "${VITE_API_URL:-}")"
# El DSN es https://<clave>@<host>/<proyecto>: el host es lo que sigue a la arroba.
sentry_origin=""
case "${VITE_SENTRY_DSN:-}" in
  https://*@*) sentry_origin="$(origin_of "https://$(printf '%s' "$VITE_SENTRY_DSN" | sed 's#^https://[^@]*@##')")" ;;
esac
{
  printf "add_header Content-Security-Policy \"connect-src 'self'"
  [ -n "$api_origin" ] && printf ' %s' "$api_origin"
  [ -n "$sentry_origin" ] && printf ' %s' "$sentry_origin"
  printf "\" always;\n"
} > "$dir/csp-connect.conf"

echo "[tiendafy] config.js escrito para APP_ENV=${APP_ENV:-production}"