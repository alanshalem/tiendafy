/**
 * Caja de respaldo "sin imagen": muestra la inicial del nombre.
 * Cada consumidor pasa su `className` (tamaño/forma/opacidad) para que el
 * resultado sea idéntico al markup que reemplaza.
 */
export function InitialFallback({ name, className }: { name: string; className?: string }) {
  return <div className={className}>{name.charAt(0)}</div>;
}
