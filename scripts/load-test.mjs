// Prueba de carga del storefront contra el stack levantado (API real, Postgres
// real). Sin dependencias: fetch de Node y percentiles a mano.
//
//   pnpm test:load                         # capacidad: 20 usuarios, 30 s
//   pnpm test:load -- --vus 50 --duration 60
//   pnpm test:load -- --mode protection    # el rate limit corta el abuso
//   pnpm test:load -- --mode protection --cap 300   # contra producción/staging
//
// Modos:
//   capacity    Usuarios virtuales recorriendo la tienda (portada, búsqueda,
//               ficha, checkout) sin pausa. Falla si el p95 o la tasa de error
//               superan los umbrales. Desde una sola IP corta el límite global
//               de la API (5000/min en dev, 300/min en producción): para medir
//               más que eso hay que levantar la API con
//               RateLimiting__GlobalPermitLimit alto. Si aparecen 429, el
//               reporte lo dice y no los cuenta como error.
//   protection  Lo contrario: dispara más pedidos que el cupo (--cap, por
//               defecto el de dev) y verifica que la API responda 429 con
//               Retry-After y el error en formato RFC 7807, en vez de caerse o
//               dejar pasar todo.
//
// Opciones: --api http://localhost:5080  --store <subdominio>  --vus 20
//           --duration 30 (s)  --p95 500 (ms)  --max-errors 1 (%)
//           --cap 5000 (pedidos/min por IP)  --burst cap + 100
import { performance } from 'node:perf_hooks';

const args = parseArgs(process.argv.slice(2));
const API = args.api ?? process.env.API_URL ?? 'http://localhost:5080';
const MODE = args.mode ?? 'capacity';
const VUS = Number(args.vus ?? 20);
const DURATION_S = Number(args.duration ?? 30);
const P95_BUDGET_MS = Number(args.p95 ?? 500);
const MAX_ERROR_PCT = Number(args['max-errors'] ?? 1);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[++i];
  }
  return out;
}

/**
 * La tienda a probar: la pedida, o la primera de las conocidas de dev que
 * resuelva y tenga catálogo (sin productos no hay ficha que medir).
 */
async function resolveStore() {
  const candidates = args.store ? [args.store] : ['smartfox', 'canicari', 'volxen', 'puenteoriente', 'seed'];
  let fallback = null;
  for (const sub of candidates) {
    const res = await fetch(`${API}/api/v1/tenants/resolve?host=${encodeURIComponent(`${sub}.localhost`)}`);
    if (!res.ok) continue;
    const store = { sub, ...(await res.json()) };
    const search = await fetch(`${API}/api/v1/products/search?pageSize=1`, {
      headers: { 'X-Tenant-Id': store.id },
    });
    if (search.ok && (await search.json()).total > 0) return store;
    fallback ??= store;
  }
  if (fallback) return fallback;
  throw new Error(`Ninguna tienda resolvió (${candidates.join(', ')}). Pasá --store <subdominio>.`);
}

const stats = new Map(); // nombre → { lat: number[], errors, throttled }
function record(name, ms, status) {
  const s = stats.get(name) ?? { lat: [], errors: 0, throttled: 0, statuses: {} };
  s.lat.push(ms);
  s.statuses[status] = (s.statuses[status] ?? 0) + 1;
  if (status === 429) s.throttled++;
  else if (status === 0 || status >= 500 || (status >= 400 && status !== 404)) s.errors++;
  stats.set(name, s);
}

