/**
 * Descarga un Blob como archivo. Única implementación (antes había 4 copias,
 * dos sin appendChild — que en Firefox no disparan el click).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
