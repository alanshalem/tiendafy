import type { QueryClient } from '@tanstack/react-query';
import { formatNumber } from './format';
import { qk } from './queryKeys';

/** Un proveedor de modelos, tal como lo manda `GET /ai/config`. */
export interface AiProviderInfo {
  provider: string;
  configured: boolean;
  last4: string | null;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
}

export interface AiAssignment {
  task: string;
  primaryModel: string;
  fallbackModel: string | null;
}

export interface AiSettings {
  enabled: boolean;
  monthlyBudgetUsd: number;
  alertThresholdPct: number;
}

export interface AiTaskOptions {
  task: string;
  label: string;
  eligibleModels: string[];
  suggestedModels: string[];
  warning: string | null;
}

export interface AiConfig {
  providers: AiProviderInfo[];
  assignments: AiAssignment[];
  settings: AiSettings;
  tasks: AiTaskOptions[];
}

export type AiUsageScope = 'store' | 'owned';

export interface AiUsage {
  month: string;
  scope: AiUsageScope;
  /** Micro-dólares: 1 US$ = 1.000.000. Cero = sin tope cargado. */
  budgetMicroUsd: number;
  spentMicroUsd: number;
  byDay: { day: string; microUsd: number }[];
  byTask: { key: string; microUsd: number }[];
  byModel: { key: string; microUsd: number }[];
  byUser: { userId: string | null; name: string; microUsd: number }[];
  stores: { tenantId: string; name: string; spentMicroUsd: number; budgetMicroUsd: number }[] | null;
}

/** Cómo se nombra cada proveedor ante el comercio. */
export const PROVIDER_LABEL: Record<string, string> = {
  Anthropic: 'Anthropic (Claude)',
  OpenAI: 'OpenAI (ChatGPT)',
  Google: 'Google (Gemini)',
  Groq: 'Groq',
};

/** Tope que sugerimos al empezar. */
export const SUGGESTED_BUDGET_USD = 20;

const MICRO_PER_USD = 1_000_000;

/**
 * Micro-dólares → "US$ 1.234,50". Dos decimales; un gasto positivo menor al centavo
 * muestra cuatro para no aparecer como "US$ 0,00".
 */
export function formatUsd(microUsd: number): string {
  const usd = microUsd / MICRO_PER_USD;
  const tiny = microUsd > 0 && usd < 0.01;
  const digits = tiny ? 4 : 2;
  return `US$ ${formatNumber(usd, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Dólares tal como los escribe una persona ("12,5" o "12.5") → número; null si no es un importe. */
export function parseUsd(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Number(clean);
}

/** Dólares → texto para un campo ("12,5"; el entero sin decimales). */
export function usdToInput(usd: number): string {
  return usd === 0 ? '' : String(usd).replace('.', ',');
}

/**
 * Cualquier cambio de la configuración de IA (clave, modelos, tope, copia) mueve lo que muestran
 * los botones de IA de las demás pantallas (`/ai/status`), el consumo y el aviso del Inicio.
 */
export async function invalidateAi(qc: QueryClient, storeId: string | undefined): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.aiConfig(storeId) }),
    qc.invalidateQueries({ queryKey: qk.aiStatus(storeId) }),
    qc.invalidateQueries({ queryKey: ['home-todo', storeId] }),
  ]);
}
