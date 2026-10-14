import { useCallback, useEffect, useRef } from 'react';
import { EDITOR_MSG, type ThemeConfig } from '@tiendafy/types';

/*
 * El diálogo con el iframe de la vista previa (postMessage): mandarle el tema,
 * abrir/cerrar el carrito, resaltar la sección del panel abierto, y escuchar
 * lo que el comercio hace adentro (clic en una región → abrir su panel, tacho
 * → borrar la sección). Solo con el origen del propio storefront: un sitio
 * que embeba el preview no puede ni mandar ni recibir nada.
 */

export interface PreviewCallbacks {
  /** El preview avisó que cargó: hay que mandarle el tema actual. */
  onReady: () => void;
  /** Clic en una región del preview. */
  onEdit: (target: string, sectionId?: string) => void;
  /** El tacho de una sección del preview. */
  onDeleteSection: (sectionId: string) => void;
}

export function usePreviewBridge(previewOrigin: string, view: string, callbacks: PreviewCallbacks) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const postTimer = useRef<number | null>(null);
  const pendingPost = useRef<ThemeConfig | null>(null);
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

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

  // La página de "en construcción" en lugar de la tienda, mientras su panel está abierto.
  const postComingSoon = useCallback(
    (show: boolean) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: EDITOR_MSG.previewComingSoon, show },
        previewOrigin || '*',
      );
    },
    [previewOrigin],
  );

  // El preview avisa cuando está listo → mandamos el tema actual (+ carrito y "en construcción").
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== previewOrigin) return; // solo mensajes del propio preview
      if (e.data?.type === EDITOR_MSG.previewReady) {
        cb.current.onReady();
        postCart(view === 'cart');
        if (view === 'coming-soon') postComingSoon(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [postCart, postComingSoon, view, previewOrigin]);

  // Al abrir el panel "Carrito", abrir el drawer en el preview (y cerrarlo al salir).
  useEffect(() => {
    postCart(view === 'cart');
  }, [view, postCart]);

  // "Tienda en construcción": sin esto, sus opciones no se veían en ningún lado.
  useEffect(() => {
    postComingSoon(view === 'coming-soon');
  }, [view, postComingSoon]);

  // Al abrir un panel, resaltar su parte en el preview (scroll + flash): encabezado,
  // pie, botón de WhatsApp y secciones del inicio.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    let msg: { type: string; target?: string; sectionId?: string } | null = null;
    if (view === 'header') msg = { type: EDITOR_MSG.focusSection, target: 'header' };
    else if (view === 'footer') msg = { type: EDITOR_MSG.focusSection, target: 'footer' };
    else if (view === 'whatsapp') msg = { type: EDITOR_MSG.focusSection, target: 'whatsapp' };
    else if (view.startsWith('home:'))
      msg = { type: EDITOR_MSG.focusSection, target: 'section', sectionId: view.slice(5) };
    if (msg) win.postMessage(msg, previewOrigin || '*');
  }, [view, previewOrigin]);

  // Clic en una región del preview (sección / encabezado / pie) y tacho de una sección.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== previewOrigin) return;
      if (e.data?.type === EDITOR_MSG.editSection) {
        const { target, sectionId } = e.data as { target: string; sectionId?: string };
        cb.current.onEdit(target, sectionId);
      } else if (e.data?.type === EDITOR_MSG.deleteSection && e.data.sectionId) {
        cb.current.onDeleteSection(e.data.sectionId as string);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [previewOrigin]);

  return { iframeRef, postToPreview };
}
