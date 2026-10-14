/**
 * Textos de email marketing que usa el listado de campañas.
 *
 * Viven aparte del editor (CampaignModal) a propósito: el listado importaba
 * esta tabla desde el editor y, con ella, arrastraba el editor de texto
 * enriquecido (Tiptap, ~400 KB) aunque nadie abriera una campaña. Desde acá,
 * el editor se baja recién cuando se abre.
 */
export const AUDIENCE_LABEL: Record<string, string> = {
  buyers: 'Compradores',
  customers: 'Todos los contactos',
  subscribers: 'Suscriptores a novedades',
  custom: 'Selección manual',
};
