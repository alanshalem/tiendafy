/**
 * Pausa (dos barras) mientras se mueve, play (triángulo) cuando está quieto.
 * Lo usan el carrusel, el video de portada, la tira de marcas y la barra de
 * anuncio. Aparte del carrusel: la barra de anuncio va en todas las páginas y
 * no tiene por qué arrastrar el carrusel entero por un ícono.
 */
export function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
    </svg>
  );
}
