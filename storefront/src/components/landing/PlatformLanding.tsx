import { Reveal } from './Reveal';
import { LandingThemeToggle } from './LandingThemeToggle';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="15" fill="var(--ld-verm)" />
      <text
        x="32"
        y="45"
        textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"
        fontWeight="700"
        fontSize="38"
        fill="#fff"
      >
        t
      </text>
    </svg>
  );
}

const tickerItems = [
  'Zapatillas urbanas $89.900',
  'Mate imperial $46.500',
  'Campera de jean $112.000',
  'Cerámica artesanal $28.900',
  'Vinilos importados $54.300',
  'Specialty coffee $19.800',
  'Plantas de interior $15.500',
  'Anteojos de sol $73.200',
];

const steps = [
  {
    title: 'Creá tu tienda',
    body: 'Elegí un nombre, un subdominio y listo: tu tienda existe. Sin tarjeta de crédito, sin llamadas comerciales, sin vueltas.',
  },
  {
    title: 'Cargá tus productos',
    body: 'Fotos, precios, variantes de talle y color, stock. El catálogo se arma solo y queda lindo en cualquier teléfono.',
  },
  {
    title: 'Empezá a cobrar',
    body: 'Conectás tu cuenta de Mercado Pago y la plata de cada venta va directo a vos. Nosotros nunca tocamos tu dinero.',
  },
];

const features = [
  {
    title: 'Checkout que convierte',
    body: 'Una sola página, idempotente, pensada para el doble click ansioso. Cada punto de conversión es plata tuya.',
  },
  {
    title: 'Mercado Pago integrado',
    body: 'Cobrás con tu propia cuenta. Tarjetas, cuotas y dinero en cuenta, con conciliación automática.',
  },
  {
    title: 'Tu dominio, tu marca',
    body: 'Arrancás en tutienda.tiendafy.com y cuando quieras conectás tu dominio propio con SSL automático.',
  },
  {
    title: 'Stock sin sustos',
    body: 'Reservas con vencimiento y control atómico: nunca vendés dos veces el último que te quedaba.',
  },
  {
    title: 'Números claros',
    body: 'Ventas, visitas y conversión en un panel que se entiende. Sin necesitar un analista de datos.',
  },
  {
    title: 'Soporte de humanos',
    body: 'Personas reales que venden online hace años. Respondemos en horas, no en semanas.',
  },
];

/* Tiendas ficticias del collage: cada una con identidad visual propia
   (gradientes CSS como arte de producto — sin stock photos). */
const showcaseStores = [
  {
    name: 'MUTE Studio',
    cat: 'Indumentaria',
    height: '11rem',
    bg: 'linear-gradient(160deg, #23201d 0%, #3d3631 55%, #16130f 100%)',
    label: 'Colección invierno —',
  },
  {
    name: 'Vivero Brote',
    cat: 'Plantas',
    height: '8rem',
    bg: 'linear-gradient(150deg, #5f7355 0%, #8a9b7d 60%, #44543c 100%)',
    label: 'Verde para adentro',
  },
  {
    name: 'Faro Café',
    cat: 'Specialty coffee',
    height: '9.5rem',
    bg: 'linear-gradient(140deg, #6f4a2f 0%, #a3744a 55%, #4a2f1c 100%)',
    label: 'Tostado de origen',
  },
  {
    name: 'Cerámica Luna',
    cat: 'Deco artesanal',
    height: '9rem',
    bg: 'linear-gradient(135deg, #c96f4a 0%, #a34d2d 60%, #7d3a20 100%)',
    label: 'Hecho a mano',
  },
  {
    name: 'Vinilos del Sur',
    cat: 'Música',
    height: '11.5rem',
    bg: 'linear-gradient(155deg, #56637a 0%, #7d8ba1 55%, #3a4456 100%)',
    label: 'Ediciones limitadas',
  },
  {
    name: 'Ánima Joyas',
    cat: 'Accesorios',
    height: '8.5rem',
    bg: 'linear-gradient(145deg, #d9c3a3 0%, #bba075 55%, #94794d 100%)',
    label: 'Plata 925',
  },
];

