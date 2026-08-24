#!/bin/sh
# Escribe la config de runtime del admin desde las variables del contenedor.
#
# nginx-unprivileged corre todo lo que haya en /docker-entrypoint.d antes de
# arrancar, así que esto pasa una vez por deploy y sin CMD propio.
#
# Los nombres siguen siendo VITE_* para no tener dos vocabularios: son las
# mismas variables, pero leídas al arrancar en vez de horneadas al compilar.
set -eu

target=/usr/share/nginx/html/config.js

cat > "$target" <<JS
window.__TIENDAFY_CONFIG__ = {
  apiUrl: "${VITE_API_URL:-}",
  storefrontOrigin: "${VITE_STOREFRONT_ORIGIN:-}",
  sentryDsn: "${VITE_SENTRY_DSN:-}",
  envName: "${APP_ENV:-production}"
};
JS

echo "[tiendafy] config.js escrito para APP_ENV=${APP_ENV:-production}"
