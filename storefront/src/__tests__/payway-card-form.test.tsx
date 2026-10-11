/**
 * El formulario de tarjeta de Payway. El SDK (decidir.js) se reemplaza por uno
 * falso con la misma interfaz: acá se prueba qué hace el formulario con lo que
 * el SDK contesta — el token, el BIN, los últimos cuatro, la marca, las
 * cuotas — y cómo explica cada error. Que la tarjeta no pase por Tiendafy lo
 * garantiza el SDK; que solo salgan token + BIN + últimos cuatro, este test.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  PaywayCardForm,
  type PaywayCardToken,
  type PaywayPublicConfig,
} from '../components/store/PaywayCardForm';

const script = vi.hoisted(() => ({ fails: false }));

// El <Script> de Next avisa onReady cuando el SDK está cargado (u onError).
vi.mock('next/script', () => ({
  default: function Script({ onReady, onError }: { onReady?: () => void; onError?: () => void }) {
    useEffect(() => (script.fails ? onError?.() : onReady?.()), [onReady, onError]);
    return createElement('span', { 'data-testid': 'payway-sdk' });
  },
}));

type Reply = { status: number; response: Record<string, unknown> };
const sdk = { reply: { status: 200, response: { token: 'tok-1' } } as Reply, key: '', timeout: 0, url: '' };

class FakeDecidir {
  constructor(url: string) {
    sdk.url = url;
  }
  setPublishableKey(key: string) {
    sdk.key = key;
  }
  setTimeout(ms: number) {
    sdk.timeout = ms;
  }
  createToken(_form: HTMLFormElement, cb: (status: number, r: Record<string, unknown>) => void) {
    cb(sdk.reply.status, sdk.reply.response);
  }
}

const CONFIG: PaywayPublicConfig = {
  enabled: true,
  publicKey: 'pk-test',
  baseUrl: 'https://developers.decidir.com/api/v2',
  siteId: '1',
  installmentOptions: [1, 3, 6],
};

let onToken: Mock<(card: PaywayCardToken) => void>;

function show(config: Partial<PaywayPublicConfig> = {}, paying = false) {
  onToken = vi.fn();
  const user = userEvent.setup({ delay: null });
  const view = render(
    <PaywayCardForm
      config={{ ...CONFIG, ...config }}
      amountLabel="$ 3.000"
      paying={paying}
      onToken={onToken}
    />,
  );
  return { user, ...view };
}

async function fillCard(user: ReturnType<typeof userEvent.setup>, number: string) {
  await user.type(screen.getByLabelText('Número de tarjeta'), number);
  await user.type(screen.getByLabelText('Nombre como figura en la tarjeta'), 'ANA GARCIA');
  await user.type(screen.getByLabelText('Mes'), '12');
  await user.type(screen.getByLabelText('Año'), '30');
  await user.type(screen.getByLabelText('Código'), '123');
  await user.type(screen.getByLabelText('DNI del titular'), '29.123.456');
}

const pay = () => screen.getByRole('button', { name: /Pagar|Procesando/ });

beforeEach(() => {
  script.fails = false;
  sdk.reply = { status: 200, response: { token: 'tok-1' } };
  window.Decidir = FakeDecidir as unknown as typeof window.Decidir;
});
afterEach(() => {
  delete window.Decidir;
});

describe('formulario de tarjeta de Payway', () => {
  it('apagado no muestra nada', () => {
    const { container } = show({ enabled: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('inicializa el SDK con la clave pública y el ambiente', () => {
    show();
    expect(sdk).toMatchObject({ key: 'pk-test', url: CONFIG.baseUrl, timeout: 8000 });
    expect(pay()).toBeEnabled();
  });

  it('sin SDK o sin clave no habilita el pago', () => {
    delete window.Decidir;
    show();
    expect(pay()).toBeDisabled();
  });

  it('si el SDK no carga, lo dice', () => {
    script.fails = true;
    show();
    expect(screen.getByText(/No se pudo cargar el formulario de pago/)).toBeInTheDocument();
  });

  it.each([
    ['4507 9900 0000 4905', 'Visa'],
    ['5299 9100 1000 0015', 'Mastercard'],
    ['2221 0000 0000 0009', 'Mastercard'],
    ['3711 803032 57522', 'American Express'],
    ['3600 0000 0000 08', 'Diners'],
    ['5896 5700 0000 0008', 'Cabal'],
    ['5895 6200 0000 0005', 'Naranja'],
  ])('reconoce la marca de %s', async (number, brand) => {
    const { user } = show();
    await user.type(screen.getByLabelText('Número de tarjeta'), number);
    expect(screen.getByText(brand)).toBeInTheDocument();
  });

  it('agrupa el número de a 4 y solo acepta dígitos en los demás campos', async () => {
    const { user } = show();
    await user.type(screen.getByLabelText('Número de tarjeta'), '4507990000004905');
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4507 9900 0000 4905');
    await user.type(screen.getByLabelText('Mes'), 'a1');
    expect(screen.getByLabelText('Mes')).toHaveValue('1');
    await user.type(screen.getByLabelText('DNI del titular'), '29.1');
    expect(screen.getByLabelText('DNI del titular')).toHaveValue('291');
  });

  it('entrega el token con BIN, últimos cuatro, marca y cuotas — nunca el número', async () => {
    const { user } = show();
    await fillCard(user, '4507 9900 0000 4905');
    await user.selectOptions(screen.getByLabelText('Cuotas'), '6');
    expect(screen.getByRole('option', { name: '6 cuotas sin interés' })).toBeInTheDocument();
    await user.click(pay());
    expect(onToken).toHaveBeenCalledWith({
      token: 'tok-1',
      bin: '450799',
      lastFour: '4905',
      brand: 'visa',
      isDebit: false,
      installments: 6,
    });
  });

  it('usa el BIN y el id que devuelve el SDK cuando vienen', async () => {
    sdk.reply = { status: 201, response: { id: 'tok-id', bin: '450700' } };
    const { user } = show({ installmentOptions: [1] });
    expect(screen.queryByLabelText('Cuotas')).not.toBeInTheDocument();
    await fillCard(user, '4507 9900 0000 4905');
    await user.click(pay());
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok-id', bin: '450700', installments: 1 }),
    );
  });

  it('un número corto no llega al SDK', async () => {
    const { user } = show();
    await fillCard(user, '4507 99');
    await user.click(pay());
    expect(screen.getByText('Revisá el número de tarjeta.')).toBeInTheDocument();
    expect(onToken).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_card_number', 'Revisá el número de tarjeta.'],
    ['nan_card_number', 'Revisá el número de tarjeta.'],
    ['invalid_expiry_date', 'La fecha de vencimiento no es válida.'],
    ['empty_card_holder_name', 'Escribí el nombre como figura en la tarjeta.'],
    ['empty_card_number', 'Escribí el número de tarjeta.'],
    ['otro', 'Revisá los datos de la tarjeta.'],
  ])('traduce el error %s del SDK', async (type, message) => {
    sdk.reply = { status: 400, response: { error: [{ error: { message: 'x', type } }] } };
    const { user } = show();
    await fillCard(user, '4507 9900 0000 4905');
    await user.click(pay());
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('un error sin detalle o un OK sin token también se explican', async () => {
    sdk.reply = { status: 500, response: {} };
    const { user } = show();
    await fillCard(user, '4507 9900 0000 4905');
    await user.click(pay());
    expect(screen.getByText('Revisá los datos de la tarjeta.')).toBeInTheDocument();

    sdk.reply = { status: 200, response: {} };
    await user.click(pay());
    expect(screen.getByText('Payway no devolvió el token de la tarjeta.')).toBeInTheDocument();
  });

  it('mientras se cobra, el botón queda deshabilitado', () => {
    show({}, true);
    expect(pay()).toBeDisabled();
    expect(pay()).toHaveTextContent('Procesando…');
  });
});