const testimonials = [
  {
    quote:
      'Pasé de vender por WhatsApp a tener mi tienda con checkout en una tarde. El primer fin de semana facturé más que todo el mes anterior.',
    name: 'Lucía Fernández',
    store: 'Cerámica Luna · San Telmo',
  },
  {
    quote:
      'Lo que más me gustó: la plata entra directo a mi Mercado Pago. No tengo que pedirle permiso a nadie para retirar lo que es mío.',
    name: 'Marcos Gutiérrez',
    store: 'Vinilos del Sur · Córdoba',
  },
  {
    quote:
      'Probé tres plataformas antes. Esta es la única donde el stock no se me desincronizó nunca, ni en el Hot Sale.',
    name: 'Carla Méndez',
    store: 'Vivero Brote · Mendoza',
  },
];

const plans = [
  {
    name: 'Semilla',
    price: 'Gratis',
    period: 'para siempre',
    items: ['Hasta 25 productos', 'Subdominio .tiendafy.com', 'Checkout con Mercado Pago', 'Soporte por email'],
    cta: 'Empezar gratis',
    featured: false,
  },
  {
    name: 'Emprendedor',
    price: '$19.999',
    period: 'por mes',
    items: [
      'Productos ilimitados',
      'Tu dominio propio + SSL',
      'Cupones y descuentos',
      'Estadísticas completas',
      'Soporte prioritario',
    ],
    cta: 'Probar 14 días gratis',
    featured: true,
  },
  {
    name: 'Pro',
    price: '$49.999',
    period: 'por mes',
    items: [
      'Todo lo de Emprendedor',
      '0% comisión por venta',
      'API y webhooks',
      'Múltiples usuarios con roles',
      'Soporte por WhatsApp',
    ],
    cta: 'Hablar con ventas',
    featured: false,
  },
];

const faqs = [
  {
    q: '¿Necesito saber programar?',
    a: 'No. Creás la tienda, cargás productos y elegís cómo se ve desde un panel visual. Si sabés usar Instagram, sabés usar Tiendafy.',
  },
  {
    q: '¿Cómo cobro mis ventas?',
    a: 'Conectás tu propia cuenta de Mercado Pago. El comprador te paga a vos directo: nosotros nunca custodiamos tu plata ni demoramos retiros.',
  },
  {
    q: '¿Puedo usar mi propio dominio?',
    a: 'Sí. Arrancás con tutienda.tiendafy.com gratis, y en los planes pagos conectás tu dominio propio con certificado SSL automático.',
  },
  {
    q: '¿Qué pasa si me quiero ir?',
    a: 'Exportás tus productos, clientes y pedidos cuando quieras. Tus datos son tuyos. Sin contratos de permanencia ni letra chica.',
  },
];

