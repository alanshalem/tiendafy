import { safeHref } from '@tiendafy/types';
import { primaryInk, type ThemeConfig } from '@/lib/theme';
import { NewsletterForm } from './NewsletterForm';

/** "2026-11-15" → "15 de noviembre". Sin año: una apertura nunca es a un año vista. */
function apertura(iso: string): string | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${d} de ${meses[m - 1]}`;
}

/** Link de WhatsApp a partir de un número suelto, tolerando espacios y guiones. */
function waLink(numero: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}`;
}

/**
 * Página pública mientras la tienda no abre (toggle del editor).
 *
 * Es la única cara de la marca durante semanas, así que no puede ser la misma
 * para todas: la etiqueta, la imagen, la fecha y por dónde seguir el hilo
 * (redes, WhatsApp, email) los pone cada comercio. Lo que no se configura —el
 * redondeo, los colores, las tipografías— sale del tema, como el resto de la
 * tienda: una marca de bloques rectos no puede tener acá una píldora redonda.
 */
export function ComingSoon({
  theme,
  tenantName,
  tenantId,
}: {
  theme: ThemeConfig;
  tenantName: string;
  tenantId: string;
}) {
  const { title, message, collectEmails, eyebrow, image, layout, showSocial, whatsapp, launchDate } =
    theme.comingSoon;
  const primary = `rgb(${theme.colors.primary})`;
  // Como texto, el mismo tono lo bastante profundo para leerse (WCAG AA).
  const ink = `rgb(${primaryInk(theme)})`;
  const fecha = launchDate ? apertura(launchDate) : null;
  const dividido = layout === 'split' && !!image;

  // El redondeo es del tema: `rounded-full` fijo le rompía la identidad a las
  // marcas de esquinas rectas justo en su página más vista.
  const pill = theme.borderRadius === 'sharp' ? '' : 'rounded-full';

  const telefono = whatsapp || theme.footer.whatsapps[0] || theme.contact.whatsapp;
  // safeHref, como en el pie: "instagram.com/x" sin https:// quedaba como un
  // link relativo a la propia tienda (que lleva a "no encontrada").
  const redes = [
    { href: safeHref(theme.footer.instagram), label: 'Instagram' },
    { href: safeHref(theme.footer.facebook), label: 'Facebook' },
    { href: safeHref(theme.footer.tiktok), label: 'TikTok' },
    { href: safeHref(theme.footer.youtube), label: 'YouTube' },
    { href: safeHref(theme.footer.x), label: 'X' },
  ].filter((r): r is { href: string; label: string } => !!r.href);

  const contenido = (
    <div className="relative z-10 max-w-lg">
      {theme.logo ? (
        <img src={theme.logo} alt={tenantName} className="mx-auto mb-8 max-h-16 w-auto object-contain" />
      ) : (
        <div className="mb-8 text-2xl font-bold tracking-tight">{tenantName}</div>
      )}

      {eyebrow && (
        <div
          className={`mx-auto mb-6 inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${pill}`}
          style={{ background: `rgb(${theme.colors.primary} / 0.12)`, color: ink }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: primary }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: primary }} />
          </span>
          {eyebrow}
        </div>
      )}

      <h1 className="text-3xl font-bold sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h1>
      {message && <p className="mt-4 text-base opacity-70">{message}</p>}

      {fecha && (
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide" style={{ color: ink }}>
          Abrimos el {fecha}
        </p>
      )}

      {/* La espera es la única oportunidad de captar a quien llegó antes de abrir. */}
      {collectEmails && (
        <div className="mt-7">
          <p className="mb-2 text-sm font-medium">Dejanos tu email y te avisamos cuando abramos.</p>
          <NewsletterForm source="coming-soon" tenantId={tenantId} />
        </div>
      )}

      {telefono && (
        <a
          href={waLink(telefono)}
          target="_blank"
          rel="noreferrer"
          className={`mt-7 inline-block px-5 py-2.5 text-sm font-semibold ${pill}`}
          style={{ background: primary, color: `rgb(var(--color-primary-fg))` }}
        >
          Consultanos por WhatsApp
        </a>
      )}

      {showSocial && redes.length > 0 && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4 text-sm">
          {redes.map((r) => (
            <a key={r.label} href={r.href} target="_blank" rel="noreferrer" className="underline opacity-70">
              {r.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );

  if (dividido) {
    return (
      <main
        className="grid min-h-screen grid-cols-1 md:grid-cols-2"
        style={{
          background: `rgb(${theme.colors.bg})`,
          color: `rgb(${theme.colors.text})`,
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* La imagen primero en el DOM pero debajo en el celular: quien entra
            desde el teléfono tiene que leer el mensaje sin scrollear. */}
        <div
          className="order-last min-h-[40vh] bg-cover bg-center md:order-first md:min-h-screen"
          style={{ backgroundImage: `url(${image})` }}
          role="presentation"
        />
        <div className="flex items-center justify-center px-6 py-16 text-center">{contenido}</div>
      </main>
    );
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
      style={{
        background: `rgb(${theme.colors.bg})`,
        color: `rgb(${theme.colors.text})`,
        fontFamily: 'var(--font-body)',
      }}
    >
      {image ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
          />
          {/* Velo del color de fondo: sin esto el texto compite con la foto. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `rgb(${theme.colors.bg} / 0.82)` }}
          />
        </>
      ) : (
        /* Halo de color de marca */
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: primary }}
        />
      )}

      {contenido}
    </main>
  );
}
