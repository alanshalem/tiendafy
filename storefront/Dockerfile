# syntax=docker/dockerfile:1
# Storefront (Next.js) en workspace pnpm. Contexto de build: RAÍZ del repo.
#   docker build -f storefront/Dockerfile -t tiendafy-store .
#
# Optimizaciones:
# - corepack usa el pnpm PINNEADO en package.json (packageManager) — una sola
#   versión de la verdad, sin `corepack prepare` desincronizado.
# - Capa de deps separada: `pnpm fetch` baja el store SOLO desde el lockfile →
#   cambiar código no re-descarga dependencias. Cache mount del store pnpm:
#   ni siquiera un cambio de lockfile parte de cero.
# - `--frozen-lockfile --offline` (el equivalente estricto de `npm ci`).
# - Runtime = output STANDALONE de Next: server.js + node_modules podados por
#   file-tracing. Antes se copiaba el repo entero (~GB); ahora ~200MB.
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# --- deps: solo lockfile + manifests → máxima estabilidad de caché ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store

# --- build ---
FROM deps AS build
COPY . .
# Install del workspace completo (sin --filter): el install filtrado deja a tsc
# sin los @types compartidos. El costo extra es mínimo: todo sale del store cacheado.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store
# NEXT_PUBLIC_* se inlinea en el bundle del navegador en build-time → build-args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_ORIGIN
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_ADMIN_ORIGIN=${NEXT_PUBLIC_ADMIN_ORIGIN} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter ./storefront build

# --- runtime mínimo (standalone) ---
FROM node:24-alpine AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# El standalone reproduce el layout del monorepo (outputFileTracingRoot = raíz):
# /app/storefront/server.js + /app/node_modules podados.
COPY --from=build --chown=node:node /repo/storefront/.next/standalone ./
COPY --from=build --chown=node:node /repo/storefront/.next/static ./storefront/.next/static
COPY --from=build --chown=node:node /repo/storefront/public ./storefront/public
USER node
EXPOSE 3000
CMD ["node", "storefront/server.js"]
