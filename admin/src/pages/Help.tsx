import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BadgePercent, BarChart3, BookOpen, ChevronRight, CreditCard, FileText,
  Globe, LifeBuoy, Mail, MapPin, MessageCircle, MessageSquare, Package, Palette, Phone,
  Rocket, Search, Settings2, ShoppingBag, Truck, Users, Warehouse,
} from 'lucide-react';
import { HELP_CONTENT, type HelpArticle } from '../config/helpContent';
import { HELP_LINKS, type HelpLinkId } from '../config/features';

// Ícono por tema (con fallback genérico).
const ICONS: Partial<Record<HelpLinkId, typeof BookOpen>> = {
  primerosPasos: Rocket,
  payments: CreditCard,
  ventas: ShoppingBag,
  checkout: Settings2,
  cupones: BadgePercent,
  shipping: Truck,
  distributionCenters: Warehouse,
  productos: Package,
  clientes: Users,
  posventa: MessageCircle,
  autoEmails: Mail,
  contact: MapPin,
  whatsapp: Phone,
  customerMessage: MessageSquare,
  tema: Palette,
  paginas: FileText,
  estadisticas: BarChart3,
  users: Users,
  domains: Globe,
};

const CATEGORY_ORDER = [
  'Empezar',
  'Ventas y pagos',
  'Envíos',
  'Catálogo',
  'Clientes y comunicación',
  'Tu tienda online',
  'Equipo',
];

function TopicIcon({ id, className }: { id: HelpLinkId; className?: string }) {
  const Icon = ICONS[id] ?? BookOpen;
  return <Icon className={className} />;
}

function HelpShell({ children, width = 'max-w-2xl' }: { children: ReactNode; width?: string }) {
  return (
    <div className="min-h-screen bg-bg-subtle text-fg">
      <header className="sticky top-0 z-20 flex h-header items-center gap-2.5 border-b border-border bg-surface/80 px-6 backdrop-blur-xl">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-fg">t</span>
        <span className="text-base font-semibold tracking-tight">Centro de ayuda</span>
        <Link to="/ayuda" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
          <BookOpen className="h-4 w-4" /> Todos los temas
        </Link>
      </header>
      <main className={`mx-auto ${width} px-5 py-12`}>{children}</main>
    </div>
  );
}

/** ¿El artículo matchea la búsqueda? (título, intro, headings y texto). */
function matches(article: HelpArticle, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    article.title,
    article.intro,
    ...article.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.steps ?? [])]),
  ].join(' ').toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function HelpArticlePage() {
  const { topic } = useParams<{ topic: string }>();
  const id = topic as HelpLinkId | undefined;
  const article = id ? HELP_CONTENT[id] : undefined;

  if (!article || !id) {
    return (
      <HelpShell>
        <h1 className="text-2xl font-bold tracking-tight">Tema no encontrado</h1>
        <p className="mt-2 text-fg-muted">El artículo que buscás no existe.</p>
        <Link to="/ayuda" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Ver todos los temas
        </Link>
      </HelpShell>
    );
  }

  const related = (Object.keys(HELP_CONTENT) as HelpLinkId[])
    .filter((k) => k !== id && HELP_CONTENT[k].category === article.category)
    .slice(0, 4);

  return (
    <HelpShell>
      <Link to="/ayuda" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Centro de ayuda
      </Link>
      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TopicIcon id={id} className="h-5 w-5" />
        </span>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{article.category}</div>
          <h1 className="text-3xl font-bold tracking-tight">{article.title}</h1>
        </div>
      </div>
      <p className="mt-3 text-lg text-fg-muted">{article.intro}</p>

      <div className="mt-8 space-y-6 rounded-2xl border border-border bg-surface p-7 shadow-card">
        {article.sections.map((s, i) => (
          <section key={i} className="border-b border-border pb-6 last:border-b-0 last:pb-0">
            <h2 className="text-lg font-semibold text-fg">{s.heading}</h2>
            {s.paragraphs?.map((p, j) => (
              <p key={j} className="mt-2 leading-relaxed text-fg-muted">{p}</p>
            ))}
            {s.steps && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-fg-muted marker:text-fg-subtle">
                {s.steps.map((step, j) => <li key={j} className="leading-relaxed">{step}</li>)}
              </ol>
            )}
          </section>
        ))}
      </div>

      {related.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">Relacionados</h2>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {related.map((r) => (
              <Link key={r} to={`/ayuda/${r}`}
                className="group flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-fg transition-colors hover:border-primary/40">
                <TopicIcon id={r} className="h-4 w-4 text-fg-subtle group-hover:text-primary" />
                {HELP_CONTENT[r].title}
                <ChevronRight className="ml-auto h-4 w-4 text-fg-subtle" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </HelpShell>
  );
}

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
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  }, [ids, query]);

  return (
    <HelpShell width="max-w-4xl">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">¿Con qué te ayudamos?</h1>
        <p className="mt-3 text-lg text-fg-muted">Guías para sacarle el jugo a cada parte de tu tienda.</p>
        <div className="relative mx-auto mt-6 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscá: reembolsos, envíos, roles, cupones…"
            autoFocus
            className="h-12 w-full rounded-full border border-border bg-surface pl-11 pr-5 text-sm text-fg shadow-card outline-none transition-shadow focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {byCategory.length === 0 ? (
        <div className="mt-14 text-center text-fg-muted">
          <LifeBuoy className="mx-auto h-9 w-9 opacity-40" />
          <p className="mt-3">No encontramos nada con “{query}”.</p>
          <button onClick={() => setQuery('')} className="mt-2 text-sm font-medium text-primary hover:underline">
            Ver todos los temas
          </button>
        </div>
      ) : (
        byCategory.map(({ category, items }) => (
          <div key={category} className="mt-10">
            <h2 className="mb-3.5 text-sm font-semibold uppercase tracking-wider text-fg-subtle">{category}</h2>
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
                    <div className="font-semibold text-fg">{HELP_CONTENT[id].title}</div>
                    <div className="mt-0.5 truncate text-sm text-fg-muted">{HELP_LINKS[id].label}</div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="mt-14 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
        <LifeBuoy className="h-7 w-7 text-primary" />
        <p className="font-semibold text-fg">¿No encontraste lo que buscabas?</p>
        <p className="text-sm text-fg-muted">Escribinos y te damos una mano con tu tienda.</p>
        <a href="mailto:soporte@tiendafy.com" className="mt-1 text-sm font-medium text-primary hover:underline">
          soporte@tiendafy.com
        </a>
      </div>
    </HelpShell>
  );
}
