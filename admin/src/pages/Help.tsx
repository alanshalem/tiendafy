import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { HELP_CONTENT } from '../config/helpContent';
import { HELP_LINKS, type HelpLinkId } from '../config/features';

function HelpShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-subtle text-fg">
      <header className="flex h-header items-center gap-2.5 border-b border-border bg-surface px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-black text-primary-fg">t</span>
        <span className="text-base font-bold">Centro de ayuda</span>
        <Link to="/ayuda" className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
          <BookOpen className="h-4 w-4" /> Todos los temas
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>
    </div>
  );
}

export function HelpArticlePage() {
  const { topic } = useParams<{ topic: string }>();
  const article = topic ? HELP_CONTENT[topic as HelpLinkId] : undefined;

  if (!article) {
    return (
      <HelpShell>
        <h1 className="text-2xl font-bold">Tema no encontrado</h1>
        <p className="mt-2 text-fg-muted">El artículo que buscás no existe.</p>
        <Link to="/ayuda" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Ver todos los temas
        </Link>
      </HelpShell>
    );
  }

  return (
    <HelpShell>
      <h1 className="text-3xl font-bold tracking-tight">{article.title}</h1>
      <p className="mt-3 text-lg text-fg-muted">{article.intro}</p>

      <div className="mt-8 space-y-8">
        {article.sections.map((s, i) => (
          <section key={i}>
            <h2 className="text-lg font-bold text-fg">{s.heading}</h2>
            {s.paragraphs?.map((p, j) => (
              <p key={j} className="mt-2 leading-relaxed text-fg-muted">{p}</p>
            ))}
            {s.steps && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-fg-muted">
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
    <HelpShell>
      <h1 className="text-3xl font-bold tracking-tight">Centro de ayuda</h1>
      <p className="mt-3 text-lg text-fg-muted">Guías para sacarle el jugo a cada parte de tu tienda.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {ids.map((id) => (
          <Link
            key={id}
            to={`/ayuda/${id}`}
            className="rounded-lg border border-border bg-surface p-4 shadow-card transition hover:border-primary"
          >
            <div className="font-semibold text-fg">{HELP_CONTENT[id].title}</div>
            <div className="mt-1 text-sm text-fg-muted">{HELP_LINKS[id].label}</div>
          </Link>
        ))}
      </div>
    </HelpShell>
  );
}
