import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_MSG } from '@tiendafy/types';
import { useNavigate } from 'react-router-dom';
import {
  Check as CheckIcon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code,
  Construction,
  ExternalLink,
  AlertTriangle,
  Home,
  Image,
  List,
  MessageCircle,
  Monitor,
  Package,
  Palette,
  Phone,
  Plus,
  Sparkles,
  ShoppingCart,
  Smartphone,
  Square,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button, Dropdown, cn, useToast, useConfirm } from '@tiendafy/ui';
import { type ThemeConfig, type ThemeSection, type SectionType, normalizeTheme, baseTheme, PAYMENT_LOGOS, FONT_OPTIONS } from '@tiendafy/types';
import { useStore } from '../context/StoreContext';
import { api, ApiRequestError, setActiveTenant } from '../lib/api';
import { ThemeModeToggle } from '../components/ThemeModeToggle';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { ImageUploader } from './theme-editor-uploaders';
import { BackHeader, Field, Check, Select, TextInput, TextArea, StringList, ColorRow, INPUT_BASE, contrastText, sectionSetter } from './theme-editor-inputs';
import { HomePanel, SectionPanel } from './theme-editor-sections';

/* ============================================================
   Editor de diseño con preview en vivo (postMessage al storefront).
   El draft vive en estado; cada cambio se streamea al iframe y se
   autosalva. "Publicar" copia draft → published.
   ============================================================ */

/* ThemeConfig / ThemeSection viven en @tiendafy/types (compartidos con el storefront). */

/**
 * Mergea el draft cargado sobre los defaults para que nunca falten campos.
 * El editor arranca SIN secciones por defecto (fallback []), a diferencia del
 * storefront que siembra las iniciales.
 */
const withDefaults = (raw: Partial<ThemeConfig>): ThemeConfig => normalizeTheme(raw, []);

// Catálogo compartido (@tiendafy/types). Copia mutable para el <Select> (options no-readonly).
const fontOptions: { value: string; label: string }[] = [...FONT_OPTIONS];

// Familias CSS para previsualizar en el panel (mismas que el storefront).
const FONT_CSS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'Georgia, serif',
  mono: 'ui-monospace, monospace',
  poppins: "'Poppins', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  dmsans: "'DM Sans', sans-serif",
  manrope: "'Manrope', sans-serif",
  worksans: "'Work Sans', sans-serif",
  spacegrotesk: "'Space Grotesk', sans-serif",
  playfair: "'Playfair Display', serif",
  lora: "'Lora', serif",
  cormorant: "'Cormorant Garamond', serif",
  dmserif: "'DM Serif Display', serif",
  bebas: "'Bebas Neue', sans-serif",
  archivoblack: "'Archivo Black', sans-serif",
};

// Combinaciones de tipografías que funcionan bien juntas (título + cuerpo).
// Curadas según pares clásicos de diseño, usando sólo fuentes ya cargadas.
const FONT_PAIRINGS: { name: string; heading: string; body: string }[] = [
  { name: 'Editorial', heading: 'playfair', body: 'dmsans' },
  { name: 'Moderno', heading: 'spacegrotesk', body: 'worksans' },
  { name: 'Elegante', heading: 'cormorant', body: 'montserrat' },
  { name: 'Impacto', heading: 'bebas', body: 'montserrat' },
  { name: 'Minimalista', heading: 'manrope', body: 'manrope' },
  { name: 'Clásico', heading: 'dmserif', body: 'dmsans' },
  { name: 'Boutique', heading: 'playfair', body: 'montserrat' },
  { name: 'Tecnológico', heading: 'spacegrotesk', body: 'dmsans' },
  { name: 'Cálido', heading: 'lora', body: 'worksans' },
  { name: 'Amigable', heading: 'poppins', body: 'dmsans' },
  { name: 'Lujo', heading: 'cormorant', body: 'worksans' },
  { name: 'Deportivo', heading: 'archivoblack', body: 'worksans' },
  { name: 'Revista', heading: 'dmserif', body: 'montserrat' },
  { name: 'Sobrio', heading: 'montserrat', body: 'lora' },
  { name: 'Fashion', heading: 'bebas', body: 'worksans' },
];

// Paletas curadas. `group` separa claras de oscuras en el panel.
const presets = [
  // --- Claras ---
  { name: 'Bermellón', group: 'light', primary: '232 80 30', bg: '255 255 255', text: '17 24 39', header: '27 21 16' },
  { name: 'Mono', group: 'light', primary: '17 17 17', bg: '255 255 255', text: '17 17 17', header: '17 17 17' },
  { name: 'Arena', group: 'light', primary: '194 65 12', bg: '254 252 248', text: '41 37 36', header: '68 64 60' },
  { name: 'Cielo', group: 'light', primary: '12 74 110', bg: '248 251 253', text: '23 37 47', header: '12 74 110' },
  { name: 'Bosque', group: 'light', primary: '30 91 63', bg: '250 252 248', text: '26 36 30', header: '30 91 63' },
  { name: 'Menta', group: 'light', primary: '13 148 136', bg: '247 254 252', text: '19 78 74', header: '17 94 89' },
  { name: 'Esmeralda', group: 'light', primary: '5 150 105', bg: '247 254 250', text: '6 78 59', header: '6 78 59' },
  { name: 'Turquesa', group: 'light', primary: '8 145 178', bg: '247 254 255', text: '22 60 70', header: '14 116 144' },
  { name: 'Rosa', group: 'light', primary: '214 109 132', bg: '255 251 252', text: '52 36 41', header: '52 36 41' },
  { name: 'Coral', group: 'light', primary: '244 63 94', bg: '255 250 251', text: '76 5 25', header: '76 5 25' },
  { name: 'Vino', group: 'light', primary: '159 18 57', bg: '254 252 252', text: '50 12 24', header: '76 5 25' },
  { name: 'Lavanda', group: 'light', primary: '124 58 237', bg: '250 250 255', text: '30 27 75', header: '49 46 129' },
  { name: 'Índigo', group: 'light', primary: '67 56 202', bg: '249 250 255', text: '30 27 75', header: '49 46 129' },
  { name: 'Mostaza', group: 'light', primary: '202 138 4', bg: '254 252 245', text: '41 37 28', header: '66 50 12' },
  // --- Oscuras ---
  { name: 'Obsidiana', group: 'dark', primary: '232 80 30', bg: '10 10 10', text: '245 245 245', header: '0 0 0' },
  { name: 'Noche', group: 'dark', primary: '163 230 53', bg: '14 14 14', text: '245 245 245', header: '0 0 0' },
  { name: 'Carbón', group: 'dark', primary: '249 115 22', bg: '24 24 27', text: '244 244 245', header: '9 9 11' },
  { name: 'Marino', group: 'dark', primary: '56 189 248', bg: '15 23 42', text: '226 232 240', header: '2 6 23' },
  { name: 'Grafito', group: 'dark', primary: '129 140 248', bg: '17 17 19', text: '237 237 240', header: '9 9 11' },
  { name: 'Viña', group: 'dark', primary: '244 63 94', bg: '20 12 16', text: '245 240 242', header: '10 6 8' },
];

