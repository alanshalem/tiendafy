import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, Spinner, Tooltip, cn } from '@tiendafy/ui';
import { POST_STATUS, postDate, postStatus, ProviderIcon, type SocialPostDto } from './redes-shared';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Calendario mensual propio (42 celdas, semana lunes-domingo): los posts caen
 * en su día programado/publicado y un click en el día abre el composer con esa
 * fecha ya cargada.
 */
export function CalendarioTab({
  posts,
  month,
  onMonthChange,
  onDayClick,
  onPostClick,
}: {
  posts: SocialPostDto[] | null; // null = cargando
  month: Date; // primer día del mes visible
  onMonthChange: (month: Date) => void;
  onDayClick: (day: Date) => void;
  onPostClick: (post: SocialPostDto) => void;
}) {
  const [today] = useState(() => new Date());

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // getDay(): 0 = domingo → arrancamos la grilla en lunes.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, SocialPostDto[]>();
    for (const post of posts ?? []) {
      const d = postDate(post);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [posts]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (posts === null) return <Spinner />;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-lg font-semibold text-fg">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            onClick={() => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </Button>
          <Button
            variant="secondary"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            title="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <div className="grid grid-cols-7 border-b border-border bg-bg-muted/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-xs font-semibold uppercase text-fg-subtle">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const inMonth = day.getMonth() === month.getMonth();
            const dayPosts = byDay.get(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`) ?? [];
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => onDayClick(day)}
                onKeyDown={(e) => e.key === 'Enter' && onDayClick(day)}
                className={cn(
                  'group relative min-h-24 cursor-pointer border-b border-r border-border p-1.5 transition-colors hover:bg-bg-muted/40',
                  !inMonth && 'bg-bg-muted/30 opacity-60',
                  isSameDay(day, today) && 'bg-primary/[0.04]',
                  (i + 1) % 7 === 0 && 'border-r-0',
                  i >= 35 && 'border-b-0',
                )}
              >
                {/* Affordance: nada indicaba que el día es clickeable */}
                {day >= today && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                )}
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                    isSameDay(day, today)
                      ? 'bg-primary text-primary-fg'
                      : inMonth
                        ? 'text-fg'
                        : 'text-fg-subtle',
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="mt-0.5 space-y-1">
                  {dayPosts.slice(0, 3).map((post) => {
                    const at = postDate(post);
                    const hora = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
                    return (
                      <Tooltip
                        key={post.id}
                        side="top"
                        delayMs={200}
                        label={
                          <span>
                            <span className="font-semibold">
                              {postStatus(post).label} · {hora}
                            </span>
                            <br />
                            {(post.content || '(solo imagen)').slice(0, 160)}
                          </span>
                        }
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPostClick(post);
                          }}
                          className={cn(
                            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors',
                            POST_STATUS[post.status]?.chip ?? 'bg-bg-muted/60',
                          )}
                        >
                          <span className="shrink-0 text-[0.65rem] font-semibold tabular-nums text-fg-muted">
                            {hora}
                          </span>
                          <span className="flex shrink-0 -space-x-1">
                            {[...new Set(post.targets.map((t) => t.provider))].slice(0, 3).map((p) => (
                              <ProviderIcon key={p ?? '-'} provider={p} size="sm" />
                            ))}
                          </span>
                          <span className="truncate text-xs text-fg">{post.content || '📷'}</span>
                        </button>
                      </Tooltip>
                    );
                  })}
                  {dayPosts.length > 3 && (
                    <p className="px-1.5 text-xs text-fg-subtle">+{dayPosts.length - 3} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-fg-subtle">
        {Object.entries(POST_STATUS).map(([status, s]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
