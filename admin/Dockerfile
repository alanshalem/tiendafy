# Admin (Vite SPA) → estático servido por nginx. Contexto de build: raíz del repo.
#   docker build -f admin/Dockerfile -t tiendafy-admin .
# Nota: VITE_API_URL se hornea en el build. Pasalo con --build-arg si hace falta.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter ./admin build

# Imagen nginx que corre como usuario no-root (uid 101, escucha 8080).
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /repo/admin/dist /usr/share/nginx/html
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
