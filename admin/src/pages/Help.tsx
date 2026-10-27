import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Globe,
  Info,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  LifeBuoy,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  OctagonAlert,
  Package,
  Palette,
  PanelTop,
  Phone,
  Receipt,
  Rocket,
  Scale,
  Search,
  Server,
  Settings2,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Terminal,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  Wallet,
  Tags,
  Handshake,
} from 'lucide-react';
import {
  HELP_CONTENT,
  type HelpArticle,
  type HelpBlock,
  HELP_CATEGORIES,
  type HelpCategory,
} from '../config/helpContent';
import type { HelpLinkId } from '../config/features';
import { HelpDemo } from '../components/HelpDemos';
import { PAGE_MAIN } from '../lib/styles';
import { foldText } from '../lib/text';

// Ícono por tema (con fallback genérico).
const ICONS: Partial<Record<HelpLinkId, typeof BookOpen>> = {
  primerosPasos: Rocket,
  payments: CreditCard,
  ventas: ShoppingBag,
  checkout: Settings2,
  cupones: BadgePercent,
  mercadolibre: Store,
  shipping: Truck,
  correoArgentino: Truck,
  zipnova: Truck,
  productos: Package,
  clientes: Users,
  posventa: MessageCircle,
  autoEmails: Mail,
  emailMarketing: Mail,
  whatsappAuto: Phone,
  contact: MapPin,
  whatsapp: Phone,
  customerMessage: MessageSquare,
  tema: Palette,
  temaInicio: LayoutTemplate,
  temaSecciones: LayoutGrid,
  temaPaginas: PanelTop,
  paginas: FileText,
  estadisticas: BarChart3,
  users: Users,
  domains: Globe,
  fiscal: Receipt,
  legal: Scale,
  seo: TrendingUp,
  externalCodes: BarChart3,
  fichaTecnica: Package,
  ajustesAvanzados: SlidersHorizontal,
  presupuestos: FileText,
  ia: Sparkles,
  asistente: Sparkles,
  // Finanzas y compras: la plata y con quién se gasta.
  tesoreria: Wallet,
  cuentasCorrientes: Handshake,
  listasDePrecios: Tags,
  proveedores: Truck,
  // Administrar la plataforma: el recorrido, de entender a mantener.
  plataformaPuestaEnMarcha: Rocket,
  plataformaDesarrollo: Terminal,
  plataformaClaves: KeyRound,
  plataformaDeploy: Server,
  plataformaTramites: FileText,
  integracionesProduccion: ClipboardCheck,
  plataformaOperacion: Wrench,
};

const CATEGORY_ORDER = HELP_CATEGORIES;

const CATEGORY_ICONS: Record<HelpCategory, typeof BookOpen> = {
  Empezar: Rocket,
  'Ventas y pagos': CreditCard,
  'Legal y facturación': Scale,
  Envíos: Truck,
  Catálogo: Package,
  Finanzas: Wallet,
  'Clientes y comunicación': MessageCircle,
  'Tu tienda online': Palette,
  Equipo: Users,
  'Administrar la plataforma': Wrench,
};

/** Artículos destacados en el índice cuando no hay búsqueda. */
const POPULAR: HelpLinkId[] = ['primerosPasos', 'payments', 'shipping', 'fiscal'];

const slug = (s: string) => foldText(s).replace(/[^a-z0-9]+/g, '-');

function TopicIcon({ id, className }: { id: HelpLinkId; className?: string }) {
  const Icon = ICONS[id] ?? BookOpen;
  return <Icon className={className} />;
}

/** El mismo ancho que las páginas del panel (PAGE_MAIN); el texto largo se angosta adentro. */
function HelpShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen scroll-smooth bg-bg-subtle text-fg">
      <header className="sticky top-0 z-20 flex h-header items-center gap-2.5 border-b border-border bg-surface/80 px-4 backdrop-blur-xl sm:px-6 md:px-8">
        <Link
          to="/ayuda"
          aria-label="Centro de ayuda — inicio"
          className="flex items-center gap-2.5 hover:opacity-80"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-fg">
            t
          </span>
          <span className="text-base font-semibold tracking-tight">Centro de ayuda</span>
        </Link>
        <Link
          to="/ayuda"
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
        >
          <BookOpen className="h-4 w-4" /> Todos los temas
        </Link>
      </header>
      <main className={PAGE_MAIN}>{children}</main>
    </div>
  );
}

// ---------------------------------------------------------------- Búsqueda

/** Texto plano de un bloque, para que la búsqueda también lo encuentre. */
/** Todos los textos de las secciones (headings, párrafos, pasos, bloques). */
function sectionTexts(article: HelpArticle): string[] {
  return article.sections.flatMap((s) => [
    s.heading,
    ...(s.paragraphs ?? []),
    ...(s.steps ?? []),
    ...(s.blocks ?? []).map(blockText),
  ]);
}

