# ADR 0004: Una imagen para todos los ambientes y un solo compose

**Date**: 2026-08-24 (commit `ebb80591`; el borde pasó a `infra/edge` el 2026-10-12)
**Status**: Accepted — implementado
**Decision Makers**: Alan Shalem

## Contexto

Vite y Next hornean las variables `VITE_*` y `NEXT_PUBLIC_*` al compilar. Hasta
agosto, una imagen del panel o de la tienda "era de producción": promover de un
ambiente a otro significaba recompilar, y lo que salía a producción no eran los
mismos bytes que se habían probado. Además, definir staging en un compose
propio es la forma segura de que se vaya pareciendo cada vez menos a
producción.

## Decisión

1. **La imagen no tiene ambiente.** Lo que cambia entre ambientes se inyecta al
   arrancar el contenedor:
   - Panel: `admin/docker-config.sh` escribe `config.js` con `VITE_API_URL`,
     `VITE_STOREFRONT_ORIGIN`, `VITE_SENTRY_DSN`, `VITE_BRAND_NAME`, etc.; el
     código lo lee en `admin/src/lib/runtime.ts`.
   - Tienda: variables `PUBLIC_*` (sin el prefijo `NEXT_PUBLIC_`, que Next
     reemplaza al compilar) que el servidor renderiza en el HTML de cada
     request (`storefront/src/lib/runtime.ts`). El CSP se arma en
     `proxy.ts` con la API de ese ambiente.
   - API: configuración de ASP.NET por variables de entorno, como siempre.
2. **Un solo `infra/docker/docker-compose.stack.yml`** para producción y
   staging. Lo único distinto es el archivo de variables (`.env.prod`,
   `.env.staging`). Staging corre también con `ASPNETCORE_ENVIRONMENT=Production`:
   lo que lo distingue es a qué servicios apunta, no cómo se comporta.
3. **El borde no es parte del stack.** Un solo Caddy por servidor
   (`infra/edge`) rutea por dominio a cada ambiente y a los otros sistemas de
   la máquina; cada servicio del stack publica su puerto solo en `127.0.0.1`.
4. **Promover es desplegar el mismo tag.** `docker-release.yml` construye una
   vez por push a `main`; `infra/deploy.sh` despliega un tag concreto (en
   producción, nunca `latest`).

## Consecuencias

- Lo que se prueba es exactamente lo que sale.
- Todo lo que el navegador necesita saber del ambiente tiene que pasar por
  `runtime.ts`; leer `import.meta.env` o `process.env.NEXT_PUBLIC_*` directo en
  un componente vuelve a hornear el ambiente. En octubre aparecieron dos
  carreras de ese tipo (la URL de la API y el origin del panel leídos al cargar
  el módulo, antes del script que inyecta la config) y se arreglaron leyendo en
  cada uso.
- Cada ambiente tiene su base, su volumen, su bucket de media y su keyring:
  compartirlos ahorra memoria y cuesta caro el día que staging rompe algo de
  producción.

## Estado (15-oct-2026)

Implementado y en uso en producción. Pendiente: staging todavía no existe en el
servidor (`docker-release.yml` lo saltea mientras no esté la variable
`STAGING_DOMAIN`, y el sitio de Caddy deja anotado cómo sumarlo).

## Related ADRs

- [0002](./0002-next-y-vite.md) — Por qué dos frontends
