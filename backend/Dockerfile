# Backend .NET 10 (API). Contexto de build: raíz del repo.
#   docker build -f backend/Dockerfile -t tiendafy-api .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ ./backend/
RUN dotnet publish backend/src/Api/Api.csproj -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
# Usuario no-root: las imágenes .NET 8+ ya traen el user `app` (APP_UID=1654);
# lo reusamos en vez de crear uno (Azure Linux no tiene `adduser`).
USER $APP_UID
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "Api.dll"]
