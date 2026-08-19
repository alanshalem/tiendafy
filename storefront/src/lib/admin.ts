/**
 * Dónde vive el panel de administración. Un solo valor para las dos cosas que
 * lo necesitan: el link "Entrar al panel" de la portada y la validación de los
 * mensajes del editor de tienda (que exige comparar contra el origin exacto).
 *
 * Antes eran dos variables distintas para el mismo dato — y la del link ni
 * siquiera se seteaba en producción, así que el botón principal de la portada
 * mandaba al visitante a su propia máquina (localhost).
 */
export const ADMIN_ORIGIN = process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? 'http://localhost:5173';
