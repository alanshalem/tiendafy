import { useEffect } from 'react';

/**
 * Las tipografías elegibles de la tienda, para que el selector las muestre con
 * su letra real. Antes iban en el index.html y frenaban el primer pintado de
 * TODO el panel (12 familias, 65 KB de CSS) aunque solo se usan acá.
 */
export const EDITOR_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&family=Manrope:wght@400;600;700&family=Work+Sans:wght@400;600;700&family=Space+Grotesk:wght@400;500;700&family=Playfair+Display:wght@400;600;700;800&family=Lora:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Serif+Display&family=Bebas+Neue&family=Archivo+Black&display=swap';

const LINK_ID = 'tf-editor-fonts';

/** Agrega la hoja de Google Fonts una sola vez, cuando se abre el selector. */
export function useEditorFonts() {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = EDITOR_FONTS_HREF;
    document.head.appendChild(link);
    // Se queda puesta al cerrar el panel: volver a abrirlo no baja nada de nuevo.
  }, []);
}
