# ADR 0005: El trabajo en segundo plano, con polling a Postgres dentro de la API

**Date**: 2026-07-23 (Redis y RabbitMQ salen del compose en el commit `94447c85`;
el patrón ya estaba en uso desde los webhooks de Mercado Pago)
**Status**: Accepted — implementado
**Decision Makers**: Alan Shalem

## Contexto

El ADR 0001 preveía un host Worker aparte con consumers de RabbitMQ y jobs de
Hangfire, y el compose de desarrollo levantaba Redis y RabbitMQ. Ningún código
los usaba: los webhooks, la facturación y los avisos ya se resolvían con tablas
en Postgres y un loop que las consulta. El volumen es el de una importadora con
pocas tiendas, no el de una plataforma con miles.

## Decisión

- **Sin broker.** Todo el trabajo diferido son `BackgroundService` dentro del
  proceso de la API, que consultan Postgres cada N segundos. La base común es
  `Api/Workers/PollingWorker` (un intento por ciclo; un error se loguea y nunca
  mata al worker).
- **Inbox durable para lo que llega de afuera**: el webhook se guarda y se
  contesta 200 en el momento; un worker lo procesa después
  (`SharedKernel/Common/InboxEntry` + `Api/Workers/InboxDrain`). Cada fila se
  reclama con un UPDATE condicional antes de tocarla, y el mismo campo hace de
  lease (5 min). Los reintentos siguen una escala fija (30 s, 2 min, 10 min,
  45 min, 3 h, 6 h, 12 h): un proveedor caído casi un día no pierde una venta.
- **Outbox para lo que sale y no puede perderse**: la factura electrónica se
  encola en `FiscalEmissionJob` y la emite `FiscalEmissionWorker` con backoff y
  dead-letter.
- **Una sola instancia corre los workers**: `Workers:Enabled=false` los apaga
  en réplicas extra de la API. Los de importación (cola en memoria) y la
  liberación de reservas vencidas quedan siempre prendidos.
- **Lo que cruza módulos lo orquesta la Api**, con llamadas directas dentro del
  mismo proceso (por ejemplo `PaidOrderSideEffects` después de un pago), no con
  eventos. Los domain events de SharedKernel se levantan en algunos agregados
  pero nadie los despacha.
- **El chat posventa y la bandeja usan polling corto desde el navegador**, no
  SignalR (ver [chat-posventa.md](../chat-posventa.md)).

## Consecuencias

- Un solo proceso que desplegar y una sola fuente de verdad (la base); nada
  que se pierda en una cola en memoria de un broker.
- La latencia de lo diferido es la del intervalo de cada worker (de 5 s a 1 h;
  la tabla está en [arquitectura.md](../arquitectura.md#workers)).
- Escalar horizontalmente la API exige apagar los workers en las réplicas extra
  o confiar en los claims por fila; hoy corre una sola instancia.
- Si algún día hace falta un bus, el lugar natural es reemplazar el loop de
  `InboxDrain`/`PollingWorker`; los efectos ya están en servicios aparte.

## Estado (16-oct-2026)

Implementado: 14 workers de polling, 2 de importación y el de reservas
vencidas, todos en la API. En octubre se agregó el claim por fila al inbox de
webhooks (antes, dos instancias podían procesar el mismo pago dos veces) y la
escala de reintentos.

## Related ADRs

- [0001](./0001-monolito-modular-en-dotnet.md) — Monolito modular (este ADR reemplaza su
  host Worker con RabbitMQ y Hangfire)
- [0003](./0003-multi-tienda-con-rls.md) — Los workers corren sin tenant en scope
