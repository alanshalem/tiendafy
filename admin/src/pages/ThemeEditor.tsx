import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, SlidersHorizontal } from 'lucide-react';
import { Button, Modal, cn, useToast, useConfirm } from '@tiendafy/ui';
import { sectionDisplayName, type ThemeConfig } from '@tiendafy/types';
import { storefrontUrl } from '../lib/storefront';
import { useStore } from '../context/StoreContext';
import { api, ApiRequestError, errMsg } from '../lib/api';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { OptionSearch } from './theme-editor-search';
import { CopyFromStoreModal, HistoryModal, ScheduleModal } from './theme-editor-versions';
import { ScreenSkeleton } from '../components/Skeleton';
import { useThemeDraft } from './theme-editor/useThemeDraft';
import { usePreviewBridge } from './theme-editor/usePreviewBridge';
import { EditorTopBar, type Device } from './theme-editor/EditorTopBar';
import { ConflictBanner } from './theme-editor/ConflictBanner';
import { EditorViews, SECTION_VIEW } from './theme-editor/EditorViews';
import { PreviewFrame } from './theme-editor/PreviewFrame';
import { UndoSnackbar, type UndoNotice } from './theme-editor/UndoSnackbar';
import { EDITOR_PANEL_ID } from './theme-editor/panelFocus';
import { insertSection, removeSection } from './theme-editor/sections/sectionOps';
import { ROW_MAIN_ATTR } from './theme-editor/sections/SectionRow';

/* ============================================================
   Editor de diseño con preview en vivo (postMessage al storefront).
   El draft vive en useThemeDraft (carga, autoguardado con versión,
   deshacer); usePreviewBridge habla con el iframe; EditorViews elige
   el panel. "Publicar" copia draft → published.
   ============================================================ */

const DEVICE_KEY = 'tiendafy.editor.device';

/**
 * Qué cambió respecto de lo publicado, en palabras. "Publicar" es irreversible
 * para el visitante: antes de tocarlo hay que poder ver qué se va a mover.
 */
const AREA_LABELS: Record<string, string> = {
  logo: 'Logo',
  favicon: 'Favicon',
  shareImage: 'Imagen al compartir',
  seoTitle: 'Título para Google',
  seoDescription: 'Descripción para Google',
  borderRadius: 'Bordes',
  motion: 'Movimiento',
  density: 'Densidad',
  iconKit: 'Íconos',
  colors: 'Colores de tu marca',
  fonts: 'Tipo de letra',
  header: 'Encabezado',
  announcement: 'Barra de anuncio',
  comingSoon: 'Tienda en construcción',
  sections: 'Página de inicio',
  productList: 'Listado de productos',
  productDetail: 'Detalle de producto',
  cart: 'Carrito de compras',
  contact: 'Contacto',
  footer: 'Pie de página',
  whatsappButton: 'Botón de WhatsApp',
  customCss: 'CSS personalizado',
};

export function changedAreas(draft: ThemeConfig | null, published: ThemeConfig | null): string[] {
  if (!draft || !published) return [];
  return Object.keys(AREA_LABELS)
    .filter(
      (k) =>
        JSON.stringify(draft[k as keyof ThemeConfig]) !== JSON.stringify(published[k as keyof ThemeConfig]),
    )
    .map((k) => AREA_LABELS[k]!);
}

