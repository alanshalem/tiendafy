import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_MSG } from '@tiendafy/types';
import { useNavigate } from 'react-router-dom';
import { storefrontUrl } from '../lib/storefront';
import { AlertTriangle, ExternalLink, Monitor, Smartphone, X } from 'lucide-react';
import { Button, Dropdown, cn, useToast, useConfirm } from '@tiendafy/ui';
import { type ThemeConfig, normalizeTheme, baseTheme } from '@tiendafy/types';
import { useStore } from '../context/StoreContext';
import { api, setActiveTenant, errMsg } from '../lib/api';
import { ThemeModeToggle } from '../components/ThemeModeToggle';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { ImageUploader } from './theme-editor-uploaders';
import { BackHeader, Field, TextInput, TextArea, contrastText } from './theme-editor-inputs';
import { HomePanel, SectionPanel } from './theme-editor-sections';
import {
  BorderRadiusPanel,
  CartPanel,
  ColorsPanel,
  ComingSoonPanel,
  ContactPanel,
  CssPanel,
  FontsPanel,
  FooterPanel,
  HeaderPanel,
  ProductDetailPanel,
  ProductListPanel,
  RootNav,
  WhatsAppPanel,
} from './theme-editor-panels';

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
  // Undo/redo: snapshots del theme (objeto chico, push por edición, tope 50).
  const undoStack = useRef<ThemeConfig[]>([]);
  const redoStack = useRef<ThemeConfig[]>([]);

  const previewBase = store ? storefrontUrl(store.subdomain) : '';
  const previewOrigin = previewBase; // origin esperado del iframe (targetOrigin + validación de e.origin)
  // El preview sigue al panel abierto: cada sección se ve en su propia página.
  const previewPath = useMemo(() => {
    switch (view) {
      case 'products-list':
        return '/productos?preview=1';
      case 'product-detail':
        return firstSlug ? `/productos/${firstSlug}?preview=1` : '/preview';
      case 'contact':
        return '/contacto?preview=1';
      default:
        return '/preview'; // inicio (header, colores, fuentes, secciones, footer…) + carrito
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
    return () => {
      document.body.style.overflow = prev;
    };
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
    undoStack.current = [];
    redoStack.current = [];
    Promise.all([
      api.get<Partial<ThemeConfig>>('/api/v1/theme/draft'),
      api.get<Partial<ThemeConfig>>('/api/v1/theme'),
    ])
      .then(([d, p]) => {
        setTheme(withDefaults(d));
        setPublished(withDefaults(p));
      })
      .catch(() => {
        setTheme(null);
        setLoadError(true);
      });
    // Token firmado para que el iframe de preview pueda leer el draft. Si falla,
    // el preview cae al tema publicado (el postMessage pinta el draft igual).
    api
      .post<{ token: string }>('/api/v1/theme/preview-token', {})
      .then((r) => setPreviewToken(r.token))
      .catch(() => setPreviewToken(null));
    // Un producto real para previsualizar el panel "Detalle de producto".
    api
      .get<{ items: { slug: string }[] }>('/api/v1/products?limit=1')
      .then((r) => setFirstSlug(r.items[0]?.slug ?? null))
      .catch(() => setFirstSlug(null));
  }, [store, loadKey]);

  // Postear tema al iframe (preview en vivo), con throttle (~80ms trailing):
  // tipear o arrastrar el selector de color emite decenas de cambios por segundo
  // y cada postMessage re-renderiza el storefront completo del iframe.
  const postToPreview = useCallback(
    (t: ThemeConfig) => {
      pendingPost.current = t;
      if (postTimer.current != null) return;
      postTimer.current = window.setTimeout(() => {
        postTimer.current = null;
        const latest = pendingPost.current;
        if (latest)
          iframeRef.current?.contentWindow?.postMessage(
            { type: EDITOR_MSG.theme, theme: latest },
            previewOrigin || '*',
          );
      }, 80);
    },
    [previewOrigin],
  );

  // Abrir/cerrar el carrito en el preview (no es una página: se controla por mensaje).
  const postCart = useCallback(
    (open: boolean) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: EDITOR_MSG.previewCart, open },
        previewOrigin || '*',
      );
    },
    [previewOrigin],
  );

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
  useEffect(() => {
    postCart(view === 'cart');
  }, [view, postCart]);

  // Al abrir un panel, resaltar su sección en el preview (scroll + flash). Solo aplica
  // a lo que se ve en el home: encabezado, pie y secciones del inicio.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    let msg: { type: string; target?: string; sectionId?: string } | null = null;
    if (view === 'header') msg = { type: EDITOR_MSG.focusSection, target: 'header' };
    else if (view === 'footer') msg = { type: EDITOR_MSG.focusSection, target: 'footer' };
    else if (view.startsWith('home:'))
      msg = { type: EDITOR_MSG.focusSection, target: 'section', sectionId: view.slice(5) };
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
  const saveDraft = useCallback(
    (next: ThemeConfig, init?: RequestInit) => {
      pendingDraft.current = next;
      setSaveState('saving');
      api
        .put('/api/v1/theme/draft', next, init)
        .then(() => {
          // Solo si no hubo un cambio más nuevo mientras viajaba el PUT.
          if (pendingDraft.current === next) {
            pendingDraft.current = null;
            setSaveState('saved');
          }
        })
        .catch(() => {
          if (pendingDraft.current === next) setSaveState('error');
        });
    },
    [setSaveState],
  );

  // Guardado pendiente (o fallido) → mandarlo YA (cerrar editor, cambiar tienda, reintentar).
  const flushDraft = useCallback(
    (init?: RequestInit) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (pendingDraft.current) saveDraft(pendingDraft.current, init);
    },
    [saveDraft],
  );

  // Cambio de tema: live + autosave debounced + snapshot para deshacer.
  const updateTheme = useCallback(
    (updater: (t: ThemeConfig) => ThemeConfig) => {
      setTheme((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (next === prev) return prev;
        // Guard del doble-invoke de StrictMode: no duplicar el snapshot.
        if (undoStack.current[undoStack.current.length - 1] !== prev) {
          undoStack.current.push(prev);
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = []; // una edición nueva invalida el redo
        }
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

  // Aplica un snapshot (undo/redo): live + autosave, SIN tocar el historial.
  const applySnapshot = useCallback(
    (next: ThemeConfig) => {
      setTheme(next);
      postToPreview(next);
      pendingDraft.current = next;
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveDraft(next), 600);
    },
    [postToPreview, saveDraft, setSaveState],
  );

  // Ctrl/Cmd+Z deshace, Ctrl/Cmd+Shift+Z (o Ctrl+Y) rehace. Dentro de un
  // input/textarea gana el undo nativo del campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        const prev = undoStack.current.pop();
        if (prev && theme) {
          redoStack.current.push(theme);
          applySnapshot(prev);
        }
        e.preventDefault();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        const next = redoStack.current.pop();
        if (next && theme) {
          undoStack.current.push(theme);
          applySnapshot(next);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theme, applySnapshot]);

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
        message:
          '¿Seguro que querés eliminar esta sección del inicio? Podés volver a agregarla cuando quieras.',
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
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingDraft.current = null;
      setSaveState('saved');
      toast('Diseño publicado en tu tienda', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'Error al publicar'), { variant: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (
      !(await confirm({
        title: 'Descartar cambios',
        message: '¿Descartar los cambios sin publicar y volver al diseño publicado?',
        confirmLabel: 'Descartar',
        variant: 'danger',
      }))
    )
      return;
    try {
      const published = withDefaults(await api.get<Partial<ThemeConfig>>('/api/v1/theme'));
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
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
        <Button className="mt-4" onClick={() => setLoadKey((k) => k + 1)}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!theme) return <p className="py-16 text-center text-sm text-fg-muted">Cargando editor...</p>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-subtle">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/canales/tienda-online/disenios')}
            aria-label="Cerrar"
            className="text-fg-muted hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="font-semibold text-fg">Editar diseño</span>
          <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
            ● Borrador
          </span>
          {/* Estado del autosave: sin esto, un guardado fallido era invisible y se perdía trabajo. */}
          {saveState === 'saving' && <span className="text-xs text-fg-subtle">Guardando…</span>}
          {saveState === 'saved' && <span className="text-xs text-fg-subtle">Guardado</span>}
          {saveState === 'error' && (
            <button
              onClick={() => flushDraft()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
            >
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
                    <span className={cn('block', s.id === store.id && 'font-semibold text-primary')}>
                      {s.name}
                    </span>
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
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                device === d ? 'bg-primary text-primary-fg shadow-sm' : 'text-fg-muted hover:text-fg',
              )}
            >
              {d === 'mobile' ? (
                <>
                  <Smartphone className="h-4 w-4" /> Celulares
                </>
              ) : (
                <>
                  <Monitor className="h-4 w-4" /> Computadoras
                </>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <ThemeModeToggle />
          <a
            href={previewBase}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver tienda <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={discard}
            disabled={!dirty}
            className="text-sm font-medium text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Descartar
          </button>
          <Button loading={publishing} disabled={!dirty} onClick={publish}>
            {dirty ? 'Publicar cambios' : 'Sin cambios'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Panel izquierdo */}
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-border bg-surface">
          {view === 'root' && (
            <RootNav
              onNavigate={setView}
              theme={theme}
              onOpenGallery={() => navigate('/canales/tienda-online/disenios')}
            />
          )}
          {view === 'logo' && (
            <div>
              <BackHeader title="Identidad de tu tienda" onBack={() => setView('root')} />
              <div className="space-y-5 p-4">
                <Field
                  label="Logo de la tienda"
                  hint="Se muestra en el encabezado. JPG, PNG, WebP, AVIF o SVG · hasta 5MB. Tamaño recomendado: 575×230px (horizontal, fondo transparente). SVG ideal: se ve nítido en cualquier tamaño. Si no cargás logo, se muestra el nombre de la tienda."
                >
                  <ImageUploader
                    value={theme.logo}
                    onChange={(url) => updateTheme((t) => ({ ...t, logo: url }))}
                    allowSvg
                  />
                </Field>
                <Field
                  label="Favicon"
                  hint="El ícono chico de la pestaña del navegador. JPG, PNG, WebP, AVIF o SVG · hasta 5MB. Tamaño recomendado: 130×130px (cuadrado). SVG ideal por nitidez."
                >
                  <ImageUploader
                    value={theme.favicon}
                    onChange={(url) => updateTheme((t) => ({ ...t, favicon: url }))}
                    allowSvg
                  />
                </Field>
                <Field
                  label="Imagen al compartir"
                  hint="La que se ve al compartir el link en redes (WhatsApp, Instagram…). JPG, PNG, WebP o AVIF · hasta 5MB. Tamaño recomendado: 1200×630px (horizontal) o 600×600px (cuadrada)."
                >
                  <ImageUploader
                    value={theme.shareImage}
                    onChange={(url) => updateTheme((t) => ({ ...t, shareImage: url }))}
                  />
                </Field>
                <div className="border-t border-border pt-4">
                  <div className="mb-1 text-sm font-semibold text-fg">Cómo aparecés en Google</div>
                  <p className="mb-3 text-xs text-fg-muted">
                    Título y descripción de tu tienda en los resultados de búsqueda. Vacío = se usa el nombre
                    de la tienda.
                  </p>
                  <div className="space-y-4">
                    <Field
                      label="Título para buscadores"
                      hint="Ideal: hasta 60 caracteres, con lo que vendés. Ej: «Volxen — Ropa de gimnasio»"
                    >
                      <TextInput
                        value={theme.seoTitle}
                        onChange={(v) => updateTheme((t) => ({ ...t, seoTitle: v }))}
                        placeholder={`${store.name} — Tienda online`}
                      />
                    </Field>
                    <Field
                      label="Descripción para buscadores"
                      hint="Ideal: 150-160 caracteres que inviten a hacer click."
                    >
                      <TextArea
                        value={theme.seoDescription}
                        onChange={(v) => updateTheme((t) => ({ ...t, seoDescription: v }))}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          )}
          {view === 'colors' && (
            <ColorsPanel
              theme={theme}
              onBack={() => setView('root')}
              onReset={async () => {
                if (
                  await confirm({
                    title: 'Restablecer colores',
                    message: '¿Volver los colores a los valores por defecto?',
                    confirmLabel: 'Restablecer',
                    variant: 'danger',
                  })
                )
                  updateTheme((t) => ({ ...t, colors: baseTheme.colors }));
              }}
              setColor={setColor}
              onToggleAccent={(on) => updateTheme((t) => ({ ...t, colors: { ...t.colors, useAccent: on } }))}
              applyPreset={(p) =>
                updateTheme((t) => ({
                  ...t,
                  colors: { ...t.colors, primary: p.primary, bg: p.bg, text: p.text },
                  header: { ...t.header, bg: p.header, textColor: contrastText(p.header) },
                }))
              }
            />
          )}
          {view === 'fonts' && (
            <FontsPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'radius' && (
            <BorderRadiusPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'header' && (
            <HeaderPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'home' && (
            <HomePanel
              theme={theme}
              onBack={() => setView('root')}
              onOpenSection={(id) => setView(`home:${id}`)}
              updateTheme={updateTheme}
            />
          )}
          {view.startsWith('home:') && (
            <SectionPanel
              section={theme.sections.find((s) => s.id === view.slice(5))!}
              onBack={() => setView('home')}
              onChange={(data) =>
                updateTheme((t) => ({
                  ...t,
                  sections: t.sections.map((s) => (s.id === view.slice(5) ? { ...s, data } : s)),
                }))
              }
            />
          )}
          {view === 'products-list' && (
            <ProductListPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'product-detail' && (
            <ProductDetailPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'cart' && (
            <CartPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'contact' && (
            <ContactPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'whatsapp' && (
            <WhatsAppPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'footer' && (
            <FooterPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'css' && (
            <CssPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
          {view === 'coming-soon' && (
            <ComingSoonPanel theme={theme} onBack={() => setView('root')} updateTheme={updateTheme} />
          )}
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
                  device === 'mobile'
                    ? 'h-[780px]'
                    : 'h-full min-h-[700px] rounded-lg border border-border shadow-card',
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

export default ThemeEditorPage;
