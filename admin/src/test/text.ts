/** Un texto literal como RegExp (los nombres reales traen paréntesis, puntos…). */
export const rx = (text: string, anchored = false) =>
  new RegExp(`${anchored ? '^' : ''}${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
