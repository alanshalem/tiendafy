/**
 * Cuántos workers usa vitest en una máquina de desarrollo.
 *
 * El default de vitest es uno por núcleo menos uno: 19 en una máquina de 20
 * hilos. Cada worker carga el panel o la tienda enteros en jsdom (medido el
 * 15-oct: hasta 0,9 GB el del panel, 0,5 GB el de la tienda), así que 19 se
 * comían la RAM que dejan libre el editor, el navegador y los dev servers, y
 * los tests empezaban a fallar por tiempo o la máquina mataba la corrida.
 *
 * Tope: 30 % de los núcleos y no más de uno cada 1,5 GB libres al arrancar.
 * En CI (4 núcleos) queda el default de vitest. `VITEST_MAX_WORKERS` lo pisa
 * (un número o un porcentaje: "4", "50%"), y `--maxWorkers` también.
 */
import os from 'node:os';

export function localMaxWorkers(): number | string | undefined {
  const forced = process.env.VITEST_MAX_WORKERS?.trim();
  if (forced) return /%$/.test(forced) ? forced : Number(forced);
  if (process.env.CI) return undefined;
  const byCpu = Math.round(os.availableParallelism() * 0.3);
  const byMemory = Math.floor(os.freemem() / 2 ** 30 / 1.5);
  return Math.max(2, Math.min(byCpu, byMemory));
}
