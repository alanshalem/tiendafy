# syntax=docker/dockerfile:1
# Admin (Vite SPA) → estático servido por nginx. Contexto de build: RAÍZ del repo.
#   docker build -f admin/Dockerfile -t tiendafy-admin .
# Mismo patrón que el storefront: pnpm pinneado por corepack (packageManager),
# capa de deps con `pnpm fetch` + cache mount, install --frozen-lockfile --offline.
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store

FROM deps AS build
COPY . .
# Install del workspace completo (sin --filter): el install filtrado deja a tsc
# sin los @types compartidos. El costo extra es mínimo: todo sale del store cacheado.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store
# VITE_* se hornea en el bundle estático en build-time → build-args.
ARG VITE_API_URL
ARG VITE_SENTRY_DSN
ARG VITE_STOREFRONT_ORIGIN
ENV VITE_STOREFRONT_ORIGIN=$VITE_STOREFRONT_ORIGIN
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
RUN pnpm --filter ./admin build
# Los assets con hash salen ya comprimidos (.gz al lado de cada uno): nginx
# los sirve con gzip_static, sin recomprimir en cada pedido y al nivel máximo.
# Solo /assets: config.js se reescribe al arrancar y index.html es chico.
RUN find admin/dist/assets -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' \) \
      -size +1k -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;

# Imagen nginx no-root (uid 101, escucha 8080). Solo el dist + la config.
FROM nginxinc/nginx-unprivileged:alpine
# --chown: el dist trae config.js (el placeholder de public/) y el entrypoint
# lo reescribe al arrancar como usuario nginx. Sin esto el archivo queda de
# root y la reescritura falla con "permission denied".
COPY --from=build --chown=101:101 /repo/admin/dist /usr/share/nginx/html
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY admin/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
# Config de runtime: la imagen NO tiene ambiente propio. Este script reescribe
# config.js al arrancar, así el mismo digest se promueve de staging a prod.
COPY --chmod=755 admin/docker-config.sh /docker-entrypoint.d/40-tiendafy-config.sh
# El entrypoint corre como el usuario nginx (uid 101), que por defecto no puede
# escribir en el directorio del sitio. Sin este chown, config.js no se escribe
# y el panel arranca con la config de desarrollo — apuntando a localhost.
USER root
RUN chown 101:101 /usr/share/nginx/html
USER 101
EXPOSE 8080
