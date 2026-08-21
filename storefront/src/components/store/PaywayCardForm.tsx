'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import Script from 'next/script';

/**
 * El SDK de Payway se sirve desde su host productivo aunque se esté apuntando
 * al sandbox: la URL del ambiente se le pasa al constructor, no al script.
 */
const SDK_URL = 'https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js';

interface DecidirSdk {
  setPublishableKey: (key: string) => void;
  setTimeout: (ms: number) => void;
  createToken: (
    form: HTMLFormElement,
    callback: (status: number, response: DecidirTokenResponse) => void,
  ) => void;
}

interface DecidirTokenResponse {
  token?: string;
  id?: string;
  bin?: string;
  error?: { error?: { message?: string; type?: string } }[];
}

declare global {
  interface Window {
    Decidir?: new (baseUrl: string, disableFraudDetection?: boolean) => DecidirSdk;
  }
}

export interface PaywayPublicConfig {
  enabled: boolean;
  publicKey: string | null;
  baseUrl: string | null;
  siteId: string | null;
  installmentOptions: number[];
}

export interface PaywayCardToken {
  token: string;
  bin: string;
  lastFour: string;
  brand: string | null;
  isDebit: boolean;
  installments: number;
}

/**
 * Marca de la tarjeta por su BIN. El backend hace lo mismo por su cuenta; acá
 * sirve para mostrarle al comprador qué tarjeta detectamos antes de cobrar.
 */
function detectBrand(cardNumber: string): string | null {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 6) return null;

  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));

  if (digits[0] === '4') return 'visa';
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'mastercard';
  if (two === 34 || two === 37) return 'amex';
  if (two === 36 || two === 38 || two === 30) return 'diners';
  if (four === 5896) return 'cabal';
  if (four === 5895) return 'naranja';
  return null;
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners',
  cabal: 'Cabal',
  naranja: 'Naranja',
};

/** Agrupa de a 4 mientras se tipea, para poder leer el número. */
function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Formulario de tarjeta de Payway.
 *
 * El número de tarjeta y el código de seguridad NO pasan por Tiendafy: el SDK
 * de Payway los manda directo a su API y devuelve un token de un solo uso. Lo
 * que sale de acá hacia nuestro backend es ese token, los primeros seis
 * dígitos y los últimos cuatro — lo único que se puede guardar.
 */
export function PaywayCardForm({
  config,
  amountLabel,
  paying,
  onToken,
}: {
  config: PaywayPublicConfig;
  amountLabel: string;
  paying: boolean;
  onToken: (card: PaywayCardToken) => Promise<void> | void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const sdkRef = useRef<DecidirSdk | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenizing, setTokenizing] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [installments, setInstallments] = useState(config.installmentOptions[0] ?? 1);

  const brand = detectBrand(cardNumber);

  // onReady y no onLoad: si el comprador cambia de medio de pago y vuelve, el
  // script ya está cargado y onLoad no vuelve a dispararse.
  const initSdk = useCallback(() => {
    if (!window.Decidir || !config.publicKey || !config.baseUrl) return;

    const sdk = new window.Decidir(config.baseUrl);
    sdk.setPublishableKey(config.publicKey);
    // Tokenizar no mueve plata: si tarda, conviene fallar rápido y que el
    // comprador reintente, en vez de dejarlo esperando.
    sdk.setTimeout(8000);
    sdkRef.current = sdk;
    setReady(true);
  }, [config.publicKey, config.baseUrl]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const sdk = sdkRef.current;
    const form = formRef.current;
    if (!sdk || !form) return;

    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13) {
      setError('Revisá el número de tarjeta.');
      return;
    }

    setTokenizing(true);
    sdk.createToken(form, (status, response) => {
      if (status !== 200 && status !== 201) {
        const first = response.error?.[0]?.error;
        setError(first?.message ? traducir(first.type) : 'Revisá los datos de la tarjeta.');
        setTokenizing(false);
        return;
      }

      const token = response.token ?? response.id;
      if (!token) {
        setError('Payway no devolvió el token de la tarjeta.');
        setTokenizing(false);
        return;
      }

      // El BIN sale de lo que tipeó el comprador: el SDK devuelve solo el
      // token, y el cobro no se puede hacer sin los primeros seis dígitos.
      void Promise.resolve(
        onToken({
          token,
          bin: response.bin ?? digits.slice(0, 6),
          lastFour: digits.slice(-4),
          brand,
          isDebit: false,
          installments,
        }),
      ).finally(() => setTokenizing(false));
    });
  };

  if (!config.enabled) return null;

  const busy = paying || tokenizing;

  return (
    <>
      <Script
        src={SDK_URL}
        strategy="afterInteractive"
        onReady={initSdk}
        onError={() => setError('No se pudo cargar el formulario de pago. Recargá la página.')}
      />
      <form ref={formRef} onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="pw-card">
            Número de tarjeta
          </label>
          <div className="relative">
            <input
              id="pw-card"
              data-decidir="card_number"
              inputMode="numeric"
              autoComplete="cc-number"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="4507 9900 0000 4905"
              className="w-full rounded-md border px-3 py-2 pr-24 text-sm"
              required
            />
            {brand && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-500">
                {BRAND_LABEL[brand]}
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="pw-holder">
            Nombre como figura en la tarjeta
          </label>
          <input
            id="pw-holder"
            data-decidir="card_holder_name"
            autoComplete="cc-name"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm uppercase"
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="pw-month">
              Mes
            </label>
            <input
              id="pw-month"
              data-decidir="card_expiration_month"
              inputMode="numeric"
              maxLength={2}
              autoComplete="cc-exp-month"
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ''))}
              placeholder="12"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="pw-year">
              Año
            </label>
            <input
              id="pw-year"
              data-decidir="card_expiration_year"
              inputMode="numeric"
              maxLength={2}
              autoComplete="cc-exp-year"
              value={expYear}
              onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ''))}
              placeholder="30"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="pw-cvv">
              Código
            </label>
            <input
              id="pw-cvv"
              data-decidir="security_code"
              inputMode="numeric"
              maxLength={4}
              autoComplete="cc-csc"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
              placeholder="123"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="pw-doc">
              DNI del titular
            </label>
            <input
              id="pw-doc"
              data-decidir="card_holder_doc_number"
              inputMode="numeric"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="29123456"
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
            <input type="hidden" data-decidir="card_holder_doc_type" value="dni" readOnly />
          </div>

          {config.installmentOptions.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="pw-installments">
                Cuotas
              </label>
              <select
                id="pw-installments"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                {config.installmentOptions.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1 pago' : `${n} cuotas sin interés`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!ready || busy}
          className="w-full rounded-md bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Procesando…' : `Pagar ${amountLabel}`}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Los datos de tu tarjeta viajan directo a Payway. No los guardamos ni pasan por nuestros servidores.
        </p>
      </form>
    </>
  );
}

/** Errores de validación del SDK, en castellano. */
function traducir(type?: string): string {
  switch (type) {
    case 'invalid_card_number':
    case 'nan_card_number':
      return 'Revisá el número de tarjeta.';
    case 'invalid_expiry_date':
      return 'La fecha de vencimiento no es válida.';
    case 'empty_card_holder_name':
      return 'Escribí el nombre como figura en la tarjeta.';
    case 'empty_card_number':
      return 'Escribí el número de tarjeta.';
    default:
      return 'Revisá los datos de la tarjeta.';
  }
}
