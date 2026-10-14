/**
 * Textos de email marketing que comparten el listado de campañas y su editor.
 *
 * Viven aparte del editor (CampaignModal) a propósito: el listado importaba
 * esta tabla desde el editor y, con ella, arrastraba el editor de texto
 * enriquecido (Tiptap, ~400 KB) aunque nadie abriera una campaña. Desde acá,
 * el editor se baja recién cuando se abre. Una sola copia: el editor también
 * la importa, así las dos pantallas nombran igual a cada audiencia.
 */
export const AUDIENCE_LABEL: Record<string, string> = {
  buyers: 'Compradores',
  customers: 'Todos los contactos',
  subscribers: 'Suscriptores a novedades',
  custom: 'Selección manual',
};