async function hit(name, path, tenantId) {
  const t0 = performance.now();
  let status = 0;
  let body = null;
  try {
    const res = await fetch(`${API}${path}`, { headers: { 'X-Tenant-Id': tenantId } });
    status = res.status;
    body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  } catch {
    status = 0;
  }
  record(name, performance.now() - t0, status);
  return { status, body };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Un comprador: entra, busca, mira productos, llega al checkout. */
async function shopperJourney(tenantId, slugs) {
  await hit('theme', '/api/v1/theme', tenantId);
  const first = await hit('search (portada)', '/api/v1/products/search?pageSize=24', tenantId);
  if (first.status === 200 && slugs.length === 0) slugs.push(...first.body.items.map((p) => p.slug));
  await hit('categorías', '/api/v1/categories', tenantId);
  await hit(
    'search (texto)',
    `/api/v1/products/search?q=${pick(['a', 'pro', 'kit', 'set'])}&pageSize=24`,
    tenantId,
  );
  await hit(
    'search (orden por precio)',
    '/api/v1/products/search?sort=price_asc&page=2&pageSize=24',
    tenantId,
  );
  if (slugs.length > 0) await hit('ficha de producto', `/api/v1/products/by-slug/${pick(slugs)}`, tenantId);
  await hit('opciones de checkout', '/api/v1/checkout-settings', tenantId);
  await hit('métodos de envío', '/api/v1/shipping/methods', tenantId);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function report() {
  const rows = [];
  let total = 0;
  let errors = 0;
  let throttled = 0;
  const all = [];
  for (const [name, s] of stats) {
    const lat = [...s.lat].sort((a, b) => a - b);
    all.push(...lat);
    total += lat.length;
    errors += s.errors;
    throttled += s.throttled;
    rows.push({
      endpoint: name,
      pedidos: lat.length,
      'p50 ms': Math.round(percentile(lat, 50)),
      'p95 ms': Math.round(percentile(lat, 95)),
      'p99 ms': Math.round(percentile(lat, 99)),
      'máx ms': Math.round(lat.at(-1) ?? 0),
      errores: s.errors,
      429: s.throttled,
    });
  }
  console.table(rows);
  all.sort((a, b) => a - b);
  return { total, errors, throttled, p95: percentile(all, 95) };
}

async function capacity() {
  const store = await resolveStore();
  console.log(`Capacidad: ${VUS} usuarios × ${DURATION_S}s contra ${store.name} (${store.sub}) en ${API}`);
  const slugs = [];
  const until = Date.now() + DURATION_S * 1000;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: VUS }, async () => {
      while (Date.now() < until) await shopperJourney(store.id, slugs);
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  const { total, errors, throttled, p95 } = report();
  const errorPct = (errors / Math.max(1, total - throttled)) * 100;
  console.log(
    `\n${total} pedidos en ${seconds.toFixed(1)}s (${(total / seconds).toFixed(0)}/s) · p95 ${p95.toFixed(0)} ms · errores ${errorPct.toFixed(2)}% · 429: ${throttled}`,
  );
  if (throttled > 0)
    console.log(
      'ℹ Respondió 429: el límite global por IP cortó la prueba. Para medir más capacidad, levantá la API con RateLimiting__GlobalPermitLimit=100000.',
    );
  const failures = [];
  if (p95 > P95_BUDGET_MS) failures.push(`p95 ${p95.toFixed(0)} ms > ${P95_BUDGET_MS} ms`);
  if (errorPct > MAX_ERROR_PCT) failures.push(`errores ${errorPct.toFixed(2)}% > ${MAX_ERROR_PCT}%`);
  return failures;
}

async function protection() {
  const store = await resolveStore();
  // El cupo global por IP: 5000/min en dev (appsettings.Development.json),
  // 300/min en producción y staging.
  const cap = Number(args.cap ?? 5000);
  const burst = Number(args.burst ?? cap + 100);
  console.log(
    `Protección: ${burst} pedidos seguidos desde una IP contra ${store.name} (cupo global: ${cap}/min)`,
  );
  const results = [];
  for (let i = 0; i < burst; i += 20) {
    results.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(20, burst - i) }, async () => {
          const res = await fetch(`${API}/api/v1/categories`, { headers: { 'X-Tenant-Id': store.id } });
          return {
            status: res.status,
            retryAfter: res.headers.get('retry-after'),
            body: res.status === 429 ? await res.json().catch(() => null) : null,
          };
        }),
      )),
    );
  }
  const limited = results.filter((r) => r.status === 429);
  const served = results.filter((r) => r.status === 200).length;
  const server = results.filter((r) => r.status >= 500).length;
  console.log(`Atendidos: ${served} · cortados con 429: ${limited.length} · 5xx: ${server}`);
  const failures = [];
  if (limited.length === 0) failures.push('ningún 429: el límite por IP no actuó');
  if (server > 0) failures.push(`${server} respuestas 5xx bajo abuso`);
  if (limited.some((r) => !r.retryAfter)) failures.push('un 429 sin Retry-After');
  if (limited.some((r) => r.body?.title !== 'RateLimit.Exceeded'))
    failures.push('un 429 sin el error RFC 7807');
  return failures;
}

const failures = MODE === 'protection' ? await protection() : await capacity();
if (failures.length > 0) {
  console.error(`\n✖ ${failures.join(' · ')}`);
  process.exit(1);
}
console.log('\n✔ Dentro de los umbrales');