export function ThemeEditorPage() {
  const { store, stores, selectStore } = useStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [published, setPublished] = useState<ThemeConfig | null>(null); // baseline para "hay cambios sin publicar"
  const [firstSlug, setFirstSlug] = useState<string | null>(null); // un producto real para previsualizar el detalle
  const [device, setDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [view, setView] = useState<string>('root'); // 'root' | 'colors' | 'fonts' | 'header' | 'home' | 'home:<sectionId>' | ...
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadKey, setLoadKey] = useState(0); // bump = reintentar la carga
  // Autosave visible: el usuario tiene que saber si su borrador persistió.
  const [saveState, _setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveStateRef = useRef(saveState); // para beforeunload (no ve el state)
  const setSaveState = useCallback((s: 'saved' | 'saving' | 'error') => {
    saveStateRef.current = s;
    _setSaveState(s);
  }, []);
  // undefined = pidiéndolo (no montar el iframe todavía); null = falló (preview cae a publicado)
  const [previewToken, setPreviewToken] = useState<string | null | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<ThemeConfig | null>(null); // draft con guardado pendiente o fallido
  const postTimer = useRef<number | null>(null);
  const pendingPost = useRef<ThemeConfig | null>(null);

  const previewBase = store ? `http://${store.subdomain}.localhost:3000` : '';
  const previewOrigin = previewBase; // origin esperado del iframe (targetOrigin + validación de e.origin)
  // El preview sigue al panel abierto: cada sección se ve en su propia página.
  const previewPath = useMemo(() => {
    switch (view) {
      case 'products-list': return '/productos?preview=1';
      case 'product-detail': return firstSlug ? `/productos/${firstSlug}?preview=1` : '/preview';
      case 'contact': return '/contacto?preview=1';
      default: return '/preview'; // inicio (header, colores, fuentes, secciones, footer…) + carrito
    }
  }, [view, firstSlug]);
  // El token viaja en la URL (?pt=…): el SSR del storefront lo reenvía al backend
  // para poder leer el draft (que no es público).
  const previewUrl = useMemo(() => {
    if (!previewBase) return '';
    const sep = previewPath.includes('?') ? '&' : '?';
    return previewBase + previewPath + (previewToken ? `${sep}pt=${encodeURIComponent(previewToken)}` : '');
  }, [previewBase, previewPath, previewToken]);

  // ¿Hay cambios sin publicar? (draft ≠ publicado) → habilita "Publicar".
  // Memoizado: el doble stringify del theme completo no debe correr en cada render.
  const dirty = useMemo(
    () => !!theme && !!published && JSON.stringify(theme) !== JSON.stringify(published),
    [theme, published],
  );

  // El editor es overlay full-screen: bloquear el scroll del body de atrás
  // (si no, queda una barra vertical inútil a la derecha).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Cargar draft inicial. Seteamos el tenant explícitamente para evitar
  // la race con el efecto de StoreContext (efectos hijos corren primero).
  useEffect(() => {
    if (!store) return;
    setActiveTenant(store.id);
    setTheme(null);
    setPublished(null);
    setLoadError(false);
    setPreviewToken(undefined);
    Promise.all([
      api.get<Partial<ThemeConfig>>('/api/v1/theme/draft'),
      api.get<Partial<ThemeConfig>>('/api/v1/theme'),
    ])
      .then(([d, p]) => { setTheme(withDefaults(d)); setPublished(withDefaults(p)); })
      .catch(() => { setTheme(null); setLoadError(true); });
    // Token firmado para que el iframe de preview pueda leer el draft. Si falla,
    // el preview cae al tema publicado (el postMessage pinta el draft igual).
    api.post<{ token: string }>('/api/v1/theme/preview-token', {})
      .then((r) => setPreviewToken(r.token))
      .catch(() => setPreviewToken(null));
    // Un producto real para previsualizar el panel "Detalle de producto".
    api.get<{ items: { slug: string }[] }>('/api/v1/products?limit=1')
      .then((r) => setFirstSlug(r.items[0]?.slug ?? null))
      .catch(() => setFirstSlug(null));
  }, [store, loadKey]);

  // Postear tema al iframe (preview en vivo), con throttle (~80ms trailing):
  // tipear o arrastrar el selector de color emite decenas de cambios por segundo
  // y cada postMessage re-renderiza el storefront completo del iframe.
  const postToPreview = useCallback((t: ThemeConfig) => {
    pendingPost.current = t;
    if (postTimer.current != null) return;
    postTimer.current = window.setTimeout(() => {
      postTimer.current = null;
      const latest = pendingPost.current;
      if (latest) iframeRef.current?.contentWindow?.postMessage({ type: EDITOR_MSG.theme, theme: latest }, previewOrigin || '*');
    }, 80);
  }, [previewOrigin]);

  // Abrir/cerrar el carrito en el preview (no es una página: se controla por mensaje).
  const postCart = useCallback((open: boolean) => {
    iframeRef.current?.contentWindow?.postMessage({ type: EDITOR_MSG.previewCart, open }, previewOrigin || '*');
  }, [previewOrigin]);

  // El preview avisa cuando está listo → mandamos el tema actual (+ estado del carrito).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== previewOrigin) return; // solo mensajes del propio preview
      if (e.data?.type === EDITOR_MSG.previewReady && theme) {
        postToPreview(theme);
        postCart(view === 'cart');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [theme, postToPreview, postCart, view, previewOrigin]);

  // Al abrir el panel "Carrito", abrir el drawer en el preview (y cerrarlo al salir).
  useEffect(() => { postCart(view === 'cart'); }, [view, postCart]);

  // Al abrir un panel, resaltar su sección en el preview (scroll + flash). Solo aplica
  // a lo que se ve en el home: encabezado, pie y secciones del inicio.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    let msg: { type: string; target?: string; sectionId?: string } | null = null;
    if (view === 'header') msg = { type: EDITOR_MSG.focusSection, target: 'header' };
    else if (view === 'footer') msg = { type: EDITOR_MSG.focusSection, target: 'footer' };
    else if (view.startsWith('home:')) msg = { type: EDITOR_MSG.focusSection, target: 'section', sectionId: view.slice(5) };
    if (msg) win.postMessage(msg, previewOrigin || '*');
  }, [view, previewOrigin]);

  // Click en una región del preview (sección / encabezado / pie) → abre su panel.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== previewOrigin) return;
      if (e.data?.type !== EDITOR_MSG.editSection) return;
      const { target, sectionId } = e.data as { target: string; sectionId?: string };
      if (target === 'header' || target === 'announcement') setView('header');
      else if (target === 'footer') setView('footer');
      else if (target === 'section' && sectionId) setView(`home:${sectionId}`);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [previewOrigin]);

  // Persistir el draft. Guarda el resultado en saveState (nunca en silencio:
  // si falla, el usuario tiene que enterarse antes de cerrar y perder cambios).
  const saveDraft = useCallback((next: ThemeConfig, init?: RequestInit) => {
    pendingDraft.current = next;
    setSaveState('saving');
    api.put('/api/v1/theme/draft', next, init)
      .then(() => {
        // Solo si no hubo un cambio más nuevo mientras viajaba el PUT.
        if (pendingDraft.current === next) { pendingDraft.current = null; setSaveState('saved'); }
      })
      .catch(() => {
        if (pendingDraft.current === next) setSaveState('error');
      });
  }, [setSaveState]);

  // Guardado pendiente (o fallido) → mandarlo YA (cerrar editor, cambiar tienda, reintentar).
  const flushDraft = useCallback((init?: RequestInit) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (pendingDraft.current) saveDraft(pendingDraft.current, init);
  }, [saveDraft]);

  // Cambio de tema: live + autosave debounced.
  const updateTheme = useCallback(
    (updater: (t: ThemeConfig) => ThemeConfig) => {
      setTheme((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        postToPreview(next);
        pendingDraft.current = next;
        setSaveState('saving');
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveDraft(next), 600);
        return next;
      });
    },
    [postToPreview, saveDraft, setSaveState],
  );

  // Al cerrar la pestaña / desmontar: flushear el draft pendiente (keepalive
  // deja terminar el PUT aunque la página muera). Solo frenamos la navegación
  // con el diálogo nativo si el último guardado FALLÓ (riesgo real de pérdida).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pendingDraft.current) return;
      flushDraft({ keepalive: true });
      if (saveStateRef.current === 'error') e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushDraft({ keepalive: true }); // unmount (navegar dentro del admin)
    };
  }, [flushDraft]);

  // Eliminar sección desde el preview (botón de tacho en el hover).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== previewOrigin) return;
      if (e.data?.type !== EDITOR_MSG.deleteSection || !e.data.sectionId) return;
      const sectionId = e.data.sectionId as string;
      confirm({
        title: 'Eliminar sección',
        message: '¿Seguro que querés eliminar esta sección del inicio? Podés volver a agregarla cuando quieras.',
        confirmLabel: 'Eliminar',
        variant: 'danger',
      }).then((ok) => {
        if (!ok) return;
        updateTheme((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== sectionId) }));
        setView((v) => (v === `home:${sectionId}` ? 'home' : v));
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [confirm, updateTheme, previewOrigin]);

  const publish = async () => {
    if (!theme) return;
    setPublishing(true);
    try {
      await api.post('/api/v1/theme/publish', theme);
      setPublished(theme); // nuevo baseline → "Publicar" se desactiva hasta el próximo cambio
      // El publish persiste también el draft: no queda nada pendiente.
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingDraft.current = null;
      setSaveState('saved');
      toast('Diseño publicado en tu tienda', { variant: 'success' });
    } catch (err) {
      toast(err instanceof ApiRequestError ? err.message : 'Error al publicar', { variant: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (!(await confirm({ title: 'Descartar cambios', message: '¿Descartar los cambios sin publicar y volver al diseño publicado?', confirmLabel: 'Descartar', variant: 'danger' }))) return;
    try {
      const published = withDefaults(await api.get<Partial<ThemeConfig>>('/api/v1/theme'));
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      pendingDraft.current = null;
      setTheme(published);
      postToPreview(published);
      await api.put('/api/v1/theme/draft', published);
      setSaveState('saved');
      toast('Cambios descartados', { variant: 'success' });
    } catch {
      toast('No se pudo descartar', { variant: 'error' });
    }
  };

  const setColor = (key: keyof ThemeConfig['colors'], value: string) =>
    updateTheme((t) => ({ ...t, colors: { ...t.colors, [key]: value } }));

  if (!store) return <NoStoreSelected />;
  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-fg-muted">No se pudo cargar el editor. Revisá tu conexión.</p>
        <Button className="mt-4" onClick={() => setLoadKey((k) => k + 1)}>Reintentar</Button>
      </div>
    );
  }
  if (!theme) return <p className="py-16 text-center text-sm text-fg-muted">Cargando editor...</p>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-subtle">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/canales/tienda-online/disenios')} aria-label="Cerrar" className="text-fg-muted hover:text-fg">
            <X className="h-5 w-5" />
          </button>
          <span className="font-semibold text-fg">Editar diseño</span>
          <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">● Borrador</span>
          {/* Estado del autosave: sin esto, un guardado fallido era invisible y se perdía trabajo. */}
          {saveState === 'saving' && <span className="text-xs text-fg-subtle">Guardando…</span>}
          {saveState === 'saved' && <span className="text-xs text-fg-subtle">Guardado</span>}
          {saveState === 'error' && (
            <button onClick={() => flushDraft()} className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline">
              <AlertTriangle className="h-3.5 w-3.5" /> No se guardó — Reintentar
            </button>
          )}
          {stores.length > 1 && (
            <Dropdown>
              <Dropdown.Trigger>{store.name}</Dropdown.Trigger>
              <Dropdown.Menu align="start">
                {stores.map((s) => (
                  <Dropdown.Item
                    key={s.id}
                    onSelect={() => {
                      if (s.id === store.id) return;
                      flushDraft(); // no perder un guardado pendiente de ESTA tienda
                      setTheme(null); // muestra "Cargando…" mientras carga la otra tienda
                      selectStore(s);
                    }}
                  >
                    <span className={cn('block', s.id === store.id && 'font-semibold text-primary')}>{s.name}</span>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}
        </div>
        <div className="flex gap-1 rounded-full border border-border bg-bg-muted p-1">
          {(['mobile', 'desktop'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors', device === d ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:text-fg')}
            >
              {d === 'mobile' ? <><Smartphone className="h-4 w-4" /> Celulares</> : <><Monitor className="h-4 w-4" /> Computadoras</>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ThemeModeToggle />
          <a href={previewBase} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Ver tienda <ExternalLink className="h-4 w-4" />
          </a>
          <button onClick={discard} disabled={!dirty} className="text-sm font-medium text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40">Descartar</button>
          <Button loading={publishing} disabled={!dirty} onClick={publish}>
            {dirty ? 'Publicar cambios' : 'Sin cambios'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Panel izquierdo */}
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-border bg-surface">
          {view === 'root' && <RootNav onNavigate={setView} theme={theme} onOpenGallery={() => navigate('/canales/tienda-online/disenios')} />}
          {view === 'logo' && (
            <div>
              <BackHeader title="Identidad de tu tienda" onBack={() => setView('root')} />
              <div className="space-y-5 p-4">
                <Field label="Logo de la tienda" hint="Se muestra en el encabezado. JPG, PNG, WebP, AVIF o SVG · hasta 5MB. Tamaño recomendado: 575×230px (horizontal, fondo transparente). SVG ideal: se ve nítido en cualquier tamaño. Si no cargás logo, se muestra el nombre de la tienda.">
                  <ImageUploader value={theme.logo} onChange={(url) => updateTheme((t) => ({ ...t, logo: url }))} allowSvg />
                </Field>
                <Field label="Favicon" hint="El ícono chico de la pestaña del navegador. JPG, PNG, WebP, AVIF o SVG · hasta 5MB. Tamaño recomendado: 130×130px (cuadrado). SVG ideal por nitidez.">
                  <ImageUploader value={theme.favicon} onChange={(url) => updateTheme((t) => ({ ...t, favicon: url }))} allowSvg />
                </Field>
                <Field label="Imagen al compartir" hint="La que se ve al compartir el link en redes (WhatsApp, Instagram…). JPG, PNG, WebP o AVIF · hasta 5MB. Tamaño recomendado: 1200×630px (horizontal) o 600×600px (cuadrada).">
                  <ImageUploader value={theme.shareImage} onChange={(url) => updateTheme((t) => ({ ...t, shareImage: url }))} />
                </Field>
              </div>
            </div>
          )}
          {view === 'colors' && (
            <ColorsPanel
              theme={theme}
              onBack={() => setView('root')}
              onReset={async () => { if (await confirm({ title: 'Restablecer colores', message: '¿Volver los colores a los valores por defecto?', confirmLabel: 'Restablecer', variant: 'danger' })) updateTheme((t) => ({ ...t, colors: baseTheme.colors })); }}
              setColor={setColor}
              onToggleAccent={(on) => updateTheme((t) => ({ ...t, colors: { ...t.colors, useAccent: on } }))}
              applyPreset={(p) => updateTheme((t) => ({ ...t, colors: { ...t.colors, primary: p.primary, bg: p.bg, text: p.text }, header: { ...t.header, bg: p.header, textColor: contrastText(p.header) } }))} />
          )}
          {view === 'fonts' && <FontsPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'radius' && <BorderRadiusPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'header' && <HeaderPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'home' && <HomePanel theme={theme} onBack={() => setView('root')} onOpenSection={(id) => setView(`home:${id}`)} updateTheme={updateTheme} />}
          {view.startsWith('home:') && (
            <SectionPanel
              section={theme.sections.find((s) => s.id === view.slice(5))!}
              onBack={() => setView('home')}
              onChange={(data) =>
                updateTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === view.slice(5) ? { ...s, data } : s)) }))}
            />
          )}
          {view === 'products-list' && <ProductListPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'product-detail' && <ProductDetailPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'cart' && <CartPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'contact' && <ContactPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'whatsapp' && <WhatsAppPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'footer' && <FooterPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'css' && <CssPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
          {view === 'coming-soon' && <ComingSoonPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />}
        </aside>

        {/* Preview — UN solo iframe persistente; cambiar de device solo reestiliza
            el contenedor (no remonta el iframe), así no recarga ni parpadea. */}
        <div className="flex flex-1 items-start justify-center overflow-auto bg-bg-muted p-6">
          <div
            className={cn(
              'transition-all duration-300 ease-out',
              device === 'mobile'
                ? 'overflow-hidden rounded-[2rem] border-8 border-black bg-black shadow-2xl'
                : 'h-full w-full',
            )}
            style={device === 'mobile' ? { width: 390 } : undefined}
          >
            {/* Esperar el token antes de montar el iframe: si no, carga sin ?pt y recarga al llegar. */}
            {previewToken !== undefined ? (
              <iframe
                ref={iframeRef}
                src={previewUrl}
                title="Preview"
                className={cn(
                  'w-full bg-white',
                  device === 'mobile'
                    ? 'h-[780px]'
                    : 'h-full min-h-[700px] rounded-lg border border-border shadow-card',
                )}
              />
            ) : (
              <div
                className={cn(
                  'flex w-full items-center justify-center bg-white text-sm text-fg-muted',
                  device === 'mobile' ? 'h-[780px]' : 'h-full min-h-[700px] rounded-lg border border-border shadow-card',
                )}
              >
                Cargando vista previa…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RootNav({ onNavigate, theme, onOpenGallery }: { onNavigate: (v: string) => void; theme: ThemeConfig; onOpenGallery: () => void }) {
  return (
    <div className="py-2">
      <EditorChecklist theme={theme} onNavigate={onNavigate} />

      {/* Atajo a diseños completos listos (colores + fuentes + secciones en 1 click). */}
      <button
        onClick={onOpenGallery}
        className="mx-3 mb-1 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-primary/10"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="flex-1">Elegí un diseño listo</span>
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Orden de armado: de lo global (marca) a lo específico (conversión) → la tienda "se arma sola". */}
      <GroupLabel>1 · Identidad</GroupLabel>
      <NavRow icon={Image} label="Logo de la tienda" onClick={() => onNavigate('logo')} />
      <NavRow icon={Palette} label="Colores de tu marca" onClick={() => onNavigate('colors')} />
      <NavRow icon={Type} label="Tipo de letra" onClick={() => onNavigate('fonts')} />

      <GroupLabel>2 · Estilo global</GroupLabel>
      <NavRow icon={Square} label="Estilo y movimiento" onClick={() => onNavigate('radius')} />

      <GroupLabel>3 · Estructura de la tienda</GroupLabel>
      <NavRow icon={ChevronUp} label="Encabezado" onClick={() => onNavigate('header')} />
      <NavRow icon={ChevronDown} label="Pie de página" onClick={() => onNavigate('footer')} />

      <GroupLabel>4 · Contenido</GroupLabel>
      <NavRow icon={Home} label="Página de inicio" onClick={() => onNavigate('home')} />
      <NavRow icon={List} label="Listado de productos" onClick={() => onNavigate('products-list')} />
      <NavRow icon={Package} label="Detalle de producto" onClick={() => onNavigate('product-detail')} />

      <GroupLabel>5 · Conversión y contacto</GroupLabel>
      <NavRow icon={ShoppingCart} label="Carrito de compras" onClick={() => onNavigate('cart')} />
      <NavRow icon={MessageCircle} label="Botón de WhatsApp" onClick={() => onNavigate('whatsapp')} />
      <NavRow icon={Phone} label="Contacto" onClick={() => onNavigate('contact')} />

      <GroupLabel>6 · Avanzado y estado</GroupLabel>
      <NavRow icon={Code} label="Edición avanzada de CSS" onClick={() => onNavigate('css')} />
      <NavRow icon={Construction} label="Tienda en construcción" onClick={() => onNavigate('coming-soon')} />
    </div>
  );
}

/**
 * Checklist de progreso: nudges accionables (cada uno abre su panel). Usa solo
 * señales del theme (sin fetches extra). Se colapsa a un resumen cuando está todo.
 */
function EditorChecklist({ theme, onNavigate }: { theme: ThemeConfig; onNavigate: (v: string) => void }) {
  const items = [
    { label: 'Cargá tu logo', done: !!theme.logo, view: 'logo' },
    { label: 'Elegí colores de marca', done: theme.colors.primary !== baseTheme.colors.primary, view: 'colors' },
    { label: 'Armá tu página de inicio', done: theme.sections.length > 0, view: 'home' },
    { label: 'Mostrá medios de pago', done: theme.footer.paymentLogos.length > 0, view: 'footer' },
    { label: 'Cargá datos de contacto', done: !!(theme.contact.whatsapp || theme.contact.phone || theme.contact.email || theme.contact.address), view: 'contact' },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  if (doneCount === items.length) return null; // todo listo → no molestar

  return (
    <div className="mx-3 mb-3 mt-1 rounded-lg border border-border bg-bg-muted p-3">
      <div className="mb-1.5 flex items-center justify-between text-sm font-semibold text-fg">
        <span>Poné tu tienda linda</span>
        <span className="text-xs text-fg-muted">{doneCount}/{items.length}</span>
      </div>
      <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.view}>
            <button
              onClick={() => onNavigate(it.view)}
              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-surface"
            >
              <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', it.done ? 'border-primary bg-primary text-primary-fg' : 'border-border text-transparent')}>
                <CheckIcon className="h-3 w-3" />
              </span>
              <span className={cn('flex-1', it.done ? 'text-fg-muted line-through' : 'text-fg')}>{it.label}</span>
              {!it.done && <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{children}</div>;
}
function NavRow({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg hover:bg-bg-muted">
      <Icon className="h-4 w-4 shrink-0 text-fg-muted" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-fg-subtle" />
    </button>
  );
}

/** Sección plegable para paneles largos (ej. Encabezado). Título clickeable + cuerpo. */
function Collapsible({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-semibold text-fg">
        {title}
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function ColorsPanel({ theme, onBack, onReset, setColor, onToggleAccent, applyPreset }: { theme: ThemeConfig; onBack: () => void; onReset: () => void; setColor: (k: keyof ThemeConfig['colors'], v: string) => void; onToggleAccent: (on: boolean) => void; applyPreset: (p: (typeof presets)[number]) => void }) {
  return (
    <div>
      <BackHeader title="Colores de tu marca" onBack={onBack} onReset={onReset} />
      <div className="space-y-5 p-4">
        <ColorRow label="Color principal" hint="Botones, destacados, líneas." value={theme.colors.primary} onChange={(v) => setColor('primary', v)} fallback="#e8501e" />
        <Check label="Usar color de acento" checked={theme.colors.useAccent} onChange={(v) => onToggleAccent(v)} />
        {theme.colors.useAccent && <ColorRow label="Color de acento" value={theme.colors.accent} onChange={(v) => setColor('accent', v)} fallback="#1b1510" />}
        <div className="border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-fg">Colores de contraste</div>
          <div className="space-y-3">
            <ColorRow label="Color de fondo" value={theme.colors.bg} onChange={(v) => setColor('bg', v)} fallback="#ffffff" />
            <ColorRow label="Color de textos" value={theme.colors.text} onChange={(v) => setColor('text', v)} fallback="#111827" />
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Vista previa</div>
          <div className="rounded-lg border border-border p-3" style={{ background: `rgb(${theme.colors.bg})`, color: `rgb(${theme.colors.text})` }}>
            <div className="text-sm font-semibold">Producto de ejemplo</div>
            <div className="mt-0.5 text-xs" style={{ opacity: 0.7 }}>$ 12.500</div>
            <button className="mt-2 w-full rounded-md py-1.5 text-xs font-semibold" style={{ background: `rgb(${theme.colors.primary})`, color: contrastText(theme.colors.primary) }}>
              Agregar al carrito
            </button>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold text-fg">Combinaciones predeterminadas</div>
          <p className="mb-3 text-xs text-fg-muted">Un click para arrancar de una base. El nombre va en el fondo y color de texto reales de la paleta.</p>
          {(['light', 'dark'] as const).map((grp) => (
            <div key={grp} className="mb-4 last:mb-0">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{grp === 'light' ? 'Claras' : 'Oscuras'}</div>
              <div className="grid grid-cols-2 gap-2">
                {presets.filter((p) => p.group === grp).map((p) => {
                  const active = theme.colors.primary === p.primary && theme.colors.bg === p.bg && theme.colors.text === p.text;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      aria-pressed={active}
                      title={p.name}
                      className={cn('overflow-hidden rounded-lg border transition', active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border-strong')}
                    >
                      <div className="flex h-7">
                        <div className="flex-1" style={{ background: `rgb(${p.primary})` }} />
                        <div className="w-1/3" style={{ background: `rgb(${p.header})` }} />
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-2" style={{ background: `rgb(${p.bg})`, color: `rgb(${p.text})` }}>
                        <span className="text-sm font-semibold">{p.name}</span>
                        <span className="text-xs opacity-60">Aa</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FontsPanel({ theme, onBack, updateTheme }: { theme: ThemeConfig; onBack: () => void; updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void }) {
  const setFont = (k: 'heading' | 'body', v: string) => updateTheme((t) => ({ ...t, fonts: { ...t.fonts, [k]: v } }));
  const applyPair = (heading: string, body: string) => updateTheme((t) => ({ ...t, fonts: { ...t.fonts, heading, body } }));
  return (
    <div>
      <BackHeader title="Tipo de letra" onBack={onBack} />
      <div className="space-y-5 p-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Combinaciones listas</div>
          <p className="mb-3 text-xs text-fg-muted">Pares de tipografías que combinan bien. Tocá una para aplicarla.</p>
          <div className="grid grid-cols-2 gap-2">
            {FONT_PAIRINGS.map((p) => {
              const active = theme.fonts.heading === p.heading && theme.fonts.body === p.body;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPair(p.heading, p.body)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg border p-3 text-left transition',
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border-strong',
                  )}
                >
                  <div className="text-lg leading-tight text-fg" style={{ fontFamily: FONT_CSS[p.heading] }}>{p.name}</div>
                  <div className="mt-0.5 text-xs text-fg-muted" style={{ fontFamily: FONT_CSS[p.body] }}>Texto de muestra</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Personalizado</div>
          <div className="space-y-4">
            <Field label="Títulos de páginas y banners">
              <Select value={theme.fonts.heading} onChange={(v) => setFont('heading', v)} options={fontOptions} />
            </Field>
            <Field label="Texto en el resto del sitio">
              <Select value={theme.fonts.body} onChange={(v) => setFont('body', v)} options={fontOptions} />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

const HEADER_PRESETS: { name: string; recommended?: boolean; header: Partial<ThemeConfig['header']> }[] = [
  { name: 'Clásico', recommended: true, header: { layout: 'classic', border: 'line', transparentOnHome: false, logoSize: 'md', sticky: true } },
  { name: 'Centrado', header: { layout: 'logo-center', border: 'none', transparentOnHome: false, logoSize: 'md', sticky: true } },
  { name: 'Inmersivo', header: { layout: 'classic', border: 'none', transparentOnHome: true, transparentLevel: 'full', logoSize: 'lg', sticky: true } },
  { name: 'Minimal', header: { layout: 'menu-left', border: 'none', transparentOnHome: false, logoSize: 'sm', sticky: true } },
];

function HeaderPanel({ theme, onBack, updateTheme }: { theme: ThemeConfig; onBack: () => void; updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void }) {
  const confirm = useConfirm();
  const setH = sectionSetter(updateTheme, 'header');
  // Editar / quitar un anuncio por índice (evita repetir el map/filter en cada campo).
  const updateItem = (i: number, patch: Partial<ThemeConfig['announcement']['items'][number]>) =>
    updateTheme((t) => ({ ...t, announcement: { ...t.announcement, items: t.announcement.items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) } }));
  const removeItem = (i: number) =>
    updateTheme((t) => ({ ...t, announcement: { ...t.announcement, items: t.announcement.items.filter((_, idx) => idx !== i) } }));
  const matchesPreset = (h: Partial<ThemeConfig['header']>) =>
    (Object.keys(h) as (keyof ThemeConfig['header'])[]).every((k) => theme.header[k] === h[k]);
  return (
    <div>
      <BackHeader
        title="Encabezado"
        onBack={onBack}
        onReset={async () => { if (await confirm({ title: 'Restablecer encabezado', message: '¿Volver el encabezado y la barra de anuncio a los valores por defecto?', confirmLabel: 'Restablecer', variant: 'danger' })) updateTheme((t) => ({ ...t, header: baseTheme.header, announcement: baseTheme.announcement })); }}
      />
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Estilos rápidos</div>
          <div className="grid grid-cols-2 gap-2">
            {HEADER_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setH(p.header)}
                aria-pressed={matchesPreset(p.header)}
                className={cn(
                  'relative rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                  matchesPreset(p.header) ? 'border-primary text-primary ring-2 ring-primary/30' : 'border-border text-fg hover:border-border-strong',
                )}
              >
                {p.name}
                {p.recommended && (
                  <span className="absolute -top-2 right-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary-fg">Recomendado</span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">Ajustá los detalles abajo.</p>
        </div>
        <ColorRow label="Color de fondo del encabezado" value={theme.header.bg} onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, bg: v } }))} fallback="#1b1510" />
        <Check label="Encabezado siempre visible al navegar" checked={theme.header.sticky} onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, sticky: v } }))} />
        <Check label="Mostrar menú de solapas en celulares" checked={theme.header.showTabsMobile} onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, showTabsMobile: v } }))} />
        <Field label="Tamaño del logo">
          <Select value={theme.header.logoSize} onChange={(v) => updateTheme((t) => ({ ...t, header: { ...t.header, logoSize: v as 'sm' | 'md' | 'lg' } }))} options={[{ value: 'sm', label: 'Chico' }, { value: 'md', label: 'Predeterminado' }, { value: 'lg', label: 'Grande' }]} />
        </Field>

        <Collapsible title="Disposición y estilo">
          <div className="space-y-3">
            <Field label="Disposición">
              <Select
                value={theme.header.layout}
                onChange={(v) => setH({ layout: v as ThemeConfig['header']['layout'] })}
                options={[
                  { value: 'classic', label: 'Logo izquierda · menú centro' },
                  { value: 'logo-center', label: 'Logo centrado' },
                  { value: 'menu-left', label: 'Logo y menú a la izquierda' },
                  { value: 'menu-right', label: 'Menú a la derecha' },
                ]}
              />
            </Field>
            <ColorRow label="Color del texto del menú" value={theme.header.textColor} onChange={(v) => setH({ textColor: v })} fallback="#ffffff" />
            <Check label="Encabezado transparente sobre el inicio" checked={theme.header.transparentOnHome} onChange={(v) => setH({ transparentOnHome: v })} />
            {theme.header.transparentOnHome && (
              <Field label="Nivel de transparencia">
                <Select
                  value={theme.header.transparentLevel || 'full'}
                  onChange={(v) => setH({ transparentLevel: v as ThemeConfig['header']['transparentLevel'] })}
                  options={[{ value: 'full', label: 'Totalmente transparente' }, { value: 'light', label: 'Leve tinte' }, { value: 'medium', label: 'Tinte medio' }]}
                />
              </Field>
            )}
            <Field label="Borde inferior">
              <Select
                value={theme.header.border}
                onChange={(v) => setH({ border: v as ThemeConfig['header']['border'] })}
                options={[{ value: 'none', label: 'Ninguno' }, { value: 'line', label: 'Línea' }, { value: 'shadow', label: 'Sombra' }]}
              />
            </Field>
          </div>
        </Collapsible>

        <Collapsible title="Buscador y acciones">
          <div className="space-y-3">
            <Check label="Mostrar buscador en el encabezado" checked={theme.header.showSearch} onChange={(v) => setH({ showSearch: v })} />
            <Check label="Mostrar carrito" checked={theme.header.showCart} onChange={(v) => setH({ showCart: v })} />
            {theme.header.showCart && (
              <Field label="Estilo del carrito">
                <Select
                  value={theme.header.cartStyle}
                  onChange={(v) => setH({ cartStyle: v as ThemeConfig['header']['cartStyle'] })}
                  options={[{ value: 'icon', label: 'Solo ícono' }, { value: 'text', label: 'Ícono y texto «Carrito»' }]}
                />
              </Field>
            )}
            <Check label="Mostrar ícono de cuenta" checked={theme.header.showAccount} onChange={(v) => setH({ showAccount: v })} />
          </div>
        </Collapsible>

        <Collapsible title="Barra de anuncio" defaultOpen={false}>
          <Check label="Mostrar barra de anuncio" checked={theme.announcement.show} onChange={(v) => updateTheme((t) => ({ ...t, announcement: { ...t.announcement, show: v } }))} />
          {theme.announcement.show && (
            <div className="mt-3 space-y-3">
              <Field label="Animación">
                <Select
                  value={theme.announcement.animation}
                  onChange={(v) => updateTheme((t) => ({ ...t, announcement: { ...t.announcement, animation: v as ThemeConfig['announcement']['animation'] } }))}
                  options={[{ value: 'static', label: 'Fija (centrada)' }, { value: 'marquee', label: 'En movimiento (derecha → izquierda)' }]}
                />
              </Field>

              <div className="space-y-3">
                {theme.announcement.items.map((it, i) => (
                  <div key={i} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Anuncio {i + 1}</span>
                      {theme.announcement.items.length > 1 && (
                        <button
                          type="button"
                          aria-label="Quitar anuncio"
                          onClick={() => removeItem(i)}
                          className="rounded p-1 text-fg-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Field label="Texto">
                      <TextInput
                        value={it.text}
                        onChange={(v) => updateItem(i, { text: v })}
                        placeholder="10% OFF EN TU PRIMERA COMPRA"
                      />
                    </Field>
                    <Field label="Link (opcional)">
                      <TextInput
                        value={it.link}
                        onChange={(v) => updateItem(i, { link: v })}
                        placeholder="/productos"
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => updateTheme((t) => ({ ...t, announcement: { ...t.announcement, items: [...t.announcement.items, { text: '', link: '' }] } }))}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Agregar anuncio
              </button>
              {theme.announcement.animation === 'marquee' && (
                <p className="text-xs text-fg-muted">Con varios anuncios y movimiento, se muestran en fila desplazándose en loop.</p>
              )}
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  );
}

type PanelProps = { theme: ThemeConfig; onBack: () => void; updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void };

function ProductListPanel({ theme, onBack, updateTheme }: PanelProps) {
  const confirm = useConfirm();
  const set = sectionSetter(updateTheme, 'productList');
  return (
    <div>
      <BackHeader
        title="Listado de productos"
        onBack={onBack}
        onReset={async () => { if (await confirm({ title: 'Restablecer listado', message: '¿Volver el listado de productos a los valores por defecto?', confirmLabel: 'Restablecer', variant: 'danger' })) updateTheme((t) => ({ ...t, productList: baseTheme.productList })); }}
      />
      <div className="space-y-4 p-4">
        <Field label="Productos por fila">
          <Select value={String(theme.productList.columns)} onChange={(v) => set({ columns: Number(v) })} options={[{ value: '2', label: '2 columnas' }, { value: '3', label: '3 columnas' }, { value: '4', label: '4 columnas' }]} />
        </Field>
        <Check label="Mostrar precio" checked={theme.productList.showPrice} onChange={(v) => set({ showPrice: v })} />
        <Check label="Mostrar precio tachado (promo)" checked={theme.productList.showCompareAt} onChange={(v) => set({ showCompareAt: v })} />
        <Check label="Mostrar botón 'Agregar al carrito'" checked={theme.productList.showBuyButton} onChange={(v) => set({ showBuyButton: v })} />
        <Check label="Mostrar disponibilidad (stock)" checked={theme.productList.showStockBadge} onChange={(v) => set({ showStockBadge: v })} />
        <p className="-mt-2 text-xs text-fg-muted">Muestra «Sin stock» o «¡Últimas N!» en las cards. Activalo solo si controlás stock.</p>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Precio con transferencia y cuotas</div>
          <Check label="Mostrar precio con transferencia" checked={theme.productList.showCashPrice} onChange={(v) => set({ showCashPrice: v })} />
          <p className="mb-3 mt-1 text-xs text-fg-muted">Usa el % de descuento por transferencia de «Detalle de producto».</p>
          <Field label="Cuotas sin interés (0 = no mostrar)">
            <Select
              value={String(theme.productList.installmentsCount)}
              onChange={(v) => set({ installmentsCount: Number(v) })}
              options={[0, 3, 6, 9, 12].map((n) => ({ value: String(n), label: n === 0 ? 'No mostrar' : `${n} cuotas` }))}
            />
          </Field>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-1 text-sm font-semibold text-fg">Filtros del sidebar</div>
          <p className="mb-3 text-xs text-fg-muted">Cada filtro se muestra solo si tus productos tienen esos datos.</p>
          <Check label="Categorías" checked={theme.productList.filterCategories} onChange={(v) => set({ filterCategories: v })} />
          <Check label="Precio (Desde / Hasta)" checked={theme.productList.filterPrice} onChange={(v) => set({ filterPrice: v })} />
          <Check label="Marca" checked={theme.productList.filterBrand} onChange={(v) => set({ filterBrand: v })} />
          <Check label="Color / Talle y otras opciones" checked={theme.productList.filterOptions} onChange={(v) => set({ filterOptions: v })} />
        </div>
      </div>
    </div>
  );
}

function ProductDetailPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'productDetail');
  return (
    <div>
      <BackHeader title="Detalle de producto" onBack={onBack} />
      <div className="space-y-4 p-4">
        <Field label="Estilo de galería">
          <Select value={theme.productDetail.galleryStyle} onChange={(v) => set({ galleryStyle: v as ThemeConfig['productDetail']['galleryStyle'] })} options={[{ value: 'thumbs', label: 'Miniaturas abajo' }, { value: 'thumbs-left', label: 'Miniaturas verticales' }]} />
        </Field>
        <Check label="Mostrar SKU" checked={theme.productDetail.showSku} onChange={(v) => set({ showSku: v })} />
        <Check label="Mostrar stock" checked={theme.productDetail.showStock} onChange={(v) => set({ showStock: v })} />
        <Check label="Mostrar productos relacionados" checked={theme.productDetail.showRelated} onChange={(v) => set({ showRelated: v })} />
        <Field label="Descuento pagando en efectivo (%)" hint="0 = sin descuento. Se muestra como 'precio con EFECTIVO' en la página del producto.">
          <TextInput value={String(theme.productDetail.cashDiscountPercent || 0)} onChange={(v) => set({ cashDiscountPercent: Math.max(0, Math.min(90, Number(v.replace(/\D/g, '')) || 0)) })} placeholder="10" />
        </Field>
      </div>
    </div>
  );
}

function ComingSoonPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'comingSoon');
  return (
    <div>
      <BackHeader title="Tienda en construcción" onBack={onBack} />
      <div className="space-y-4 p-4">
        <Check label="Activar modo en construcción" checked={theme.comingSoon.enabled} onChange={(v) => set({ enabled: v })} />
        <p className="text-xs text-fg-muted">
          Mientras esté activo, los visitantes ven una página de “Próximamente” en lugar de la tienda. Vos podés seguir
          viéndola y editándola con la vista previa. Acordate de <strong>publicar</strong> para que el cambio se aplique.
        </p>
        <Field label="Título"><TextInput value={theme.comingSoon.title} onChange={(v) => set({ title: v })} placeholder="Estamos en construcción" /></Field>
        <Field label="Mensaje"><TextInput value={theme.comingSoon.message} onChange={(v) => set({ message: v })} placeholder="Volvemos muy pronto con la tienda." /></Field>
      </div>
    </div>
  );
}

function CartPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'cart');
  return (
    <div>
      <BackHeader title="Carrito de compras" onBack={onBack} />
      <div className="space-y-4 p-4">
        <Field label="Texto del botón de checkout"><TextInput value={theme.cart.checkoutButtonText} onChange={(v) => set({ checkoutButtonText: v })} placeholder="Iniciar compra" /></Field>
        <Check label="Mostrar productos sugeridos" checked={theme.cart.showSuggested} onChange={(v) => set({ showSuggested: v })} />
        <Field label="Mensaje para clientes" hint="Se muestra en el carrito (ej. aclaraciones de envío o pago). Vacío = no se muestra.">
          <TextArea value={theme.cart.notice} onChange={(v) => set({ notice: v })} />
        </Field>
        <Check label="Mostrar barra de envío gratis" checked={theme.cart.freeShippingBar} onChange={(v) => set({ freeShippingBar: v })} />
        {theme.cart.freeShippingBar && (
          <Field label="Mínimo para envío gratis (ARS)">
            <TextInput value={String(theme.cart.freeShippingThreshold / 100)} onChange={(v) => set({ freeShippingThreshold: Math.round(Number(v.replace(/\D/g, '')) * 100) })} placeholder="50000" />
          </Field>
        )}
      </div>
    </div>
  );
}

function ContactPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'contact');
  return (
    <div>
      <BackHeader title="Contacto" onBack={onBack} />
      <div className="space-y-4 p-4">
        <p className="text-xs text-fg-muted">Estos datos salen en la <strong>página de Contacto</strong>. Los que aparecen en el <strong>pie de página</strong> se editan en «Pie de página».</p>
        <div className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-fg">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <p>
            Es obligatorio incluir estos datos en tu tienda, según la{' '}
            <a href="https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-104-2005-107456" target="_blank" rel="noreferrer" className="font-medium text-primary underline hover:no-underline">
              Resolución N° 104/2005 de Defensa del Consumidor
            </a>.
          </p>
        </div>
        <Check label="Mostrar formulario de contacto" checked={theme.contact.showForm} onChange={(v) => set({ showForm: v })} />
        <Field label="Dirección del local o showroom"><TextInput value={theme.contact.address} onChange={(v) => set({ address: v })} placeholder="Av. Corrientes 1234, CABA" /></Field>
        <Field label="Teléfono"><TextInput value={theme.contact.phone} onChange={(v) => set({ phone: v })} placeholder="+54 11 1234-5678" /></Field>
        <Field label="Email de la tienda"><TextInput value={theme.contact.email} onChange={(v) => set({ email: v })} placeholder="contacto@mitienda.com" /></Field>
        <Field label="WhatsApp"><TextInput value={theme.contact.whatsapp} onChange={(v) => set({ whatsapp: v })} placeholder="+54 9 11 1234 5678" /></Field>
      </div>
    </div>
  );
}

const WHATSAPP_MESSAGES = [
  '¡Hola! Tengo una consulta.',
  '¡Hola! Quiero hacer un pedido.',
  'Hola, ¿hacen envíos a mi zona?',
  'Hola, quería consultar por un producto.',
  '¡Hola! ¿Tienen stock disponible?',
];

function WhatsAppPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'whatsappButton');
  const w = theme.whatsappButton;
  return (
    <div>
      <BackHeader title="Botón de WhatsApp" onBack={onBack} />
      <div className="space-y-4 p-4">
        <p className="text-xs text-fg-muted">Botón flotante fijo abajo a la derecha del storefront. Tu cliente lo toca y te escribe directo.</p>
        <Check label="Mostrar botón de WhatsApp" checked={w.enabled} onChange={(v) => set({ enabled: v })} />
        {w.enabled && (
          <>
            <Field label="Número de WhatsApp"><TextInput value={w.phone} onChange={(v) => set({ phone: v })} placeholder="+54 9 11 1234 5678" /></Field>
            <Field label="Mensaje inicial"><TextArea value={w.message} onChange={(v) => set({ message: v })} /></Field>
            <Check
              label="Vista previa al pasar el mouse"
              checked={w.showPreview}
              onChange={(v) => set({ showPreview: v })}
            />
            <p className="-mt-2 text-xs text-fg-muted">En compu, al pasar el mouse por el botón se abre un mini-chat estilo WhatsApp con el mensaje.</p>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Mensajes listos</div>
              <div className="space-y-1.5">
                {WHATSAPP_MESSAGES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ message: m })}
                    aria-pressed={w.message === m}
                    className={cn(
                      'block w-full rounded-md border px-3 py-2 text-left text-sm transition',
                      w.message === m ? 'border-primary text-primary ring-2 ring-primary/30' : 'border-border text-fg hover:border-border-strong',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FooterPanel({ theme, onBack, updateTheme }: PanelProps) {
  const set = sectionSetter(updateTheme, 'footer');
  return (
    <div>
      <BackHeader title="Pie de página" onBack={onBack} />
      <div className="space-y-4 p-4">
        <Field label="Texto del pie"><TextArea value={theme.footer.text} onChange={(v) => set({ text: v })} /></Field>
        <Check label="Mostrar redes sociales" checked={theme.footer.showSocial} onChange={(v) => set({ showSocial: v })} />
        {theme.footer.showSocial && (
          <>
            <Field label="Instagram (URL)"><TextInput value={theme.footer.instagram} onChange={(v) => set({ instagram: v })} placeholder="https://instagram.com/..." /></Field>
            <Field label="Facebook (URL)"><TextInput value={theme.footer.facebook} onChange={(v) => set({ facebook: v })} placeholder="https://facebook.com/..." /></Field>
          </>
        )}
        <Check label="Mostrar logos de medios de pago" checked={theme.footer.showPaymentLogos} onChange={(v) => set({ showPaymentLogos: v })} />
        {theme.footer.showPaymentLogos && (
          <PaymentLogoPicker selected={theme.footer.paymentLogos} onChange={(v) => set({ paymentLogos: v })} />
        )}

        <div className="border-t border-border pt-4">
          <div className="mb-3 text-sm font-semibold text-fg">Contacto en el pie</div>
          <div className="space-y-4">
            <StringList label="WhatsApp" hint="Uno o varios. Número con código de país." values={theme.footer.whatsapps} onChange={(v) => set({ whatsapps: v })} placeholder="+54 9 11 1234 5678" />
            <StringList label="Direcciones" values={theme.footer.addresses} onChange={(v) => set({ addresses: v })} placeholder="Av. Corrientes 1234, CABA" />
            <StringList label="Teléfonos" values={theme.footer.phones} onChange={(v) => set({ phones: v })} placeholder="0800 123 4567" />
            <StringList label="Emails" values={theme.footer.emails} onChange={(v) => set({ emails: v })} placeholder="hola@mitienda.com" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Grilla de logos de medios de pago. Click = seleccionar/deseleccionar. */
function PaymentLogoPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-fg-muted">Elegí qué logos mostrar ({selected.length})</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-fg-subtle hover:text-fg">Limpiar</button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_LOGOS.map((logo) => {
          const on = selected.includes(logo.slug);
          return (
            <button
              key={logo.slug}
              type="button"
              onClick={() => toggle(logo.slug)}
              title={logo.label}
              aria-pressed={on}
              className={cn(
                'flex h-12 items-center justify-center rounded-md border bg-white p-2 transition',
                on ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-50 hover:opacity-100',
              )}
            >
              <img src={`/payment-logos/${logo.slug}.svg`} alt={logo.label} className="max-h-full max-w-full object-contain" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Grupo de opciones tipo segmented (3 botones). */
function SegGroup<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-lg border px-2 py-2 text-xs font-medium transition',
            value === o.value ? 'border-primary text-primary ring-2 ring-primary/30' : 'border-border text-fg hover:border-border-strong',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BorderRadiusPanel({ theme, onBack, updateTheme }: PanelProps) {
  const radiusOpts: { value: ThemeConfig['borderRadius']; label: string; sample: string }[] = [
    { value: 'rounded', label: 'Redondeado', sample: 'rounded-xl' },
    { value: 'soft', label: 'Suave', sample: 'rounded' },
    { value: 'sharp', label: 'Cuadrado', sample: 'rounded-none' },
  ];
  const iconKits: { value: ThemeConfig['iconKit']; label: string; desc: string }[] = [
    { value: 'lucide', label: 'Clásico', desc: 'Líneas limpias (por defecto)' },
    { value: 'feather', label: 'Fino', desc: 'Trazo liviano y minimal' },
    { value: 'tabler', label: 'Marcado', desc: 'Contorno con más presencia' },
    { value: 'phosphor', label: 'Relleno', desc: 'Íconos sólidos redondeados' },
    { value: 'heroicons', label: 'Sólido', desc: 'Sólidos y compactos' },
  ];
  return (
    <div>
      <BackHeader title="Estilo y movimiento" onBack={onBack} />
      <div className="space-y-6 p-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-fg">Bordes</div>
          <p className="mb-3 text-xs text-fg-muted">Cards, botones, imágenes e inputs. Los íconos circulares no cambian.</p>
          <div className="grid grid-cols-3 gap-2">
            {radiusOpts.map((o) => {
              const active = theme.borderRadius === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateTheme((t) => ({ ...t, borderRadius: o.value }))}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center gap-2.5 rounded-lg border p-3 text-xs font-medium transition',
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border-strong',
                  )}
                >
                  <span className={cn('h-11 w-11 border-2 border-fg/50 bg-fg/5', o.sample)} />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Íconos</div>
          <p className="mb-3 text-xs text-fg-muted">Cambia el estilo de todos los íconos de la tienda (carrito, corazón, cuenta, contacto, etc.). Miralo en la vista previa.</p>
          <div className="grid gap-2">
            {iconKits.map((k) => {
              const active = theme.iconKit === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => updateTheme((t) => ({ ...t, iconKit: k.value }))}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition',
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border-strong',
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium text-fg">{k.label}</span>
                    <span className="block text-xs text-fg-muted">{k.desc}</span>
                  </span>
                  {active && <span className="text-xs font-semibold text-primary">Activo</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Movimiento</div>
          <p className="mb-3 text-xs text-fg-muted">Animaciones de entrada al cargar y scrollear. <span className="text-primary">Recomendado: Sutil.</span></p>
          <SegGroup
            value={theme.motion}
            onChange={(v) => updateTheme((t) => ({ ...t, motion: v }))}
            options={[
              { value: 'none', label: 'Sin' },
              { value: 'subtle', label: 'Sutil' },
              { value: 'dynamic', label: 'Dinámico' },
            ]}
          />
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-2 text-sm font-semibold text-fg">Densidad</div>
          <p className="mb-3 text-xs text-fg-muted">Cuánto aire entre secciones de la tienda. <span className="text-primary">Recomendado: Cómodo.</span></p>
          <SegGroup
            value={theme.density}
            onChange={(v) => updateTheme((t) => ({ ...t, density: v }))}
            options={[
              { value: 'compact', label: 'Compacto' },
              { value: 'cozy', label: 'Cómodo' },
              { value: 'spacious', label: 'Amplio' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function CssPanel({ theme, onBack, updateTheme }: PanelProps) {
  return (
    <div>
      <BackHeader title="Edición avanzada de CSS" onBack={onBack} />
      <div className="space-y-2 p-4">
        <p className="text-xs text-fg-muted">CSS personalizado inyectado en tu tienda. Para usuarios avanzados.</p>
        <textarea
          value={theme.customCss}
          onChange={(e) => updateTheme((t) => ({ ...t, customCss: e.target.value }))}
          rows={14}
          aria-label="CSS personalizado"
          placeholder={'.product-card { border-radius: 16px; }'}
          className={`w-full p-3 font-mono text-xs ${INPUT_BASE}`}
        />
      </div>
    </div>
  );
}

export default ThemeEditorPage;
