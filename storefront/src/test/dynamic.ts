/**
 * Los módulos de next/dynamic que se están cargando (ver el mock en setup.ts).
 * Un test que importa una página adentro del test (no arriba del archivo)
 * declara componentes dinámicos nuevos: antes de dibujarla se espera a que
 * lleguen, como hace el servidor con su preload.
 */
export const pendingDynamic: Promise<unknown>[] = [];

export async function flushDynamic(): Promise<void> {
  // Lo que se declara mientras cargan otros módulos también entra.
  for (let done = 0; done < pendingDynamic.length;) {
    const batch = pendingDynamic.slice(done);
    done = pendingDynamic.length;
    await Promise.all(batch);
  }
}
