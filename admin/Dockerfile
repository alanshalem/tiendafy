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
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
RUN pnpm --filter ./admin build

# Imagen nginx no-root (uid 101, escucha 8080). Solo el dist + la config.
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /repo/admin/dist /usr/share/nginx/html
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
