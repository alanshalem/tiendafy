# Architecture Decision Records (ADRs)

Las decisiones de arquitectura de Tiendafy que no son obvias leyendo el código:
qué se decidió, por qué, qué alternativas se descartaron y qué se pierde.

Un ADR registra una decisión en su momento: **el texto de la decisión no se
reescribe**. Cuando la realidad se aparta de lo escrito, se agrega o actualiza
la sección **Estado** con la fecha y lo que pasó; si la decisión se abandona,
se marca como reemplazada y se escribe un ADR nuevo.

## Lista

| # | Título | Estado al 15-oct-2026 |
| --- | --- | --- |
| [0001](./0001-monolito-modular-en-dotnet.md) | Monolito modular en .NET | Vigente. 21 módulos; sin host Worker ni broker (ver 0005); fronteras verificadas por tests |
| [0002](./0002-next-y-vite.md) | Storefront en Next.js + panel en Vite | Vigente. Next 16 con App Router y Data Cache, no SSG/ISR por build ni CDN |
| [0003](./0003-multi-tienda-con-rls.md) | Multi-tenancy con base compartida y RLS | Parcial: base compartida con `tenant_id` sí; RLS no. Aislamiento por query filters de EF + test que los exige |
| [0004](./0004-una-imagen-y-un-compose.md) | Una imagen para todos los ambientes y un solo compose | Vigente e implementado. Staging pendiente |
| [0005](./0005-segundo-plano-con-polling-a-postgres.md) | Segundo plano con polling a Postgres dentro de la API | Vigente e implementado |

## Cuándo escribir uno

- La decisión afecta a varios módulos o a la infraestructura.
- Los trade-offs no son obvios y alguien la va a cuestionar.
- Querés evitar el mismo debate dentro de un año.

No hace falta para decisiones tácticas (van en el mensaje del commit) ni para
lo que ya cubre un ADR existente.

## Formato

Los ADR 0001 a 0003 están escritos con títulos en inglés; los nuevos, en
castellano. Lo mínimo:

```markdown
# ADR NNNN: Título concreto

**Date**: AAAA-MM-DD
**Status**: Accepted | Rejected | Reemplazado por [NNNN](./NNNN-....md)
**Decision Makers**: ...

## Contexto
El problema y las alternativas consideradas.

## Decisión
Qué se eligió.

## Consecuencias
Qué se gana y qué se pierde, sin maquillar.

## Estado (fecha)
Qué pasó después. Se actualiza; el resto no.

## Related ADRs
[NNNN](./NNNN-....md)
```

Números secuenciales (0001, 0002…) que no se renumeran. Los links, como
links de Markdown relativos: GitHub no entiende `[[wikilinks]]`.
