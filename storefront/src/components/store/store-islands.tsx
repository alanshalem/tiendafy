'use client';

import dynamic from 'next/dynamic';

/*
 * Las islas de cliente del marco de la tienda, cargadas aparte. Next baja de
 * entrada el JS de todo componente de cliente que una ruta importa, se dibuje
 * o no: con StoreChrome importado directo, la página de "en construcción"
 * (que vive en la misma ruta que la portada) cargaba el encabezado, el
 * carrito y las secciones sin mostrar nada de eso. Así cada página baja solo
 * lo que de verdad dibuja: el servidor pide estos pedazos por adelantado
 * (preload) cuando los usa.
 */
export const StoreChrome = dynamic(() => import('./StoreChrome').then((m) => m.StoreChrome));

/** La tienda entera del lado del cliente: solo en la vista previa del editor. */
export const LiveStorefront = dynamic(() => import('./LiveStorefront').then((m) => m.LiveStorefront));

/**
 * El 404 adentro de la tienda (buscador, lo más vendido, lo visto). Next
 * incluye el not-found del layout en TODAS las rutas: importado directo, cada
 * página cargaba el buscador y las recomendaciones del 404 sin mostrarlo.
 */
export const StoreNotFound = dynamic(() => import('./StoreNotFound').then((m) => m.StoreNotFound));
