/**
 * "Chrome" compartido de los controles de formulario (Input, Select, Textarea):
 * foco, estado deshabilitado y borde según error. Estaba copiado en los tres —
 * y con tres copias, tocar el anillo de foco de uno los desincroniza.
 * Lo específico de cada control (alto, padding, la flecha del select) se queda
 * en su archivo: acá solo vive lo que los tres comparten palabra por palabra.
 */
export const fieldChrome = (error: boolean): string[] => [
  'focus:outline-none focus:ring-2 focus:ring-offset-1',
  'disabled:cursor-not-allowed disabled:bg-bg-muted disabled:opacity-70',
  error ? 'border-danger focus:ring-danger' : 'border-border-strong focus:border-primary focus:ring-primary',
];
