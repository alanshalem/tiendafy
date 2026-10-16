# ADR 0003: Multi-Tenancy con PostgreSQL RLS

**Date**: 2026-06-11
**Status**: Parcialmente implementado — base compartida con `tenant_id` sí; RLS no (ver Estado)
**Decision Makers**: Alan Shalem

## Estado (15-oct-2026, revisado el 16-oct)

**Implementado**: una base, un esquema, `tenant_id` en cada fila de cada tabla
de tienda.

**No implementado**: el RLS a nivel motor (policies + `SET LOCAL app.tenant_id`
por transacción). Tampoco hay PgBouncer: se sacó del compose de desarrollo
el 17-ago-2026 porque nadie lo usaba, y producción se conecta directo con el pool de Npgsql.
Las secciones "Implementation" y "Connection Pooling" de abajo describen la
propuesta, no el sistema.

El aislamiento hoy son tres capas de aplicación:

1. **Filtro explícito** por `tenant_id` en repositorios y endpoints, con el
   tenant que resuelve el header `X-Tenant-Id` (`ITenantContext`).
2. **Query filters globales de EF Core** (`HasQueryFilter`) en todos los
   `DbContext` con tablas de tienda: acotan cada consulta del request al
   tenant actual aunque falte el `.Where`. Se apagan solo cuando no hay tenant
   en scope (workers que recorren todas las tiendas, migraciones).
3. **`TenantQueryFilterTests`** (desde el 11-oct): recorre el modelo de EF de
   todos los contextos y falla si una entidad con `TenantId` no tiene filtro.
   Las excepciones están escritas con su motivo: `Tenant` (es la tienda
   misma), `TenantMembership`, `RolePermissionOverride` y `AuditEvent` (se
   consultan siempre con el tenant explícito). Cuando se agregó, encontró ocho
   entidades sin filtro.

Lo que estas capas no cubren es el SQL crudo. Hoy hay seis lugares (el
contador de números de pedido, el upsert de búsquedas, el borrado de los
valores de un campo de ficha técnica, los locks de asesoría de ARCA en la
emisión y en el WSAA, y un filtro de texto de Mercado Libre que EF compone con
el filtro de tienda); cada uno lleva el tenant explícito o actúa sobre una
fila ya cargada con filtro. Pendiente: RLS sigue
siendo la defensa en profundidad que falta, y no hay fecha para hacerlo.

## Context

Tiendafy sirve múltiples merchants independientes (tenants). Necesita:
- Aislar datos entre tenants (data leak = empresa muere)
- Escalar a 100k+ tenants sin schema-per-tenant (pesadilla operativa)
- Performance: sin penalty significativo para queries

Opciones:
1. **Shared database + Shared schema + tenant_id column** (con RLS)
2. **Database-per-tenant** (máximo aislamiento, operacional worst-case)
3. **Schema-per-tenant** (medio término, pero 100k migraciones = infierno)
4. **Row-level separation en aplicación** (sin RLS, confiar en código)

## Decision

**Shared database, shared schema, tenant_id en cada fila, con PostgreSQL RLS.**

Segunda línea de defensa: global query filters en EF Core.

## Justification

### 1. Operacional
- Una base de datos = un backup, un PITR, una replicación
- Migraciones: correr contra 1 schema, no 100k
- Disaster recovery: simpler (una DB, no ejército de DBs)
- Scaling: particionado simple (particiones por tenant_id + fecha)

### 2. Performance
- RLS a nivel motor: aunque un dev escriba `SELECT * FROM orders` sin WHERE tenant_id, la DB filtra automáticamente
- Índices compuestos: `(tenant_id, created_at)` — tenant_id siempre primero
- PgBouncer en transaction pooling: SET LOCAL app.tenant_id dentro de la tx
- Query plan: Postgres vectoriza queries multi-tenant sin issue

### 3. Seguridad por Capas
```
Capa 1: RLS en PostgreSQL (motor filtra rows)
SELECT * FROM orders; — si no hay RLS policy, error
SELECT * FROM orders WHERE tenant_id = current_setting('app.tenant_id');
— compilado en Postgres, no en tu código

Capa 2: EF Core global query filters
.HasQueryFilter(x => x.TenantId == tenantContextId)
— doble protección, atrapa bugs en tus queries manuales

Capa 3: Aplicación (middleware resuelve tenant, lo quema en DB)
SET LOCAL app.tenant_id = '...'
— dentro de transacción, atomicity garantizada
```

### 4. Hybrid Ready
- Tenant enterprise = dedicado
- A producción, si un big tenant demanda DB aislada, provisiono una
- Dirección de conexiones: app mapea tenant → connection string
- Código de negocio sin cambios

## Implementation

### Schema

```sql
-- Role de tenant
CREATE ROLE tenant_role;

-- Tabla con tenant_id
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  total NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  -- índice: tenant_id siempre primero
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_orders_tenant_created
  ON orders(tenant_id, created_at DESC);

-- RLS Policy
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_isolation ON orders
  USING (tenant_id = CURRENT_SETTING('app.tenant_id')::UUID)
  WITH CHECK (tenant_id = CURRENT_SETTING('app.tenant_id')::UUID);

-- Aplicar a todos los roles excepto superuser
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO tenant_role;
```

### Backend

```csharp
// Program.cs
var tenantId = context.Items["TenantId"] as string;
using (var connection = new NpgsqlConnection(connectionString))
{
    connection.Open();
    await connection.ExecuteAsync(
        "SET LOCAL app.tenant_id = @tenantId",
        new { tenantId }
    );
    // Todas las queries dentro de esta transacción ven RLS
}

// EF Core global filter (segunda línea)
modelBuilder.Entity<Order>()
    .HasQueryFilter(o => o.TenantId == _tenantContext.TenantId);
```

### Middleware

```csharp
// TenancyMiddleware
public async Task InvokeAsync(HttpContext context)
{
    var host = context.Request.Host.Host;
    var tenant = await _tenancyService.ResolveTenant(host);
    context.Items["TenantId"] = tenant.Id;
    context.Items["Tenant"] = tenant;
    
    await _next(context);
}
```

### Connection Pooling

```
PgBouncer en transaction pooling (no session pooling):
[databases]
tiendafy = host=postgres port=5432 dbname=tiendafy user=app password=secret

[pgbouncer]
pool_mode = transaction
default_pool_size = 25
max_db_connections = 100
```

Por qué transaction mode:
- SET LOCAL es dentro de transacción
- Connectionre-usable entre transacciones
- Performance: más conecciones en el pool, menos overhead

## Consequences

### Positive
- Una DB = operacional simple
- RLS = protección a nivel motor (no confía solo en código)
- Escalable a 100k+ tenants sin pesadilla
- Hybrid: puedo provisionar DB dedicada para enterprise sin refactor

### Negative
- Complejidad de RLS (dev necesita entender SET LOCAL)
- Debugging más difícil: un bug silencioso es filtro de RLS escondido
  (mitigo con tests: "verificar que admin de Tenant A no ve órdenes de Tenant B")
- Queries manuales sin tenant_id filter = silent (RLS filtra, no error)

## Guardrails

1. **Convención**: Toda tabla tiene tenant_id + RLS policy
2. **Testing**: Integration tests verifican aislamiento de tenants
3. **Code Review**: Revisar queries SELECT manuales para tenant_id filter
4. **Logging**: Audit log de todas las operaciones (quién, qué, cuándo, de qué tenant)

## Related ADRs
- [0001](./0001-monolito-modular-en-dotnet.md) — Backend
- [0005](./0005-segundo-plano-con-polling-a-postgres.md) — Workers que recorren todas las tiendas
