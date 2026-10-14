/* ============================================================
   Hora de Argentina y cuenta regresiva de "Ofertas con cronómetro".

   El fin de la oferta se guarda en UTC (campo `datetime`); el comercio
   lo elige y lo lee en hora de Argentina. Argentina no tiene horario de
   verano desde 2009: es siempre UTC-3, así que alcanza con un corrimiento
   fijo y no depende de la zona horaria de la máquina (ni del servidor que
   arma la página ni del celular de quien la ve). Todo acá es puro y da lo
   mismo en el servidor que en el navegador: no hay saltos al hidratar.
   ============================================================ */

/** UTC-3, siempre. */
export const ARGENTINA_OFFSET_MS = -3 * 3600_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO en UTC → "AAAA-MM-DDTHH:mm" en hora de Argentina (el valor de un <input type="datetime-local">). */
export function isoToArgentinaLocal(iso: string): string {
  const t = Date.parse(iso);
  if (!iso || !Number.isFinite(t)) return '';
  const d = new Date(t + ARGENTINA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "AAAA-MM-DDTHH:mm" en hora de Argentina → ISO en UTC. Vacío si no es una fecha. */
export function argentinaLocalToIso(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return '';
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const t = Date.UTC(y, mo - 1, d, h, mi) - ARGENTINA_OFFSET_MS;
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "jueves 20/11 a las 23:59" (hora de Argentina). Vacío si no hay fecha. */
export function formatArgentinaEnd(iso: string): string {
  const t = Date.parse(iso);
  if (!iso || !Number.isFinite(t)) return '';
  const d = new Date(t + ARGENTINA_OFFSET_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} a las ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Lo que falta (en milisegundos, negativo = ya pasó) en días, horas, minutos y segundos. */
export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Lo que falta dicho en palabras, al minuto ("Termina en 2 días, 3 horas y
 * 15 minutos"): lo que lee un lector de pantalla. Sin segundos a propósito:
 * cambia como mucho una vez por minuto, así no interrumpe a cada rato.
 */
export function countdownSpeech(ms: number): string {
  if (ms <= 0) return 'La oferta terminó.';
  const { days, hours, minutes } = countdownParts(ms);
  const parts = [
    days > 0 && plural(days, 'día', 'días'),
    hours > 0 && plural(hours, 'hora', 'horas'),
    (minutes > 0 || (days === 0 && hours === 0)) && plural(minutes, 'minuto', 'minutos'),
  ].filter((p): p is string => !!p);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
  return `Termina en ${text}.`;
}