export function ThemeEditorPage() {
  const { store, stores, selectStore } = useStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [firstSlug, setFirstSlug] = useState<string | null>(null); // un producto real para previsualizar el detalle
  // El ancho elegido se recuerda: quien diseña para celular no quiere volver a
  // clickear "Celulares" cada vez que entra.
  const [device, setDevice] = useState<Device>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_KEY) : null;
    return saved === 'mobile' || saved === 'tablet' || saved === 'desktop' ? saved : 'desktop';
  });
  const [view, setView] = useState<string>('root'); // 'root' | 'colors' | 'header' | 'home' | 'home:<sectionId>' | ...
  // En celular no entran el panel y la vista previa juntos: se alterna con las
  // pestañas de abajo. El iframe no se desmonta al ocultarlo, así que los
  // cambios siguen llegando y la vista previa no se recarga.
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  // md+: esconder el panel para ver la vista previa más grande (en una tablet
  // le quedaban 450 px). Clickear algo en la vista previa lo vuelve a abrir.
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const dismissUndo = useCallback(() => setUndoNotice(null), []);
  const [publishing, setPublishing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // bump = remontar el iframe del preview
  const [showChanges, setShowChanges] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  // undefined = pidiéndolo (no montar el iframe todavía); null = falló (preview cae a publicado)
  const [previewToken, setPreviewToken] = useState<string | null | undefined>(undefined);

  const previewBase = store ? storefrontUrl(store.subdomain) : '';
  const previewOrigin = previewBase; // origin esperado del iframe (targetOrigin + validación de e.origin)

  const { iframeRef, postToPreview } = usePreviewBridge(previewOrigin, view, {
    onReady: () => {
      if (draft.theme) postToPreview(draft.theme);
    },
    onEdit: (target, sectionId) => {
      setPanelCollapsed(false);
      if (target === 'header' || target === 'announcement') setView('header');
      else if (target === 'footer') setView('footer');
      else if (target === 'section' && sectionId) setView(`${SECTION_VIEW}${sectionId}`);
    },
    onDeleteSection: (sectionId) => removeSectionWithUndo(sectionId),
  });
  const draft = useThemeDraft(store?.id ?? null, postToPreview);
  const { theme, published } = draft;

  // Borrar una sección (desde la lista o desde el tacho de la vista previa)
  // es inmediato, con "Deshacer" a mano. Deshacer la vuelve a poner en su
  // lugar aunque después se haya tocado otra cosa (no es un Ctrl+Z ciego).
  const removeSectionWithUndo = (sectionId: string) => {
    const index = theme?.sections.findIndex((s) => s.id === sectionId) ?? -1;
    const section = theme?.sections[index];
    if (!section) return;
    draft.updateTheme(removeSection(sectionId));
    setView((v) => (v === `${SECTION_VIEW}${sectionId}` ? 'home' : v));
    setUndoNotice((prev) => ({
      key: (prev?.key ?? 0) + 1,
      message: `Eliminaste «${sectionDisplayName(section)}».`,
      onUndo: () => {
        draft.updateTheme(insertSection(section, index));
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[${ROW_MAIN_ATTR}="${CSS.escape(section.id)}"]`)?.focus(),
        );
      },
    }));
  };

  // La sección abierta ya no existe (deshacer, restaurar, recargar): a la lista.
  if (
    theme &&
    view.startsWith(SECTION_VIEW) &&
    !theme.sections.some((s) => s.id === view.slice(SECTION_VIEW.length))
  )
    setView('home');

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

  // Otra tienda: el token del preview es de la anterior.
  const [tokenFor, setTokenFor] = useState<string | null>(null);
  if (store && tokenFor !== store.id) {
    setTokenFor(store.id);
    setPreviewToken(undefined);
  }

  // Lo que acompaña al borrador: token del preview, programación y un producto real.
  useEffect(() => {
    if (!store) return;
    let current = true;
    // Token firmado para que el iframe de preview pueda leer el draft. Si falla,
    // el preview cae al tema publicado (el postMessage pinta el draft igual).
    api
      .post<{ token: string }>('/api/v1/theme/preview-token', {})
      .then((r) => current && setPreviewToken(r.token))
      .catch(() => current && setPreviewToken(null));
    api
      .get<{ scheduledAtUtc: string | null }>('/api/v1/theme/schedule')
      .then((r) => current && setScheduledAt(r.scheduledAtUtc))
      .catch(() => current && setScheduledAt(null));
    // Un producto real para previsualizar el panel "Detalle de producto".
    api
      .get<{ items: { slug: string }[] }>('/api/v1/products?limit=1')
      .then((r) => current && setFirstSlug(r.items[0]?.slug ?? null))
      .catch(() => current && setFirstSlug(null));
    return () => {
      current = false;
    };
  }, [store]);

  // Hay opciones que decide el servidor cuando arma la página (con qué orden
  // trae los productos y cuántos por página): el postMessage repinta el tema,
  // no vuelve a pedir los datos. Sin esto, esos dos controles parecían rotos.
  // Se guarda el borrador primero: el preview lee el draft del backend.
  const serverRendered = theme ? `${theme.productList.pageSize}|${theme.productList.defaultSort}` : '';
  const lastServerRendered = useRef<string | null>(null);
  const { flushDraft, undo, redo } = draft;
  useEffect(() => {
    if (!serverRendered) return;
    if (lastServerRendered.current === null || lastServerRendered.current === serverRendered) {
      lastServerRendered.current = serverRendered;
      return;
    }
    lastServerRendered.current = serverRendered;
    const t = setTimeout(() => {
      void flushDraft().then(() => setReloadKey((k) => k + 1));
    }, 400);
    return () => clearTimeout(t);
  }, [serverRendered, flushDraft]);

  // Ctrl/Cmd+Z deshace, Ctrl/Cmd+Shift+Z (o Ctrl+Y) rehace. Dentro de un
  // input/textarea gana el undo nativo del campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      const k = e.key.toLowerCase();
      // Dentro de un campo gana el deshacer nativo, pero el buscador abre igual.
      if (inField && k !== 'k') return;
      if (k === 'k') {
        // Buscar una opción: con catorce paneles, recordar dónde vive cada cosa
        // es trabajo que no le toca al comercio.
        e.preventDefault();
        setSearchOpen(true);
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Si el servidor explicó por qué no guardó (p. ej. un título demasiado largo
  // en una sección), se dice una vez: "No se guardó" a secas no ayuda a arreglarlo.
  const { saveError } = draft;
  useEffect(() => {
    if (saveError) toast(saveError, { variant: 'error' });
  }, [saveError, toast]);

  const publish = async () => {
    setPublishing(true);
    try {
      await draft.publish();
      toast('Diseño publicado en tu tienda', { variant: 'success' });
    } catch (err) {
      // El conflicto lo explica el banner; cualquier otro error, el aviso.
      if (!(err instanceof ApiRequestError && err.status === 409))
        toast(errMsg(err, 'Error al publicar'), { variant: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (
      !(await confirm({
        title: 'Descartar cambios',
        message:
          '¿Descartar los cambios sin publicar y volver al diseño publicado? Lo podés deshacer con Ctrl+Z.',
        confirmLabel: 'Descartar',
        variant: 'danger',
      }))
    )
      return;
    try {
      await draft.discard();
      toast('Cambios descartados', { variant: 'success' });
    } catch {
      toast('No se pudo descartar', { variant: 'error' });
    }
  };

  const switchStore = (s: (typeof stores)[number]) => {
    void flushDraft(); // no perder un guardado pendiente de ESTA tienda
    selectStore(s);
  };

  const areas = changedAreas(theme, published);

  if (!store) return <NoStoreSelected />;
  if (draft.loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-fg-muted">No se pudo cargar el editor. Revisá tu conexión.</p>
        <Button className="mt-4" onClick={draft.retryLoad}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!theme) return <ScreenSkeleton label="Cargando editor…" />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-subtle">
      <EditorTopBar
        storeName={store.name}
        storeId={store.id}
        stores={stores}
        saveState={draft.saveState}
        saveError={draft.saveError}
        conflict={draft.conflict}
        dirty={dirty}
        publishing={publishing}
        scheduled={!!scheduledAt}
        device={device}
        previewBase={previewBase}
        canUndo={draft.canUndo}
        canRedo={draft.canRedo}
        onUndo={undo}
        onRedo={redo}
        panelCollapsed={panelCollapsed}
        onTogglePanel={() => setPanelCollapsed((c) => !c)}
        onClose={() => navigate('/canales/tienda-online/disenios')}
        onRetrySave={() => void flushDraft()}
        onSelectStore={switchStore}
        onDevice={(id) => {
          setDevice(id);
          localStorage.setItem(DEVICE_KEY, id);
        }}
        onSchedule={() => setScheduleOpen(true)}
        onShowChanges={() => setShowChanges(true)}
        onDiscard={discard}
        onPublish={publish}
      />
      {draft.conflict && <ConflictBanner onReload={draft.reloadLatest} onKeepMine={draft.saveMineAnyway} />}

      <div className="flex min-h-0 flex-1">
        {/* Panel izquierdo (en celular, la pestaña "Editar" a todo el ancho) */}
        <aside
          id={EDITOR_PANEL_ID}
          aria-label="Opciones del diseño"
          className={cn(
            // El lugar de la barra de scroll queda reservado: antes, al desplegar
            // algo largo aparecía la barra y el panel entero se angostaba.
            'w-full shrink-0 overflow-y-auto border-border bg-surface [scrollbar-gutter:stable] [scrollbar-width:thin] md:block md:w-80 md:border-r',
            mobileTab === 'preview' && 'hidden',
            panelCollapsed && 'md:hidden',
          )}
        >
          <EditorViews
            view={view}
            setView={setView}
            theme={theme}
            updateTheme={draft.updateTheme}
            storeName={store.name}
            onOpenGallery={() => navigate('/canales/tienda-online/disenios')}
            onLeave={navigate}
            onSearch={() => setSearchOpen(true)}
            onHistory={() => setHistoryOpen(true)}
            onCopyFromStore={stores.length > 1 ? () => setCopyOpen(true) : undefined}
            onRemoveSection={removeSectionWithUndo}
          />
        </aside>

        {/* Preview — UN solo iframe persistente; cambiar de device solo reestiliza
            el contenedor (no remonta el iframe), así no recarga ni parpadea. */}
        <PreviewFrame device={device} hidden={mobileTab === 'edit'}>
          {/* Esperar el token antes de montar el iframe: si no, carga sin ?pt y recarga al llegar. */}
          {previewToken !== undefined ? (
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={previewUrl}
              title="Preview"
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white text-sm text-fg-muted">
              Cargando vista previa…
            </div>
          )}
        </PreviewFrame>
      </div>

      <UndoSnackbar key={undoNotice?.key} notice={undoNotice} onDismiss={dismissUndo} />

      {/* Pestañas de celular: editar o mirar cómo queda. */}
      <nav
        aria-label="Editor"
        className="grid shrink-0 grid-cols-2 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {(
          [
            { id: 'edit', label: 'Editar', icon: SlidersHorizontal },
            { id: 'preview', label: 'Vista previa', icon: Eye },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileTab(id)}
            aria-pressed={mobileTab === id}
            className={cn(
              'flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
              mobileTab === id ? 'text-primary' : 'text-fg-muted',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {searchOpen && (
        <OptionSearch
          sections={theme.sections}
          onPick={(v) => {
            // Lo encontrado se tiene que ver: con el panel escondido o en la
            // pestaña de la vista previa (celular), se vuelve al panel.
            setView(v);
            setPanelCollapsed(false);
            setMobileTab('edit');
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Historial, copiar de otra tienda y programar: lo restaurado o copiado
          entra por applyIncoming, que lo suma al deshacer. */}
      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={draft.applyIncoming}
      />
      <CopyFromStoreModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        stores={stores}
        currentId={store.id}
        onCopied={draft.applyIncoming}
      />
      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        theme={theme}
        scheduledAtUtc={scheduledAt}
        onChanged={setScheduledAt}
      />

      <Modal
        open={showChanges}
        onClose={() => setShowChanges(false)}
        title={`Cambios sin publicar (${areas.length})`}
      >
        {areas.length === 0 ? (
          <p className="text-sm text-fg-muted">No hay cambios sin publicar.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-fg-muted">
              Estas partes de tu tienda cambiaron respecto de lo que ven tus clientes hoy.
            </p>
            <ul className="space-y-1.5">
              {areas.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm text-fg">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {a}
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </div>
  );
}

export default ThemeEditorPage;
