# Tiendafy — guía para agentes

Lo que cualquier agente (Claude, Codex, el que sea) tiene que saber antes de
tocar este repo. Lo que se deduce leyendo el código no está acá; lo que no se
deduce y costó caro aprenderlo, sí. La documentación completa está indexada en
[docs/README.md](docs/README.md).

## Qué es

Plataforma de tiendas online de UNA importadora argentina con varias tiendas
propias (por rubro). En producción desde el 13-oct-2026.

| Carpeta | Qué hay |
|---|---|
| `backend/` | API .NET 10, monolito modular: `src/Api` (endpoints y orquestación), `src/Modules/<Módulo>` (dominio, persistencia), `src/SharedKernel*`, `tests/` |
| `admin/` | Panel del comercio: Vite + React 19 + React Query (puerto 5173) |
| `storefront/` | Tiendas: Next.js 16 App Router, multi-tienda por host (puerto 3000) |
| `shared/` | `@tiendafy/types` (contratos, registro de secciones), `@tiendafy/ui` (componentes) y `@tiendafy/design-system` (tokens y preset de Tailwind) |
| `e2e/` | Playwright |
| `infra/` | Compose de producción/staging, Caddy, `deploy.sh`, backups |

API en dev: `http://localhost:5080`. Versiones: Node 26 (`.node-version`),
pnpm 12 (`packageManager`), Postgres 18, .NET 10.

## Idioma

Todo lo que escribimos nosotros va en **español rioplatense con voseo**: textos
del panel y la tienda, comentarios, mensajes de commit, documentación. Los
identificadores del código, en inglés. Los textos que ve un comercio o un
comprador no usan jerga técnica.

## Verificar antes de dar algo por terminado

```bash
pnpm verify              # lo que corre CI menos el e2e, en fases que no agotan la RAM
pnpm verify --front      # panel, tienda y tipos
pnpm verify --back       # build con -warnaserror, dotnet format, unit e integración
```

- Los tests de integración usan el Postgres de dev (`localhost:5432`); para no
  chocar con otra corrida: `TIENDAFY_TEST_DB="Host=localhost;Port=5432;Database=tiendafy_itests_<algo>;Username=tiendafy;Password=tiendafy"`.
- vitest limita sus workers en local (`test-fixtures/workers.ts`): no lo pises
  con `--maxWorkers` alto; una suite del panel con 19 workers se come la RAM.
- Backend: `dotnet format backend.slnx --no-restore` antes de commitear (CI
  corre `--verify-no-changes`).

## Reglas que no se ven en el código

- **Api/ vs módulos.** Lo que toca dos o más módulos es orquestación y vive en
  `backend/src/Api` (notificaciones, efectos de una venta pagada o reembolsada,
  sincronización con Mercado Libre…). A un módulo solo van adaptadores de ese
  módulo. Los tests de arquitectura (`tests/UnitTests/Architecture`) lo hacen cumplir.
- **Multi-tienda.** Cada consulta filtra por tienda (filtros de EF verificados
  por reflexión en los tests). En la tienda, todo fetch del servidor con caché
  pasa por `apiGetTenant` (lleva `_mt` en la URL): la Data Cache de Next cachea
  por URL y sin eso una tienda vería datos de otra. En el panel, las claves de
  React Query salen de `admin/src/lib/queryKeys.ts` (`qk`) y llevan la tienda.
- **Config en runtime, nunca horneada.** La misma imagen corre en staging y
  producción. La tienda recibe `PUBLIC_*` (no `NEXT_PUBLIC_*`: Next las hornea
  también en el bundle del servidor); el panel reescribe `config.js` al arrancar.
- **DataProtection.** Nunca cambiar un *purpose* (el string de cada
  `CreateProtector(...)` o `Purpose = ...`: `Tiendafy.Fiscal.Secrets.v1`,
  `Customers.PII.v1`, `tiendafy.correo.tokens`…, no siguen un único patrón):
  todo lo cifrado con el viejo deja de poder leerse. El volumen `dpkeys` se
  backupea junto con la base.
- **Plata.** `Money` es entero en centavos (`long`) más la moneda; nunca
  `double`. Montos y fechas que ve una persona: `ArgentineNumbers` y
  `ArgentinaTime` (SharedKernel). El contenedor corre con la cultura invariante:
  un `{x:N0}` sin cultura sale "1,500".
- **Tailwind y `cn`.** `cn` (`shared/ui/src/cn.ts`) resuelve con tailwind-merge
  las clases que se pisan, pero solo reconoce los tokens propios que tiene
  listados en `extendTailwindMerge`. Un token nuevo en
  `shared/design-system/tailwind.preset.cjs` (tamaño, espaciado, sombra…) se
  suma también ahí, o esa clase no se resuelve contra la de la base.
- **Paquetes de `shared/` con peers** (React): el panel necesita `resolve.dedupe`
  o el bundle termina con dos Reacts y la pantalla en negro.
- **Skills.** Las del proyecto se versionan en `.claude/skills/<nombre>/SKILL.md`
  (un solo nivel: más adentro Claude Code no las carga; el resto de `.claude/`
  se ignora). ARCA en `afip-*`, Mercado Pago en `mercadopago-*`; origen y cómo
  se actualizan en `.claude/skills/README.md`. Una ruta de API que diga una
  skill se confirma en la documentación oficial antes de usarla en el código.

## Lecciones que costaron caro

- Renombrar algo que pasa de valor a función (`API_URL` → `apiUrl()`) deja
  imports con alias (`apiUrl as API`) metidos en `${API}/…`: ni tsc ni lint lo
  ven. Después de un rename así, buscá ` as ` y corré la suite de la tienda.
- Antes de dar un deploy por listo, construí y **corré** la imagen: varios bugs
  solo aparecieron en el servidor (permisos de `/keys`, `@swc/helpers` en el
  standalone, scripts sin bit de ejecución).
- Scripts nuevos desde Windows: `git update-index --chmod=+x <archivo>`.
- MinIO acepta todo; Cloudflare R2 no (firma de payload, checksums). Lo que
  anda con MinIO en dev puede fallar en producción.
- En Windows, los permisos de carpeta no se aplican: lo que toca permisos o
  usuarios (scripts de `infra/`) se prueba en Linux (Docker-in-Docker sirve).

## Commits, ramas y deploy

- Se commitea y se pushea directo a `main`. Título `tipo(ámbito): qué cambia`
  en español (`fix(pagos): …`, `refactor(orders): …`), cuerpo con el porqué.
- Nunca commitear `.env*` ni credenciales. Las del seed de desarrollo están en
  `docs/usuarios-de-prueba.md` y solo sirven en local.
- El deploy es a mano, en el servidor: `./infra/deploy.sh prod sha-XXXXXXX`
  (ver [docs/despliegue.md](docs/despliegue.md)). Las migraciones son un paso del
  deploy, no corren al arrancar.
