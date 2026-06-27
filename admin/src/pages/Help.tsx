import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import { HELP_CONTENT } from '../config/helpContent';
import { HELP_LINKS, type HelpLinkId } from '../config/features';

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

export function HelpArticlePage() {
  const { topic } = useParams<{ topic: string }>();
  const article = topic ? HELP_CONTENT[topic as HelpLinkId] : undefined;

  if (!article) {
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

  return (
    <HelpShell>
      <Link to="/ayuda" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Centro de ayuda
      </Link>
      <h1 className="mt-5 text-3xl font-bold tracking-tight">{article.title}</h1>
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
    </HelpShell>
  );
}

export function HelpIndexPage() {
  const ids = Object.keys(HELP_CONTENT) as HelpLinkId[];
  return (
    <HelpShell width="max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight">Centro de ayuda</h1>
      <p className="mt-3 text-lg text-fg-muted">Guías para sacarle el jugo a cada parte de tu tienda.</p>
      <div className="mt-9 grid gap-3.5 sm:grid-cols-2">
        {ids.map((id) => (
          <Link
            key={id}
            to={`/ayuda/${id}`}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-overlay"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-fg">{HELP_CONTENT[id].title}</div>
              <div className="mt-1 text-sm text-fg-muted">{HELP_LINKS[id].label}</div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </HelpShell>
  );
}
