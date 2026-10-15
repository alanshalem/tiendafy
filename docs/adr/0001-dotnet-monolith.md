# ADR 0001: Monolito Modular en .NET 10 LTS

**Date**: 2026-06-11
**Status**: Accepted
**Decision Makers**: Alan Shalem

## Estado (15-oct-2026)

**Vigente e implementado**: un solo proceso ASP.NET Core sobre .NET 10 con EF
Core y Npgsql, en producción desde el 13-oct-2026. Lo que el texto de abajo
dice y hoy no es así:

- **Contexto de negocio**: no es un SaaS para merchants de LATAM. Es la
  plataforma de una importadora (cking.com.ar) con varias tiendas propias; la
  plataforma y los comercios son la misma empresa. Las metas de escala
  (100k tiendas) y las etapas de la "Migration Path" no son el horizonte.
- **Módulos**: son 21 (Analytics, Catalog, Checkout, Content, Customers,
  Discounts, Finance, Fiscal, Identity, Inventory, Media, MercadoLibre,
  Notifications, Orders, Payments, Purchasing, Reviews, Social, Support,
  Tenancy, Themes). No existe Billing; la facturación electrónica es Fiscal.
- **Sin host Worker, sin RabbitMQ, sin Hangfire**: el trabajo en segundo plano
  corre como hosted services dentro de la misma API, con polling a Postgres
  (ver [ADR 0005](./0005-segundo-plano-con-polling-a-postgres.md)).
- **Contracts/Core/Infrastructure es opcional**: siete módulos tienen `.Core`
  y seis tienen `.Contracts`; el resto es solo `.Infrastructure`. Lo que
  orquesta varios módulos vive en `backend/src/Api/`.
- **Las fronteras sí tienen enforcement automático** desde el 11-oct:
  `ModuleBoundariesTests` falla si un módulo referencia algo que no sea el
  `.Contracts` de otro, o si un módulo referencia a la Api.

## Context

Tiendafy es una plataforma SaaS de e-commerce para merchants LATAM. Necesita:
- Escalar de 0 a 100k tiendas en 5 años
- Soportar transacciones monetarias (pagos, refunds, chargebacks)
- Mantenerse a bajo costo operativo durante MVP y escala temprana
- Equipo inicial de 3-4 desarrolladores

Opciones evaluadas:
1. **Monolito modular (.NET)** — tipado fuerte, performance, LTS estable
2. **NestJS (Node)** — mismo lenguaje end-to-end, tipado débil
3. **Microservicios** — complejidad distribuida, no la necesitamos hoy
4. **Laravel** — velocidad de dev máxima, pero refactoring doloroso a 5 años

## Decision

Backend monolito modular en **C# / .NET 10 LTS** con ASP.NET Core, EF Core, Hangfire.

### Arquitectura

```
Api (HTTP host)
├── Tenancy Module
├── Identity Module
├── Catalog Module
├── Inventory Module
├── Orders Module
├── Checkout Module
├── Payments Module
├── Billing Module
├── Themes Module
└── Notifications Module

Worker (background jobs host)
├── RabbitMQ consumers
└── Hangfire jobs
```

Cada módulo:
- **Contracts**: Interfaces públicas, eventos, DTOs (lo único referenciable)
- **Core**: Dominio, features, handlers
- **Infrastructure**: Persistencia, integraciones

## Justification

### 1. Tipado Fuerte + Compilación
- Errores en compilación, no en runtime
- En dominio de pagos, esto vale oro: orden duplicada = $ perdido
- Refactoring seguro con `dotnet build`
- Alternativa TypeScript pierde tipos en runtime y requiere validación Zod/Valibot

### 2. Performance
- ASP.NET Core: top 3 en TechEmpower
- A 100k tiendas, pasar de 30 a 90 pods = +60% costos
- Node/Python escalan horizontal mucho antes
- .NET baja costos de infraestructura

### 3. Estabilidad a 10 Años
- LTS cada dos años (8 años de soporte por versión)
- Upgrade path histórico: .NET Core → .NET 5 → 10 fue suave
- npm ecosystem: framework de 2021 es legacy hoy
- Si mantenemos esto una década, LTS matters

### 4. Contratación LATAM
- Pool .NET grande: banca, consultoras, software factories
- Senior devs disponibles
- No es el pool más grande (ese es JS), pero es profundo

### 5. Monolito vs Microservicios
- MVP: monolito > microservicios (1 deploy, 1 transacción DB, debugging local trivial)
- Fronteras de módulo = seguro: si Checkout necesita ser servicio en año 3, ya tiene contrato
- Extracción es mecánica, no cirugía

## Consequences

### Positive
- Compilación captura errores temprano
- Un deploy, una transacción distribuida
- Debugging local sin redes internas fallando
- Equipo pequeño, no necesita sincronización de 20 microservicios
- Costo operativo bajo en MVP/escala temprana

### Negative
- Menos flexibilidad de lenguajes si necesitamos un widget Python/Rust específico
- No puedo scalar un módulo independientemente (pero esto es problema al llegar a 50k+ tiendas)
- Equipo debe respetar fronteras de módulos (sin enforcement automático en compile-time para acceso a internals — va por tests de arquitectura)

## Migration Path

**Etapa 1 (0-100 clientes)**: Monolito modular, una sola DB.
**Etapa 2 (100-1k)**: Read models, replicas de lectura.
**Etapa 3 (1k-10k)**: Particionado por tenant_id, sharding por fecha.
**Etapa 4 (10k+)**: Cell-based architecture si lo necesitamos (Shopify pods).

Si en año 3 necesitamos extraer un módulo, la frontera ya existe + tiene Contracts. Cambio mecánico.

## Related ADRs
- [0002](./0002-next-and-vite.md) — Frontend stack
- [0003](./0003-postgres-rls.md) — Multi-tenancy
- [0005](./0005-segundo-plano-con-polling-a-postgres.md) — Segundo plano y consistencia async
