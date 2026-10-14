/**
 * El período de estadísticas es uno solo para todas las pantallas: el último
 * elegido se recuerda en la pestaña y se usa (y se escribe en la URL, sin
 * sumar historial) cuando se entra a otra pantalla desde el menú, cuyos links
 * no llevan la query. Lo que trae la URL siempre manda.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStatsRange } from '../components/stats/useStatsRange';
import { defaultStatsRange } from '../components/stats/StatsToolbar';

function StatsPage() {
  const { range, setRange } = useStatsRange();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="where">{location.pathname + location.search}</p>
      <p data-testid="range">{`${range.preset}|${range.from}|${range.to}`}</p>
      <button onClick={() => setRange(defaultStatsRange('Últimos 7 días'))}>7 días</button>
      <button onClick={() => setRange({ preset: 'Personalizado', from: '2026-01-01', to: '2026-01-31' })}>
        enero
      </button>
      <Link to="/visitas">Visitas</Link>
      <Link to="/cupones">Cupones</Link>
      <button onClick={() => navigate(-1)}>Atrás</button>
    </div>
  );
}

function mount(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/visitas" element={<StatsPage />} />
        <Route path="/cupones" element={<StatsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup({ delay: null });
}

const where = () => screen.getByTestId('where').textContent!;
const preset = () => screen.getByTestId('range').textContent!.split('|')[0];

afterEach(() => vi.restoreAllMocks());

describe('useStatsRange', () => {
  it('sin nada elegido, todas las pantallas arrancan en los últimos 30 días', () => {
    mount('/visitas');
    expect(preset()).toBe('Últimos 30 días');
    expect(where()).toBe('/visitas');
  });

  it('el período elegido sigue al pasar a otra pantalla por el menú, y queda en la URL', async () => {
    const user = mount('/visitas');
    await user.click(screen.getByRole('button', { name: '7 días' }));
    expect(where()).toContain('rango=');

    await user.click(screen.getByRole('link', { name: 'Cupones' }));
    expect(preset()).toBe('Últimos 7 días');
    expect(where()).toMatch(/^\/cupones\?rango=/);

    // Escribirlo en la URL reemplaza la entrada: Atrás vuelve a Visitas, no a
    // un "/cupones" sin query que lo volvería a escribir.
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(where()).toMatch(/^\/visitas\?rango=/);
  });

  it('un período personalizado se recuerda con sus fechas', async () => {
    const user = mount('/visitas');
    await user.click(screen.getByRole('button', { name: 'enero' }));
    await user.click(screen.getByRole('link', { name: 'Cupones' }));
    expect(screen.getByTestId('range')).toHaveTextContent('Personalizado|2026-01-01|2026-01-31');
  });

  it('lo que trae la URL manda sobre lo recordado', async () => {
    sessionStorage.setItem('tiendafy:stats:rango', 'rango=%C3%9Altimos+7+d%C3%ADas');
    mount('/visitas?rango=Hoy');
    expect(preset()).toBe('Hoy');
    // Y pasa a ser lo recordado.
    expect(sessionStorage.getItem('tiendafy:stats:rango')).toContain('rango=Hoy');
  });

  it('volver a tocar en el menú la pantalla en la que se está conserva el período', async () => {
    const user = mount('/visitas');
    await user.click(screen.getByRole('button', { name: '7 días' }));
    await user.click(screen.getByRole('link', { name: 'Visitas' }));
    expect(preset()).toBe('Últimos 7 días');
    expect(where()).toMatch(/^\/visitas\?rango=/);
  });

  it('con el storage bloqueado anda igual, sin recordar', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const user = mount('/visitas');
    await user.click(screen.getByRole('button', { name: '7 días' }));
    expect(preset()).toBe('Últimos 7 días');
    await user.click(screen.getByRole('link', { name: 'Cupones' }));
    expect(preset()).toBe('Últimos 30 días');
  });
});
