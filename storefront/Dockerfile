# Storefront (Next.js) en workspace pnpm. Contexto de build: raíz del repo
# (necesita shared/ y el lockfile).
#   docker build -f storefront/Dockerfile -t tiendafy-store .
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# NEXT_PUBLIC_* se inlinea en el bundle del navegador en build-time → hay que
# pasarlas como build-arg. Sin args caen a los defaults del código (localhost).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_ADMIN_URL=${NEXT_PUBLIC_ADMIN_URL}
RUN pnpm --filter ./storefront build

FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
# Usuario no-root (la imagen node trae el usuario `node`).
USER node
WORKDIR /repo/storefront
EXPOSE 3000
# Corremos el binario de Next directo (no pnpm): en runtime, corepack como user
# `node` re-resolvería otra versión de pnpm y crashea. El bin viene del workspace.
CMD ["node_modules/.bin/next", "start"]
