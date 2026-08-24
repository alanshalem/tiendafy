# Caddy con el plugin DNS de Cloudflare.
#
# Hace falta para emitir certificados COMODÍN (*.dominio) por DNS-01. Sin
# comodín, cada tienda nueva emite su certificado la primera vez que alguien la
# visita: esa primera carga se cuelga unos segundos y, con varias tiendas, el
# límite semanal de Let's Encrypt corta la fila.
#
# El on-demand se sigue usando para los dominios PROPIOS de los comercios, que
# por definición no se pueden anticipar.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
