# Documentación de Tiendafy

Índice de todo lo que está escrito. Si sos nuevo, arrancá por
[START_HERE.md](./START_HERE.md). Si sos un agente, por
[AGENTS.md](../AGENTS.md).

Todo en español. Lo que describe el sistema está al día con el código al
15-oct-2026. Lo de [historial/](./historial/) registra decisiones y análisis
viejos, con un bloque de estado arriba.

## Para trabajar en el código

| Documento | Qué tiene |
|---|---|
| [START_HERE.md](./START_HERE.md) | El primer día: requisitos, levantar todo, entrar, tests, dónde está cada cosa |
| [URLS.md](./URLS.md) | Puertos y direcciones en desarrollo, Docker y producción |
| [CONFIGURACION.md](./CONFIGURACION.md) | Cada variable y credencial: para qué, de dónde sale, cómo llega a producción |
| [usuarios-de-prueba.md](./usuarios-de-prueba.md) | Los usuarios que siembra el entorno de desarrollo |
| [TESTING.md](./TESTING.md) | Las suites, `pnpm verify`, cobertura y qué corre CI |
| [guides/adding-a-module.md](./guides/adding-a-module.md) | Cómo sumar un módulo al backend sin romper las reglas de arquitectura |

## Cómo está hecho

| Documento | Qué tiene |
|---|---|
| [ARQUITECTURA-VISUAL.md](./ARQUITECTURA-VISUAL.md) | Diagramas: el servidor, los módulos, los workers, los servicios externos, una venta |
| [adr/](./adr/README.md) | Las decisiones de arquitectura y en qué quedó cada una |
| [rbac.md](./rbac.md) | Roles y permisos por tienda, y cómo sumar un permiso |
| [support-chat.md](./support-chat.md) | El chat posventa y la Bandeja |
| [DESIGN.md](./DESIGN.md) | El sistema visual del panel, las tiendas y los mails |
| [integraciones/](./integraciones/README.md) | Un documento por servicio externo (pagos, ARCA, envíos, Mercado Libre, redes, mail, WhatsApp) con su estado |
| [`shared/types/src/sections/`](../shared/types/src/sections/README.md) | Cómo sumar o cambiar una sección del editor de tiendas |

## Producción

| Documento | Qué tiene |
|---|---|
| [DEPLOY.md](./DEPLOY.md) | Desplegar, volver atrás, backups, restaurar, cambiar de versión de Postgres, seguridad |
| [PUBLICAR-EN-LA-VPS.md](./PUBLICAR-EN-LA-VPS.md) | La puesta en marcha en la VPS compartida, paso a paso, con su estado |

## Marca

| Documento | Qué tiene |
|---|---|
| [marca/puente-oriente/guia-de-marca.md](./marca/puente-oriente/guia-de-marca.md) | Guía de marca de Puente Oriente (logos en la misma carpeta) |
| [marca/smartfox/guia-de-marca-smartfox.md](./marca/smartfox/guia-de-marca-smartfox.md) | Guía de marca de Smartfox |

## Historial

| Documento | Qué tiene |
|---|---|
| [historial/refactor.md](./historial/refactor.md) | Las pasadas de refactor y lo que se descartó a propósito (no reabrir sin motivo) |
| [historial/informe-rentabilidad-y-wms.md](./historial/informe-rentabilidad-y-wms.md) | El análisis que llevó a Rentabilidad y Compras/depósito |
| [historial/comparativa-lapyme.md](./historial/comparativa-lapyme.md) | La comparación con La Pyme y lo que todavía falta |

## Cómo mantener esto

- Un cambio que vuelve falso un documento lo actualiza en el mismo commit.
- Cada cosa se explica en un solo lugar; los demás enlazan.
- Lo que el código ya dice solo (qué hace una clase, qué recibe un endpoint) no
  se copia acá: se escribe lo que no se deduce, el porqué y lo que costó aprenderlo.
- Los nombres de `CONFIGURACION.md`, `DEPLOY.md`, `usuarios-de-prueba.md` y
  `support-chat.md` no se cambian: los citan el código y el centro de ayuda del panel.
