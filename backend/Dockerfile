# syntax=docker/dockerfile:1
# Backend .NET 10 (API). Contexto de build: RAÍZ del repo.
#   docker build -f backend/Dockerfile -t tiendafy-api .
#
# Optimizaciones:
# - Cache mount de NuGet: cambiar código NO re-descarga paquetes (el store
#   persiste entre builds de BuildKit sin engordar capas).
# - Publish directo en un solo RUN (menos capas; el SDK no viaja al runtime).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ ./backend/
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
    dotnet publish backend/src/Api/Api.csproj -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
# QuestPDF/SkiaSharp (PDFs de facturas) necesita fontconfig + una fuente en
# Linux. libgssapi-krb5-2: Npgsql la busca al conectar y, si falta, ensucia
# el log con "Cannot load library libgssapi_krb5.so.2" en cada arranque.
# Un solo RUN + limpieza de listas de apt = una capa chica.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libfontconfig1 fonts-liberation libgssapi-krb5-2 \
 && rm -rf /var/lib/apt/lists/*
# /keys (DataProtection) ya del usuario de la app: el volumen nuevo hereda el
# dueño de la carpeta de la imagen. Sin esto nace de root y la API no puede
# guardar sus claves ("Access to the path '/keys/...' is denied").
RUN mkdir -p /keys && chown "$APP_UID" /keys
COPY --from=build /app ./
# Usuario no-root: las imágenes .NET 8+ ya traen el user `app` (APP_UID=1654).
USER $APP_UID
EXPOSE 8080
# SHA de git horneado (lo expone GET /version — saber QUÉ corre en cada server).
ARG GIT_SHA=dev
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_EnableDiagnostics=0 \
    APP_GIT_SHA=$GIT_SHA
ENTRYPOINT ["dotnet", "Api.dll"]