function AdminMock() {
  const bars = [35, 55, 42, 70, 58, 85, 64, 95];
  return (
    <div className="ld-admin-mock">
      <div className="ld-admin-bar">
        <span className="ld-admin-dot" />
        <span className="ld-admin-dot" />
        <span className="ld-admin-dot" />
        <span className="ml-2 text-[0.62rem] font-semibold" style={{ color: 'var(--ld-cream-muted)' }}>
          admin.tiendafy.com — Cerámica Luna
        </span>
      </div>
      <div className="ld-admin-body">
        <aside className="ld-admin-side">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <LogoMark className="h-3.5 w-3.5" />
            <span className="font-bold" style={{ color: 'var(--ld-paper)' }}>tiendafy</span>
          </div>
          <div className="ld-admin-nav-item active">Inicio</div>
          <div className="ld-admin-nav-item">Productos</div>
          <div className="ld-admin-nav-item">Pedidos</div>
          <div className="ld-admin-nav-item">Clientes</div>
          <div className="ld-admin-nav-item">Tema</div>
        </aside>
        <div className="space-y-2.5 p-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="ld-stat-card">
              <div style={{ color: 'var(--ld-cream-muted)' }}>Ventas hoy</div>
              <div className="value">$184.300</div>
              <div className="delta">▲ 12%</div>
            </div>
            <div className="ld-stat-card">
              <div style={{ color: 'var(--ld-cream-muted)' }}>Pedidos</div>
              <div className="value">23</div>
              <div className="delta">▲ 4</div>
            </div>
            <div className="ld-stat-card">
              <div style={{ color: 'var(--ld-cream-muted)' }}>Conversión</div>
              <div className="value">3,8%</div>
              <div className="delta">▲ 0,4</div>
            </div>
          </div>
          <div className="ld-stat-card">
            <div className="mb-1.5" style={{ color: 'var(--ld-cream-muted)' }}>Últimos 8 días</div>
            <div className="ld-bars">
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h}%`, animationDelay: `${0.6 + i * 0.07}s` }} />
              ))}
            </div>
          </div>
          <div>
            <div className="ld-admin-row">
              <span>#1042 — Sofía M.</span>
              <span className="ld-pill ld-pill--ok">PAGADO</span>
            </div>
            <div className="ld-admin-row">
              <span>#1041 — Bruno T.</span>
              <span className="ld-pill ld-pill--ok">PAGADO</span>
            </div>
            <div className="ld-admin-row" style={{ borderBottom: 'none' }}>
              <span>#1040 — Camila R.</span>
              <span className="ld-pill ld-pill--warn">ENVIADO</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlatformLanding() {
  return (
    <div className="ld-root">
      {/* ---------- Header ---------- */}
      <header className="ld-header">
        <div className="ld-container flex h-16 items-center justify-between">
          <a href="/" className="ld-logo">
            <LogoMark className="ld-logo-mark" />
            tienda<em>fy</em>
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#tiendas" className="ld-nav-link">Tiendas</a>
            <a href="#funciones" className="ld-nav-link">Funciones</a>
            <a href="#precios" className="ld-nav-link">Precios</a>
            <a href="#preguntas" className="ld-nav-link">Preguntas</a>
          </nav>
          <div className="flex items-center gap-3">
            <LandingThemeToggle />
            <a href={ADMIN_URL} className="ld-btn" style={{ padding: '0.55rem 1.2rem', fontSize: '0.9rem' }}>
              Crear mi tienda
            </a>
          </div>
        </div>
      </header>

      {/* ---------- Hero oscuro: el producto adelante ---------- */}
      <section className="ld-hero ld-dark-zone">
        <div className="ld-container grid items-center gap-14 py-16 lg:grid-cols-[1fr_1.05fr] lg:py-24">
          <div>
            <span className="ld-hero-kicker" data-stagger="1">
              Hecho en América Latina
            </span>
            <h1 className="ld-display ld-hero-title mt-6" data-stagger="2">
              Abrí tu tienda online sin pedirle <em>permiso</em> a nadie.
            </h1>
            <p className="mt-6 max-w-md text-lg" style={{ color: 'var(--ld-cream-muted)' }} data-stagger="3">
              Catálogo, checkout y cobros con tu propia cuenta de Mercado Pago.
              Panel que se entiende, tienda que no parece plantilla.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4" data-stagger="4">
              <a href={ADMIN_URL} className="ld-btn ld-btn--big">
                Crear mi tienda gratis
              </a>
              <a href="#tiendas" className="ld-btn ld-btn--ghost">
                Ver tiendas reales
              </a>
            </div>
            <p className="mt-5 text-sm" style={{ color: 'var(--ld-cream-muted)' }} data-stagger="5">
              Gratis hasta 25 productos · Sin tarjeta de crédito · Tus datos son tuyos
            </p>
          </div>

          <div className="ld-stage hidden sm:block" data-stagger="3">
            <AdminMock />

            <div
              className="ld-store-card"
              style={{ top: '-2rem', right: '-0.5rem', ['--tilt' as string]: '2.5deg', animationDelay: '0.4s' }}
            >
              <div className="ld-store-img" style={{ background: 'linear-gradient(150deg,#5f7355,#8a9b7d)' }} />
              <div className="ld-store-meta">
                <div className="name">Vivero Brote</div>
                <div className="cat">Plantas</div>
              </div>
            </div>

            <div
              className="ld-store-card"
              style={{ bottom: '-2.5rem', left: '-1.5rem', ['--tilt' as string]: '-3deg', animationDelay: '2.2s' }}
            >
              <div className="ld-store-img" style={{ background: 'linear-gradient(140deg,#c96f4a,#a34d2d)' }} />
              <div className="ld-store-meta">
                <div className="name">Cerámica Luna</div>
                <div className="cat">Deco</div>
              </div>
            </div>

            <div className="ld-sale-toast" style={{ top: '38%', right: '-1.5rem', animationDelay: '1.5s' }}>
              <span>Nueva venta</span>
              <span className="amount">+$28.900</span>
            </div>
            <div className="ld-sale-toast" style={{ top: '58%', right: '0.5rem', animationDelay: '8s' }}>
              <span>Nueva venta</span>
              <span className="amount">+$54.900</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Ticker ---------- */}
      <div className="ld-ticker" aria-hidden="true">
        <div className="ld-ticker-track">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="ld-ticker-item">
              <span>✶</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Cómo funciona ---------- */}
      <section id="como-funciona" className="py-28">
        <div className="ld-container">
          <Reveal>
            <span className="ld-eyebrow">Cómo funciona</span>
            <h2 className="ld-display ld-section-title mt-3 max-w-xl">
              De cero a vender en tres pasos.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 120}>
                <div className="ld-step-card">
                  <div className="ld-step-number">{i + 1}</div>
                  <h3 className="ld-display mt-5 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2" style={{ color: 'var(--ld-ink-soft)' }}>{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Collage de tiendas ---------- */}
      <section id="tiendas" className="pb-28">
        <div className="ld-container">
          <Reveal>
            <span className="ld-eyebrow">Tiendas con identidad</span>
            <h2 className="ld-display ld-section-title mt-3 max-w-2xl">
              Cada tienda con su propia cara. Ninguna parece <em style={{ color: 'var(--ld-verm)' }}>plantilla</em>.
            </h2>
            <p className="mt-4 max-w-xl" style={{ color: 'var(--ld-ink-soft)' }}>
              Temas componibles por secciones, tipografía y color tuyos. La marca
              es del merchant — nosotros solo ponemos la imprenta.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="ld-collage mt-12">
              {showcaseStores.map((store) => (
                <div key={store.name} className="ld-collage-card">
                  <div className="ld-collage-img" style={{ background: store.bg }}>
                    <span className="text-lg italic">{store.label}</span>
                  </div>
                  <div className="ld-collage-meta">
                    <span className="name">{store.name}</span>
                    <span className="cat">{store.cat}</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="funciones" className="pb-28">
        <div className="ld-container">
          <Reveal>
            <span className="ld-eyebrow">Funciones</span>
            <h2 className="ld-display ld-section-title mt-3 max-w-2xl">
              Todo lo que necesita una tienda que <em style={{ color: 'var(--ld-verm)' }}>factura</em>.
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <div className="ld-paper-grid mt-12 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="ld-paper-cell">
                  <h3 className="ld-feature-title">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ld-ink-soft)' }}>
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Oscuro: tu plata ---------- */}
      <section className="ld-dark-zone py-24">
        <div className="ld-container">
          <Reveal>
            <span className="ld-eyebrow">Tu plata es tuya</span>
            <h2 className="ld-display ld-section-title mt-3 max-w-2xl">
              Cada venta va directo a tu cuenta. Sin intermediarios, sin esperas.
            </h2>
            <p className="mt-4 max-w-xl" style={{ color: 'var(--ld-cream-muted)' }}>
              Conectás tu propia cuenta de Mercado Pago. Nosotros nunca custodiamos
              fondos: el dinero viaja del comprador hacia vos, como tiene que ser.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            {[
              { stat: '0', suffix: 'pesos', label: 'retenidos por nosotros. La plata no pasa por acá.' },
              { stat: '24', suffix: 'horas', label: 'de cero a tienda publicada, con catálogo y cobros.' },
              { stat: '100', suffix: '%', label: 'tuya: tu marca, tu dominio, tus clientes, tus datos.' },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 120}>
                <div className="ld-stat">
                  {s.stat}
                  <em> {s.suffix}</em>
                </div>
                <p className="mt-3 text-sm" style={{ color: 'var(--ld-cream-muted)' }}>{s.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Testimonios ---------- */}
      <section className="py-28" style={{ background: 'var(--ld-tan)' }}>
        <div className="ld-container">
          <Reveal>
            <span className="ld-eyebrow">Historias reales</span>
            <h2 className="ld-display ld-section-title mt-3">Los que ya venden, cuentan.</h2>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <div className="ld-quote-mark">“</div>
                <blockquote className="ld-quote mt-2">{t.quote}</blockquote>
                <div className="mt-5 text-sm font-bold">{t.name}</div>
                <div className="text-sm" style={{ color: 'var(--ld-ink-soft)' }}>{t.store}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="precios" className="py-28">
        <div className="ld-container">
          <Reveal>
            <span className="ld-eyebrow">Precios</span>
            <h2 className="ld-display ld-section-title mt-3 max-w-xl">
              Planes simples, en pesos, sin sorpresas.
            </h2>
          </Reveal>
          <div className="mt-14 grid items-stretch gap-8 lg:grid-cols-3">
            {plans.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 120} className="h-full">
                <div className={`ld-plan h-full ${plan.featured ? 'ld-plan--featured' : ''}`}>
                  {plan.featured && <span className="ld-plan-sticker">El más elegido</span>}
                  <div className="ld-eyebrow">{plan.name}</div>
                  <div className="ld-plan-price mt-4">{plan.price}</div>
                  <div className="text-sm" style={{ color: 'var(--ld-ink-soft)' }}>{plan.period}</div>
                  <ul className="mt-6 flex-1">
                    {plan.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <a
                    href={ADMIN_URL}
                    className={`ld-btn mt-8 justify-center ${plan.featured ? '' : 'ld-btn--ghost'}`}
                  >
                    {plan.cta}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="preguntas" className="pb-28">
        <div className="ld-container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <span className="ld-eyebrow">Preguntas frecuentes</span>
            <h2 className="ld-display ld-section-title mt-3">Lo que todos preguntan antes de empezar.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="border-b" style={{ borderColor: 'var(--ld-ink)' }}>
              {faqs.map((faq) => (
                <details key={faq.q} className="ld-faq">
                  <summary>{faq.q}</summary>
                  <p className="pb-5 pr-8 text-sm leading-relaxed" style={{ color: 'var(--ld-ink-soft)' }}>
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- CTA final oscuro (bookend con el hero) ---------- */}
      <section className="ld-dark-zone py-28 text-center">
        <div className="ld-container">
          <Reveal>
            <h2 className="ld-display" style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', lineHeight: 0.98 }}>
              Empezá hoy.
              <br />
              <em style={{ color: 'var(--ld-verm)', fontStyle: 'italic' }}>Gratis.</em>
            </h2>
            <p className="mx-auto mt-6 max-w-md text-lg" style={{ color: 'var(--ld-cream-muted)' }}>
              Tu tienda puede estar vendiendo esta misma semana. La única pregunta
              es si va a ser la tuya o la de tu competencia.
            </p>
            <a href={ADMIN_URL} className="ld-btn ld-btn--big mt-10">
              Crear mi tienda gratis
            </a>
          </Reveal>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="ld-dark-zone" style={{ borderTop: '1px solid var(--ld-obsidian-line)' }}>
        <div className="ld-container grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="ld-logo">
              <LogoMark className="ld-logo-mark" />
              tienda<em>fy</em>
            </span>
            <p className="mt-3 max-w-xs text-sm" style={{ color: 'var(--ld-cream-muted)' }}>
              La plataforma de e-commerce hecha en América Latina, para los que
              venden en serio.
            </p>
          </div>
          {[
            { title: 'Producto', links: ['Funciones', 'Precios', 'Novedades'] },
            { title: 'Recursos', links: ['Centro de ayuda', 'Guías para vender', 'API para developers'] },
            { title: 'Compañía', links: ['Quiénes somos', 'Términos y privacidad', 'Contacto'] },
          ].map((col) => (
            <div key={col.title}>
              <div className="ld-eyebrow">{col.title}</div>
              <ul className="mt-4 space-y-2.5 text-sm" style={{ color: 'var(--ld-cream-muted)' }}>
                {col.links.map((link) => (
                  <li key={link}>
                    <span className="cursor-pointer transition-colors hover:text-[#faf5ed]">{link}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className="border-t py-6 text-center text-xs"
          style={{ borderColor: 'var(--ld-obsidian-line)', color: '#8d8170' }}
        >
          © 2026 Tiendafy · Hecho con ☀ en América Latina
        </div>
      </footer>
    </div>
  );
}
