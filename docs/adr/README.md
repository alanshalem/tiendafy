# Architecture Decision Records (ADRs)

Registro de decisiones arquitectónicas significativas de Tiendafy. Cada ADR captura:
- **Qué**: La decisión tomada
- **Por qué**: El contexto, alternativas evaluadas, y justificación
- **Cuándo cambia**: Cómo evolucionamos de esta decisión

## Propósito

1. **Documentación**: Por qué elegimos .NET en vez de Node
2. **Onboarding**: Nuevo dev entiende la arquitectura sin preguntar
3. **Justificación**: Si alguien pregunta "¿por qué RLS?", respuesta está documentada
4. **Historicidad**: En 5 años, sé qué problemas enfrentamos en año 1

## Cómo Leer un ADR

Formato simple:
- **Context**: Problema y alternativas
- **Decision**: Qué elegimos
- **Justification**: Por qué (razones técnicas y de negocio)
- **Consequences**: Tradeoffs (qué ganamos, qué perdemos)
- **Related ADRs**: Enlaces a decisiones relacionadas

## Cómo Escribir un ADR

```markdown
# ADR NNNN: [Título]

**Date**: 2026-06-11
**Status**: Accepted | Rejected | Superseded by [[0005]]
**Decision Makers**: Alan Shalem (o tu nombre)

## Context
Problema que enfrentamos. Alternativas consideradas.

## Decision
Qué decidimos.

## Justification
Por qué. Por favor sé honesto: qué ganamos y qué perdemos.

## Consequences
Implicaciones concretas.

## Migration Path (opcional)
Si la decisión puede cambiar, cómo evolucionamos.

## Related ADRs
[[0001]], [[0003]]
```

### Tips

1. **Sé específico**: "Monolito en .NET" es vago. "Monolito modular (.NET) en lugar de microservicios (Node)" es claro.
2. **Enumera alternativas**: Aún si las rechazas, deja constancia.
3. **Sé honesto con tradeoffs**: "Ruby es más rápido para MVP pero refactor a 5 años es doloroso" > "Ruby es malo"
4. **Linkea relacionadas**: Usa `[[0001]]` para cross-reference.
5. **Números secuenciales**: 0001, 0002, ... (no re-numerices si reordenas)
6. **Status es importante**: Si una decisión es superseded, documenta por qué.

## Lista de ADRs

| # | Título | Status | Resumen |
|---|--------|--------|---------|
| [[0001-dotnet-monolith\|0001]] | Monolito Modular .NET | Accepted | Por qué .NET + monolito |
| [[0002-next-and-vite\|0002]] | Storefront (Next.js) + Admin (Vite) | Accepted | Por qué dos frameworks |
| [[0003-postgres-rls\|0003]] | Multi-tenancy con PostgreSQL RLS | Accepted | Por qué shared DB + RLS |

## Próximos ADRs a Escribir

- 0004: CQRS Liviano (commands y queries separadas)
- 0005: Outbox/Inbox Pattern (consistencia async)
- 0006: Mercado Pago Integration (marketplace model)
- 0007: Checkout Saga (orquestación de estados)
- 0008: API Public v1 (rate limiting, OAuth, webhooks)
- 0009: Search Strategy (Postgres FTS vs Meilisearch)
- 0010: Cell-Based Architecture (cuando escalamos a 10k+)

## Cuándo Escribir un ADR

Escribe un ADR cuando:
- Decisión afecta a múltiples módulos
- Trade-offs no son obvios
- La decisión se puede cuestionar en el futuro
- Quieres evitar el mismo debate en un año

No escribas ADR para:
- "Usamos React en el storefront" (está en 0002)
- "Nombre de una variable"
- Decisiones tácticas diarias (esas van en commit messages)

## Revisión

Antes de mergear un ADR:
1. Review técnico: ¿la justificación es sólida?
2. Review de impacto: ¿toca a otros equipos? ¿están de acuerdo?
3. Review de claridad: ¿nuevo dev entiende sin preguntar?