function blockText(b: HelpBlock): string {
  switch (b.type) {
    case 'callout':
      return `${b.title ?? ''} ${b.text}`;
    case 'path':
      return `${b.label ?? ''} ${b.segments.join(' ')}`;
    case 'table':
      return [...b.headers, ...b.rows.flat()].join(' ');
    case 'terms':
      return b.items.map((t) => `${t.term} ${t.def}`).join(' ');
    case 'checklist':
      return b.items.join(' ');
    case 'demo':
      return b.caption ?? '';
  }
}

/** ¿El artículo matchea la búsqueda? (título, intro, palabras clave, headings, texto y bloques). */
function matches(article: HelpArticle, q: string): boolean {
  // Sin tildes de los dos lados: "envios" tiene que encontrar "envíos".
  const needle = foldText(q.trim());
  if (!needle) return true;
  const haystack = foldText(
    [article.title, article.intro, ...(article.keywords ?? []), ...sectionTexts(article)].join(' '),
  );
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * Resalta las palabras buscadas dentro de un texto.
 *
 * La búsqueda ignora tildes, así que el resaltado también: se busca sobre el
 * texto sin tildes y se marca el original ("envios" resalta "envíos").
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = foldText(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return <>{text}</>;

  const chars = Array.from(text);
  const folded = chars.map(foldText);
  // De cada posición del texto sin tildes, a qué carácter del original pertenece.
  const owner = folded.flatMap((f, i) => Array.from(f, () => i));
  const flat = folded.join('');
  const marked = chars.map(() => false);
  for (const word of words) {
    for (let at = flat.indexOf(word); at !== -1; at = flat.indexOf(word, at + word.length)) {
      for (let k = at; k < at + word.length; k++) marked[owner[k]!] = true;
    }
  }

  // Tramos consecutivos marcados / sin marcar.
  const parts: { text: string; mark: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = parts.at(-1);
    if (last && last.mark === marked[i]) last.text += c;
    else parts.push({ text: c, mark: marked[i]! });
  });
  return (
    <>
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className="rounded-sm bg-warning-bg px-0.5 text-fg">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------- Bloques

const CALLOUT_STYLES = {
  tip: { icon: Lightbulb, cls: 'border-success/25 bg-success-bg text-success', label: 'Tip' },
  info: { icon: Info, cls: 'border-info/25 bg-info-bg text-info', label: 'Bueno saberlo' },
  warning: { icon: AlertTriangle, cls: 'border-warning/25 bg-warning-bg text-warning', label: 'Ojo' },
  danger: { icon: OctagonAlert, cls: 'border-danger/25 bg-danger-bg text-danger', label: 'Importante' },
} as const;

function BlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'callout': {
      const s = CALLOUT_STYLES[block.tone];
      const Icon = s.icon;
      return (
        <div className={`mt-4 flex gap-3 rounded-xl border p-4 ${s.cls}`}>
          <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{block.title ?? s.label}</div>
            <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{block.text}</p>
          </div>
        </div>
      );
    }
    case 'path':
      return (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
            <MousePointerClick className="h-3.5 w-3.5" /> {block.label ?? 'Dónde está'}:
          </span>
          <span className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-card">
            {block.segments.map((seg, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-fg">
                {i > 0 && <ChevronRight className="h-3 w-3 text-fg-subtle" />}
                {seg}
              </span>
            ))}
          </span>
        </div>
      );
    case 'table':
      return (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-muted/60 text-left">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3.5 py-2.5 font-semibold text-fg">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={`px-3.5 py-2.5 align-top leading-relaxed ${j === 0 ? 'font-medium text-fg' : 'text-fg-muted'}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'terms':
      return (
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
          {block.items.map((t, i) => (
            <div key={i} className="px-4 py-3">
              <dt className="text-sm font-semibold text-fg">{t.term}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-fg-muted">{t.def}</dd>
            </div>
          ))}
        </dl>
      );
    case 'checklist':
      return (
        <ul className="mt-4 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      );
    case 'demo':
      return (
        <figure className="mt-4 rounded-xl border border-dashed border-border-strong/60 bg-bg-subtle/60 p-4">
          <figcaption className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Así se ve en tu panel
          </figcaption>
          <HelpDemo demo={block.demo} />
          {block.caption && <p className="mt-3 text-xs text-fg-subtle">{block.caption}</p>}
        </figure>
      );
  }
}

// ---------------------------------------------------------------- Artículo

/** Minutos de lectura estimados (200 palabras/min, mínimo 1). */
function readingMinutes(article: HelpArticle): number {
  const words = [article.intro, ...sectionTexts(article)].join(' ').split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** Índice lateral del artículo con resaltado de la sección visible. */
function Toc({ headings }: { headings: string[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number(e.target.getAttribute('data-toc-index')));
        if (visible.length > 0) setActive(Math.min(...visible));
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    document.querySelectorAll('[data-toc-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
      <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">En esta página</div>
      <ul className="mt-3 space-y-0.5 border-l border-border">
        {headings.map((h, i) => (
          <li key={i}>
            <a
              href={`#${slug(h)}`}
              className={`-ml-px block border-l-2 py-1 pl-3 text-[13px] leading-snug transition-colors ${
                active === i
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg'
              }`}
            >
              {h}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function HelpArticlePage() {
  const { topic } = useParams<{ topic: string }>();
  const id = topic as HelpLinkId | undefined;
  const article = id ? HELP_CONTENT[id] : undefined;
  const topRef = useRef<HTMLDivElement>(null);

  // Al navegar entre artículos (relacionados, anterior/siguiente) volver arriba.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [id]);

  if (!article || !id) {
    return (
      <HelpShell>
        <h1 className="text-2xl font-bold tracking-tight">Tema no encontrado</h1>
        <p className="mt-2 text-fg-muted">El artículo que buscás no existe.</p>
        <Link
          to="/ayuda"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Ver todos los temas
        </Link>
      </HelpShell>
    );
  }

  const all = Object.keys(HELP_CONTENT) as HelpLinkId[];
  const ordered = CATEGORY_ORDER.flatMap((c) => all.filter((k) => HELP_CONTENT[k].category === c));
  const pos = ordered.indexOf(id);
  const prev = pos > 0 ? ordered[pos - 1] : undefined;
  const next = pos < ordered.length - 1 ? ordered[pos + 1] : undefined;

  const related = all.filter((k) => k !== id && HELP_CONTENT[k].category === article.category).slice(0, 4);

  return (
    <HelpShell>
      <div ref={topRef} className="scroll-mt-24" />
      {/* Migas de pan */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-fg-muted">
        <Link to="/ayuda" className="hover:text-fg">
          Centro de ayuda
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
        <Link to={`/ayuda#cat-${slug(article.category)}`} className="hover:text-fg">
          {article.category}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
        <span className="text-fg">{article.title}</span>
      </nav>

      {/* La columna del texto queda en un largo de línea cómodo de leer; el índice, al lado. */}
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,48rem)_220px] lg:gap-12">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TopicIcon id={id} className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{article.title}</h1>
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-fg-subtle">
                <Clock className="h-3.5 w-3.5" /> {readingMinutes(article)} min de lectura ·{' '}
                {article.sections.length} secciones
              </div>
            </div>
          </div>
          <p className="mt-4 text-lg text-fg-muted">{article.intro}</p>

          <div className="mt-8 space-y-6 rounded-2xl border border-border bg-surface p-7 shadow-card">
            {article.sections.map((s, i) => (
              <section
                key={i}
                id={slug(s.heading)}
                data-toc-index={i}
                className="scroll-mt-24 border-b border-border pb-6 last:border-b-0 last:pb-0"
              >
                <h2 className="text-lg font-semibold text-fg">{s.heading}</h2>
                {s.paragraphs?.map((p, j) => (
                  <p key={j} className="mt-2 leading-relaxed text-fg-muted">
                    {p}
                  </p>
                ))}
                {s.steps && (
                  <ol className="mt-3 space-y-2.5">
                    {s.steps.map((step, j) => (
                      <li key={j} className="flex gap-3 leading-relaxed text-fg-muted">
                        <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-bold text-primary">
                          {j + 1}
                        </span>
                        <span className="min-w-0">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {s.blocks?.map((b, j) => (
                  <BlockView key={j} block={b} />
                ))}
              </section>
            ))}
          </div>

          {/* Anterior / siguiente */}
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {prev ? (
              <Link
                to={`/ayuda/${prev}`}
                className="group flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-primary/40"
              >
                <ArrowLeft className="h-4 w-4 shrink-0 text-fg-subtle group-hover:text-primary" />
                <span className="min-w-0">
                  <span className="block text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                    Anterior
                  </span>
                  <span className="block truncate text-sm font-medium text-fg">
                    {HELP_CONTENT[prev].title}
                  </span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                to={`/ayuda/${next}`}
                className="group flex items-center justify-end gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-right transition-colors hover:border-primary/40"
              >
                <span className="min-w-0">
                  <span className="block text-2xs font-medium uppercase tracking-wider text-fg-subtle">
                    Siguiente
                  </span>
                  <span className="block truncate text-sm font-medium text-fg">
                    {HELP_CONTENT[next].title}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle group-hover:text-primary" />
              </Link>
            )}
          </div>

          {related.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">Relacionados</h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {related.map((r) => (
                  <Link
                    key={r}
                    to={`/ayuda/${r}`}
                    className="group flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-fg transition-colors hover:border-primary/40"
                  >
                    <TopicIcon id={r} className="h-4 w-4 text-fg-subtle group-hover:text-primary" />
                    {HELP_CONTENT[r].title}
                    <ChevronRight className="ml-auto h-4 w-4 text-fg-subtle" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <Toc headings={article.sections.map((s) => s.heading)} />
      </div>
    </HelpShell>
  );
}

// ---------------------------------------------------------------- Índice

export function HelpIndexPage() {
  const [query, setQuery] = useState('');
  const ids = Object.keys(HELP_CONTENT) as HelpLinkId[];

  const byCategory = useMemo(() => {
    const filtered = ids.filter((id) => matches(HELP_CONTENT[id], query));
    const groups = new Map<string, HelpLinkId[]>();
    for (const id of filtered) {
      const cat = HELP_CONTENT[id].category;
      groups.set(cat, [...(groups.get(cat) ?? []), id]);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      items: groups.get(c)!,
    }));
  }, [ids, query]);

  const totalShown = byCategory.reduce((n, g) => n + g.items.length, 0);
  const searching = query.trim().length > 0;

  // Llegada con ancla (#cat-…) desde las migas de un artículo.
  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ block: 'start' });
    }
  }, []);

  return (
    <HelpShell>
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">¿Con qué te ayudamos?</h1>
        <p className="mt-3 text-lg text-fg-muted">
          {ids.length} guías para sacarle el jugo a cada parte de tu tienda.
        </p>
        <div className="relative mx-auto mt-6 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            aria-label="Buscar en la ayuda"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscá: reembolsos, envíos, roles, cupones…"
            autoFocus
            className="h-12 w-full rounded-full border border-border bg-surface pl-11 pr-5 text-sm text-fg shadow-card outline-none transition-shadow focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Accesos por categoría */}
        {!searching && (
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
            {CATEGORY_ORDER.map((c) => {
              const Icon = CATEGORY_ICONS[c] ?? BookOpen;
              const count = ids.filter((id) => HELP_CONTENT[id].category === c).length;
              return (
                <a
                  key={c}
                  href={`#cat-${slug(c)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-primary/40 hover:text-fg"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" /> {c}
                  <span className="text-fg-subtle">{count}</span>
                </a>
              );
            })}
          </div>
        )}
        {searching && totalShown > 0 && (
          <p className="mt-4 text-sm text-fg-subtle">
            {totalShown} {totalShown === 1 ? 'guía encontrada' : 'guías encontradas'}
          </p>
        )}
      </div>

      {/* Destacados */}
      {!searching && (
        <div className="mt-10">
          <h2 className="mb-3.5 text-sm font-semibold uppercase tracking-wider text-fg-subtle">
            Los más consultados
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {POPULAR.map((id) => (
              <Link
                key={id}
                to={`/ayuda/${id}`}
                className="group rounded-2xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-overlay"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TopicIcon id={id} className="h-[18px] w-[18px]" />
                </span>
                <div className="mt-2.5 text-sm font-semibold text-fg">{HELP_CONTENT[id].title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fg-muted">
                  {HELP_CONTENT[id].intro}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {byCategory.length === 0 ? (
        <div className="mt-14 text-center text-fg-muted">
          <LifeBuoy className="mx-auto h-9 w-9 opacity-40" />
          <p className="mt-3">No encontramos nada con “{query}”.</p>
          <button
            onClick={() => setQuery('')}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Ver todos los temas
          </button>
        </div>
      ) : (
        byCategory.map(({ category, items }) => {
          const CatIcon = CATEGORY_ICONS[category] ?? BookOpen;
          return (
            <div key={category} id={`cat-${slug(category)}`} className="mt-10 scroll-mt-24">
              <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-fg-subtle">
                <CatIcon className="h-4 w-4 text-primary" /> {category}
                <span className="font-normal normal-case tracking-normal">
                  · {items.length} {items.length === 1 ? 'guía' : 'guías'}
                </span>
              </h2>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {items.map((id) => (
                  <Link
                    key={id}
                    to={`/ayuda/${id}`}
                    className="group flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-overlay"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <TopicIcon id={id} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-fg">
                        <Highlight text={HELP_CONTENT[id].title} query={query} />
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-sm leading-snug text-fg-muted">
                        <Highlight text={HELP_CONTENT[id].intro} query={query} />
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="mt-14 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
        <LifeBuoy className="h-7 w-7 text-primary" />
        <p className="font-semibold text-fg">¿No encontraste lo que buscabas?</p>
        <p className="text-sm text-fg-muted">Escribinos y te damos una mano con tu tienda.</p>
        <a
          href="mailto:soporte@tiendafy.com"
          className="mt-1 text-sm font-medium text-primary hover:underline"
        >
          soporte@tiendafy.com
        </a>
      </div>
    </HelpShell>
  );
}
