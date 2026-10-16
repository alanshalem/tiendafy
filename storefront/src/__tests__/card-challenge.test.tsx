/**
 * El desafío del banco (3DS) dentro de la tienda: el Status Screen Brick lo
 * muestra y la tienda sale de ahí cuando termina. Se sale por el aviso del
 * iframe (`{ status: 'COMPLETE' }`, que no dice cómo salió) o, si ese aviso
 * no llega, porque el webhook ya resolvió la orden. Una sola vez.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardChallenge, type CardChallengeData } from '@/components/store/CardChallenge';
import { fixtureTenantId, mockApi, type MockApi } from '../test/api';

const brick = vi.hoisted(() => ({ mounts: vi.fn(), fail: false }));

vi.mock('@mercadopago/sdk-react', async () => {
  const { useEffect } = await import('react');
  return {
    StatusScreen: ({
      initialization,
      onError,
    }: {
      initialization: unknown;
      onError: (e: unknown) => void;
    }) => {
      // Cuenta montajes reales (como el SDK, que vuelve a montar el Brick si
      // cambian estas props): volver a montarlo repostearía el creq.
      useEffect(() => {
        brick.mounts(initialization);
        if (brick.fail) onError({ type: 'critical', cause: 'fields_setup_failed', message: 'x' });
      }, [initialization, onError]);
      return createElement('div', null, 'Verificación del banco');
    },
  };
});

const ORDER = '11111111-2222-3333-4444-555555555555';
const STATUS = `/api/v1/orders/${ORDER}/status`;
const CHALLENGE: CardChallengeData = {
  orderId: ORDER,
  paymentId: '52044997115',
  externalResourceUrl: 'https://acs-public.tp.mastercard.com/api/v1/browser_Challenges',
  creq: 'eyJjcmVxIjoxfQ',
};

let api: MockApi;
beforeEach(() => {
  api = mockApi();
  brick.mounts.mockClear();
  brick.fail = false;
});
afterEach(() => vi.restoreAllMocks());

const show = (onDone = vi.fn(), pollMs = 60_000) => {
  const view = render(
    <CardChallenge tenantId={fixtureTenantId} challenge={CHALLENGE} onDone={onDone} pollMs={pollMs} />,
  );
  return { onDone, ...view };
};

const complete = () =>
  act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: { status: 'COMPLETE' } }));
  });

describe('desafío del banco (3DS)', () => {
  it('monta el Status Screen Brick con el pago y lo que mandó el banco, una sola vez', async () => {
    const { rerender, onDone } = show();
    expect(screen.getByRole('heading', { name: 'Confirmá el pago con tu banco' })).toBeInTheDocument();
    expect(brick.mounts).toHaveBeenCalledWith({
      paymentId: CHALLENGE.paymentId,
      additionalInfo: { externalResourceURL: CHALLENGE.externalResourceUrl, creq: CHALLENGE.creq },
    });
    // Un render más del padre (con otro onDone) no vuelve a montar el Brick.
    rerender(
      <CardChallenge
        tenantId={fixtureTenantId}
        challenge={{ ...CHALLENGE }}
        onDone={vi.fn()}
        pollMs={60_000}
      />,
    );
    expect(brick.mounts).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('cuando el iframe avisa que terminó, va a la pantalla de resultado (que consulta el estado real)', async () => {
    const { onDone } = show();
    // Un mensaje cualquiera de otro iframe no cuenta.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: 'hola' }));
      window.dispatchEvent(new MessageEvent('message', { data: { status: 'OTRA_COSA' } }));
    });
    expect(onDone).not.toHaveBeenCalled();
    await complete();
    await complete();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('pending');
  });

  it.each([
    ['PAID', 'success'],
    ['FAILED', 'failure'],
    ['CANCELLED', 'failure'],
  ])('si la orden ya quedó %s, va directo a ese resultado', async (status, outcome) => {
    api.on('GET', STATUS, { status });
    const { onDone } = show(vi.fn(), 10);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(outcome));
    await complete(); // el aviso que llega después no vuelve a salir
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('mientras la orden sigue pendiente (o la consulta falla), se queda en el desafío', async () => {
    let calls = 0;
    api.on('GET', STATUS, () => {
      calls += 1;
      if (calls === 1) throw new Error('corte de red');
      return { status: 'PENDINGPAYMENT' };
    });
    const { onDone } = show(vi.fn(), 10);
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(3));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('si el Brick no carga, lo dice sin jerga y deja ver cómo sigue la compra', async () => {
    brick.fail = true;
    const { onDone } = show();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos mostrar la verificación de tu banco',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ver el estado de mi compra' }));
    expect(onDone).toHaveBeenCalledWith('pending');
  });
});
