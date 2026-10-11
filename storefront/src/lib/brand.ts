/**
 * Marca de la PLATAFORMA, no de las tiendas.
 *
 * El producto es Tiendafy; una instalación puede llevar la marca de quien la
 * opera ("Puente Oriente"). Acá se usa solo en la landing de la plataforma y
 * en los títulos por defecto: la tienda de cada comercio muestra siempre su
 * propia marca, nunca esta.
 *
 * Sin el prefijo NEXT_PUBLIC_ a propósito: esas las hornea Next al compilar y
 * la imagen quedaría atada a una marca (ver src/lib/runtime.ts).
 */
export const PLATFORM_BRAND = process.env.PLATFORM_BRAND_NAME?.trim() || 'Tiendafy';
