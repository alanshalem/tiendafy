# Documentación de Tiendafy

Índice de todo lo que está escrito. Si sos nuevo, arrancá por
[primeros-pasos.md](./primeros-pasos.md). Si sos un agente, por
[AGENTS.md](../AGENTS.md).

Todo en español. Lo que describe el sistema está al día con el código al
18-oct-2026. Lo de [historial/](./historial/) registra decisiones y análisis
viejos, con un bloque de estado arriba.

## Para trabajar en el código

| Documento | Qué tiene |
|---|---|
| [primeros-pasos.md](./primeros-pasos.md) | El primer día: requisitos, levantar todo, entrar, tests, dónde está cada cosa |
| [urls-y-puertos.md](./urls-y-puertos.md) | Puertos y direcciones en desarrollo, Docker y producción |
| [configuracion.md](./configuracion.md) | Cada variable y credencial: para qué, de dónde sale, cómo llega a producción |
| [usuarios-de-prueba.md](./usuarios-de-prueba.md) | Los usuarios que siembra el entorno de desarrollo |
| [tests.md](./tests.md) | Las suites, `pnpm verify`, cobertura y qué corre CI |
| [guias/agregar-un-modulo.md](./guias/agregar-un-modulo.md) | Cómo sumar un módulo al backend sin romper las reglas de arquitectura |

## Cómo está hecho

| Documento | Qué tiene |
|---|---|
| [arquitectura.md](./arquitectura.md) | Diagramas: el servidor, los módulos, los workers, los servicios externos, una venta |
| [adr/](./adr/README.md) | Las decisiones de arquitectura y en qué quedó cada una |
| [permisos.md](./permisos.md) | Roles y permisos por tienda, y cómo sumar un permiso |
| [chat-posventa.md](./chat-posventa.md) | El chat posventa y la Bandeja |
| [sistema-visual.md](./sistema-visual.md) | El sistema visual del panel, las tiendas y los mails |
| [integraciones/](./integraciones/README.md) | Un documento por servicio externo (pagos, ARCA, envíos, Mercado Libre, redes, mail, WhatsApp) con su estado |
| [`shared/types/src/sections/`](../shared/types/src/sections/README.md) | Cómo sumar o cambiar una sección del editor de tiendas |
| [`storefront/src/app/fonts/`](../storefront/src/app/fonts/README.md) | Las fuentes de las tiendas: de dónde salen y cómo sumar una |

## Producción

| Documento | Qué tiene |
|---|---|
| [despliegue.md](./despliegue.md) | Desplegar, volver atrás, backups, restaurar, cambiar de versión de Postgres, seguridad |
| [publicar-en-la-vps.md](./publicar-en-la-vps.md) | La puesta en marcha en la VPS compartida, paso a paso, con su estado |

## Marca

| Documento | Qué tiene |
|---|---|
| [marca/puente-oriente/guia-de-marca.md](./marca/puente-oriente/guia-de-marca.md) | Guía de marca de Puente Oriente (logos en la misma carpeta) |
| [marca/puente-oriente/prompt-gemini.md](./marca/puente-oriente/prompt-gemini.md) | Prompts para explorar variantes del logo y mockups con Gemini |
| [marca/smartfox/guia-de-marca.md](./marca/smartfox/guia-de-marca.md) | Guía de marca de Smartfox |

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
- **Nombres:** minúsculas, palabras con guion, en español y sin tildes ni eñes
  (`despliegue.md`, `guias/agregar-un-modulo.md`, `adr/0006-titulo-corto.md`).
  Las únicas excepciones son los nombres que buscan las herramientas:
  `README.md`, `AGENTS.md` y `CLAUDE.md`.
- **Renombrar o mover un documento** es actualizar en el mismo commit todo lo
  que lo cita: los otros documentos, comentarios del código, scripts de
  `infra/` y el centro de ayuda del panel (`admin/src/config/help-content-*.ts`).
  `git grep -n "nombre-viejo.md"` tiene que dar vacío.
