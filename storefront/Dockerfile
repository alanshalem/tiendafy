# Storefront (Next.js) en workspace pnpm. Contexto de build: raíz del repo
# (necesita shared/ y el lockfile).
#   docker build -f storefront/Dockerfile -t tiendafy-store .
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./storefront build

FROM node:20-alpine AS run
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
# Usuario no-root (la imagen node trae el usuario `node`).
USER node
WORKDIR /repo/storefront
EXPOSE 3000
CMD ["pnpm", "start"]
