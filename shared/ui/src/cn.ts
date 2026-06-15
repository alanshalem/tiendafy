import { clsx, type ClassValue } from 'clsx';

/** Combina clases condicionales. Alias fino sobre clsx. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
