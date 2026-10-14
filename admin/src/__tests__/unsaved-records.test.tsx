/**
 * useUnsavedChanges sobre un registro abierto por la URL (`?ficha=<id>`): para
 * el router cerrar la ficha no cambia de pantalla, pero para la persona es
 * salir de lo que estaba editando. Con `param`, sacar o cambiar ese parámetro
 * (botón de volver, «Atrás») pregunta; los demás parámetros, no. Sin `param`,
 * todo sigue como antes: solo frena los cambios de pantalla.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderWithProviders } from '../test/render';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';

function Harness({ param }: { param?: string }) {
  useUnsavedChanges(true, param ? { param } : {});
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const patch = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  return (
    <>
      <p>ficha: {params.get('ficha') ?? 'ninguna'}</p>
      <p>filtro: {params.get('q') ?? 'ninguno'}</p>
      <button onClick={() => patch('ficha', '1')}>Abrir</button>
      <button onClick={() => patch('ficha', null)}>Cerrar ficha</button>
      <button onClick={() => patch('ficha', '2')}>Otra ficha</button>
      <button onClick={() => patch('q', 'x')}>Filtrar</button>
      <button onClick={() => navigate(-1)}>Atrás</button>
    </>
  );
}

async function setup(param?: string) {
  mockApi();
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderWithProviders(<Harness param={param} />, '/compras');
  await user.click(await screen.findByRole('button', { name: 'Abrir' }));
  expect(screen.getByText('ficha: 1')).toBeInTheDocument();
  return user;
}

describe('cambios sin guardar en un registro abierto por la URL', () => {
  it('cerrar la ficha pregunta; seguir editando la deja abierta', async () => {
    const user = await setup('ficha');
    await user.click(screen.getByRole('button', { name: 'Cerrar ficha' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByText('ficha: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar ficha' }));
    await user.click(await screen.findByRole('button', { name: 'Salir sin guardar' }));
    expect(await screen.findByText('ficha: ninguna')).toBeInTheDocument();
  });

  it('«Atrás» y abrir otra ficha también preguntan', async () => {
    const user = await setup('ficha');
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByText('ficha: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Otra ficha' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }));
    expect(await screen.findByText('ficha: 2')).toBeInTheDocument();
  });

  it('los otros parámetros de la pantalla no preguntan', async () => {
    const user = await setup('ficha');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByText('filtro: x')).toBeInTheDocument();
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });

  it('sin `param`, como siempre: la query de la misma pantalla no pregunta', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Cerrar ficha' }));
    expect(await screen.findByText('ficha: ninguna')).toBeInTheDocument();
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });
});
