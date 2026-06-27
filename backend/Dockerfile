# Backend .NET 10 (API). Contexto de build: raíz del repo.
#   docker build -f backend/Dockerfile -t tiendafy-api .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ ./backend/
RUN dotnet publish backend/src/Api/Api.csproj -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
# Usuario no-root: si la app se compromete, no hereda root en el contenedor.
RUN adduser --system --uid 1001 --group appuser
COPY --from=build /app ./
USER appuser
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "Api.dll"]
