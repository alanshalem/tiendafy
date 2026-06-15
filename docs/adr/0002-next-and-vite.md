# ADR 0002: Storefront (Next.js) + Admin (Vite + React)

**Date**: 2026-06-11
**Status**: Accepted
**Decision Makers**: Alan Shalem

## Context

Frontend split en dos aplicaciones distintas:
- **Storefront**: público, vive del SEO, caché agresivo en CDN, SSR
- **Admin**: detrás de login, densa en interactividad, no necesita SEO

Pregunta: ¿usar el mismo framework/stack, o elegir per-aplicación?

## Decision

**Storefront**: Next.js 14 (SSR + ISR)
**Admin**: React 19 + Vite (SPA)
**Compartido**: React, TypeScript, Tailwind, design system

### No usar un solo framework para ambas

## Justification

### 1. Perfil de Renderizado
- **Storefront**: Público, SEO crítico, caché = ISR/SSG + CDN
  - Home page → ISR cada 1h
  - Product detail → SSG con ISR on-demand (cuando stock cambia)
  - Necesito Next.js para SSR/ISR out-of-the-box
- **Admin**: Login requerido, densa en tablas/forms, sin SEO
  - SPA es más simple: React router, React Query, sin server middleware
  - SSR acá es overhead puro (no hay bots, no hay vanity metrics)

### 2. Blast Radius
- Admin bug → merchants molestos
- Storefront bug → tus clientes pierden ventas
- Un deploy conjunto requiere escalar + invalidar caché ambos
- Separarlos = deployables independientes, SLOs distintos

### 3. Seguridad
- Storefront vive en `*.tuplataforma.com` (dominio multi-tenant, controlado por terceros)
- Admin en `admin.tuplataforma.com` (dominio corporativo)
- Una cookie mal scopeada en el mismo app = filtra credencial de admin al storefront
- Dominios separados = error de seguridad en el app se limita a su dominio

### 4. Performance Budget
- Storefront: pelea por cada KB (Core Web Vitals = sales conversion)
  - Next.js: built-in image optimization, font subsetting, code splitting
  - ISR: home → CDN 100%, revalidate on-demand
- Admin: 2MB JavaScript y a nadie le importa
  - Vite: dev server instantáneo, código compartido con storefront

### 5. Contratación
- Una skill: React + TypeScript
- Dos modos: SPA dev (admin) y SSR dev (storefront)
- Dev puede trabajar en ambas, focus depende de assignment

## Stack Detail

### Storefront (Next.js)
```
Rendering:
- Static: product listing, category pages (SSG + ISR)
- Dynamic: cart, checkout (dynamic on-demand)
- ISR: home, featured products (1h revalidate + on-demand revalidate via API call)

Optimization:
- Image: next/image con optimización automática
- Font: next/font (subsetted)
- Script: next/script para third-parties (MP payment widget)
- CSS: Tailwind + CSS-in-JS (component scoped)

Data Fetching:
- getStaticProps / getStaticPaths: catálogo compilado en build
- getServerSideProps: checkout session data
- SWR en el cliente: cart state
- Revalidation: on-demand via API call cuando stock/precio cambia

Deployment:
- Next.js on Cloud Run / Vercel
- CDN Cloudflare adelante
- Purge de ISR por tenant cuando tema cambia
```

### Admin (Vite + React)
```
Rendering:
- SPA: React Router, cero server-side rendering
- Code split por ruta (lazy load, Suspense)

Data Fetching:
- React Query: caching, refetch, optimistic updates
- HTTP client: SWR o simple fetch

Deployment:
- SPA en Cloud Run / S3 + CloudFront
- Service Worker opcional para offline support
- Cache-busting: hash en filenames, aggressive cache headers
```

### Shared
```
Design System:
- Tailwind config en raíz
- Componentes UI shared: Button, Input, Card, Table, Modal
- Viven en /shared/ui o en un mono-package
- Sincronización manual (ambas consumen mismo Tailwind config)

State Management:
- Zustand para simple client state
- Storefront: carrito (localStorage + API persisten)
- Admin: modal state, sidebar collapse, user preferences

Types:
- /shared/types: API responses, domain models
- Compiladas desde OpenAPI spec (backend source of truth)
```

## Migration Path

**Future**: Si a 500k tiendas el storefront necesita rendering en el edge, migramos a Remix/SolidStart sin cambiar filosofía. Admin sigue siendo SPA.

## Consequences

### Positive
- Cada app optimizada para su caso
- Deployables independientes
- Seguridad mejorada por separación de dominio
- Dev experience clara: SPA dev vs SSR dev

### Negative
- Dos repos (o monorepo con build independiente)
- Duplicación de design system (pero Tailwind config compartida mitiga)
- Sincronización manual de types/components

## Related ADRs
- [[0001-dotnet-monolith]] — Backend stack
- [[0003-postgres-rls]] — Multi-tenancy patterns
