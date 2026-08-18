import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, cn } from '@tiendafy/ui';
import { postDate, postStatus, ProviderIcon, type SocialPostDto } from './redes-shared';

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

const STATUS_DOT: Record<string, string> = {
  Draft: 'bg-fg-subtle',
  Scheduled: 'bg-info',
  Published: 'bg-success',
  Failed: 'bg-danger',
};

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
  posts: SocialPostDto[];
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
    for (const post of posts) {
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
                  'min-h-24 cursor-pointer border-b border-r border-border p-1.5 transition-colors hover:bg-bg-muted/40',
                  !inMonth && 'bg-bg-muted/20 text-fg-subtle',
                  (i + 1) % 7 === 0 && 'border-r-0',
                  i >= 35 && 'border-b-0',
                )}
              >
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
                  {dayPosts.slice(0, 3).map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostClick(post);
                      }}
                      title={`${postStatus(post).label}: ${post.content || '(solo imagen)'}`}
                      className="flex w-full items-center gap-1 rounded bg-bg-muted/60 px-1.5 py-1 text-left hover:bg-bg-muted"
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[post.status])} />
                      <span className="flex shrink-0 -space-x-1">
                        {[...new Set(post.targets.map((t) => t.provider))].slice(0, 3).map((p) => (
                          <ProviderIcon key={p ?? '-'} provider={p} size="sm" />
                        ))}
                      </span>
                      <span className="truncate text-xs text-fg-muted">{post.content || '📷'}</span>
                    </button>
                  ))}
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
        {Object.entries(STATUS_DOT).map(([status, dot]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
            {status === 'Draft'
              ? 'Borrador'
              : status === 'Scheduled'
                ? 'Programado'
                : status === 'Published'
                  ? 'Publicado'
                  : 'Con errores'}
          </span>
        ))}
      </div>
    </div>
  );
}
