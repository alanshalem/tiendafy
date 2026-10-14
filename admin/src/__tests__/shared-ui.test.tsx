/**
 * Los componentes compartidos (@tiendafy/ui) en lo que las pantallas no
 * ejercitan solas: el captcha de Cloudflare cuando está configurado, el
 * tooltip con su demora y sus tres lados, la miga de pan, el prompt
 * (aceptar, cancelar, Enter), la tabla vacía y con filas clickeables, y el
 * menú desplegable cerca del borde de la pantalla.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Breadcrumbs, Captcha, Dropdown, PromptProvider, Table, Tooltip, usePrompt } from '@tiendafy/ui';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';

afterEach(() => {
  document.getElementById('cf-turnstile-script')?.remove();
  delete (window as { turnstile?: unknown }).turnstile;
  vi.useRealTimers();
});

describe('Captcha (Cloudflare Turnstile)', () => {
  it('sin captcha configurado entrega un token vacío y no dibuja nada', async () => {
    mockApi().on('GET', '/api/v1/captcha/config', { enabled: false });
    const onToken = vi.fn();
    const { container } = render(<Captcha apiUrl="" onToken={onToken} />);
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(''));
    expect(container).toBeEmptyDOMElement();
  });

  it('configurado: carga el script una vez y entrega el token del desafío', async () => {
    mockApi().on('GET', '/api/v1/captcha/config', { enabled: true, siteKey: 'site-1' });
    const renderWidget = vi.fn(
      (_el: HTMLElement, opts: { callback: (t: string) => void; 'error-callback': () => void }) => {
        opts.callback('tok-cf');
        opts['error-callback']();
      },
    );
    const onToken = vi.fn();
    render(<Captcha apiUrl="" onToken={onToken} />);
    const script = await waitFor(() => {
      const s = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
      if (!s) throw new Error('sin script');
      return s;
    });
    expect(script.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js');

    (window as { turnstile?: unknown }).turnstile = { render: renderWidget };
    act(() => script.onload?.(new Event('load')));
    expect(renderWidget).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: 'site-1' }),
    );
    expect(onToken).toHaveBeenNthCalledWith(1, 'tok-cf');
    expect(onToken).toHaveBeenNthCalledWith(2, ''); // si el desafío falla, el form se habilita igual

    // Otro captcha en la misma página reutiliza el script ya cargado.
    render(<Captcha apiUrl="" onToken={vi.fn()} />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(2));
  });

  it('si la configuración no llega, no traba el formulario', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const onToken = vi.fn();
    render(<Captcha apiUrl="" onToken={onToken} />);
    await waitFor(() => expect(onToken).toHaveBeenCalledWith(''));
  });
});

describe('Tooltip', () => {
  it.each(['right', 'top', 'bottom'] as const)(
    'aparece del lado %s tras la demora y se va al salir',
    async (side) => {
      vi.useFakeTimers();
      render(
        <Tooltip label="Ayuda" side={side} delayMs={300}>
          <button>?</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', { name: '?' });
      fireEvent.mouseEnter(trigger.parentElement!);
      expect(screen.queryByText('Ayuda')).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(350));
      expect(screen.getByText('Ayuda')).toBeInTheDocument();
      fireEvent.mouseLeave(trigger.parentElement!);
      expect(screen.queryByText('Ayuda')).not.toBeInTheDocument();
    },
  );

  it('sin texto no envuelve nada', () => {
    render(
      <Tooltip label="">
        <span>solo</span>
      </Tooltip>,
    );
    expect(screen.getByText('solo').parentElement).toBe(document.body.firstChild);
  });
});

describe('Breadcrumbs', () => {
  it('links para los niveles y el actual sin link', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Productos', href: '/productos' },
          { label: 'Remera' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.querySelectorAll('a')).toHaveLength(2);
    expect(screen.getByText('Remera').closest('a')).toBeNull();
    expect(screen.getByText('Remera')).toHaveAttribute('aria-current', 'page');
  });
});

describe('Prompt', () => {
  function Asker({ onAnswer }: { onAnswer: (v: string | null) => void }) {
    const prompt = usePrompt();
    return (
      <button
        onClick={async () =>
          onAnswer(
            await prompt({
              title: 'Seguimiento',
              message: 'Número de envío',
              defaultValue: 'TRK',
              confirmLabel: 'Guardar',
              cancelLabel: 'Volver',
            }),
          )
        }
      >
        preguntar
      </button>
    );
  }

  it('aceptar, cancelar y Enter', async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptProvider>
        <Asker onAnswer={onAnswer} />
      </PromptProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'preguntar' }));
    await user.type(screen.getByRole('textbox'), '-1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith('TRK-1'));

    await user.click(screen.getByRole('button', { name: 'preguntar' }));
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith(null));

    await user.click(screen.getByRole('button', { name: 'preguntar' }));
    await user.type(screen.getByRole('textbox'), '{Enter}');
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith('TRK'));
  });
});

describe('Table', () => {
  const columns = [{ key: 'name', header: 'Nombre', cell: (r: { name: string }) => r.name }];

  it('vacía muestra su estado; con filas, cada una se puede tocar', async () => {
    const { rerender } = render(
      <Table columns={columns} rows={[]} rowKey={(r) => r.name} emptyState="Nada todavía" />,
    );
    expect(screen.getByText('Nada todavía')).toBeInTheDocument();

    const onRowClick = vi.fn();
    rerender(
      <Table columns={columns} rows={[{ name: 'Ana' }]} rowKey={(r) => r.name} onRowClick={onRowClick} />,
    );
    await userEvent.click(screen.getByText('Ana'));
    expect(onRowClick).toHaveBeenCalledWith({ name: 'Ana' });
  });

  it('una fila que se abre se alcanza con Tab y se abre con Enter o Espacio', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const withButton = [
      ...columns,
      { key: 'x', header: '', cell: () => <button type="button">Borrar</button> },
    ];
    render(
      <Table columns={withButton} rows={[{ name: 'Ana' }]} rowKey={(r) => r.name} onRowClick={onRowClick} />,
    );
    await user.tab();
    const row = screen.getByText('Ana').closest('tr')!;
    expect(row).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onRowClick).toHaveBeenCalledTimes(2);

    // Un control propio de la fila hace lo suyo: no abre la fila.
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});

describe('Dropdown', () => {
  function Menu() {
    const [picked, setPicked] = useState('');
    return (
      <>
        <Dropdown>
          <Dropdown.Trigger label="Acciones">⋮</Dropdown.Trigger>
          <Dropdown.Menu align="end">
            <Dropdown.Item onSelect={() => setPicked('editar')}>Editar</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
        <p>{picked}</p>
      </>
    );
  }

  it('cerca del borde inferior se abre hacia arriba; Escape y clic afuera lo cierran', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(5000);
    render(<Menu />);
    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(screen.getByText('editar')).toBeInTheDocument();
  });
});
