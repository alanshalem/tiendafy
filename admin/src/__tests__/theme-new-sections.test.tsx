/**
 * Los editores de las secciones de la fase 2 (cronómetro, producto
 * destacado, pop-up, texto con formato, categorías, video, columnas y
 * collage): lo que se toca llega a los datos con la forma que espera la
 * tienda, y el registro tolera datos rotos.
 */
import {
  createSection,
  normalizeSection,
  sectionData,
  sectionProductPlan,
  type SectionType,
  type ThemeSection,
} from '@tiendafy/types';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import { mockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderWithProviders } from '../test/render';

let latest: Record<string, unknown> = {};

function Harness({ type, data = {} }: { type: SectionType; data?: Record<string, unknown> }) {
  const [section, setSection] = useState<ThemeSection>({ id: 's1', type, visible: true, data });
  return (
    <SectionPanel
      section={section}
      onBack={() => {}}
      onChange={(next) => {
        setSection(next);
        latest = next.data;
      }}
    />
  );
}

async function open(type: SectionType, data: Record<string, unknown> = {}) {
  latest = {};
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  const utils = renderWithProviders(<Harness type={type} data={data} />);
  await settle(3);
  return { user, ...utils };
}

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

describe('ofertas con cronómetro', () => {
  it('nace con una fecha de cierre a una semana, a las 23:59 de Argentina', () => {
    const s = createSection('countdown-offer');
    const data = sectionData(s as ThemeSection & { type: 'countdown-offer' });
    const end = Date.parse(data.endsAt);
    expect(end - Date.now()).toBeGreaterThan(6 * 86_400_000);
    expect(end - Date.now()).toBeLessThan(8 * 86_400_000);
    // 23:59 de Argentina = 02:59 UTC.
    expect(data.endsAt).toMatch(/T02:59:00\.000Z$/);
  });

  it('la fecha se elige en hora argentina y se guarda en UTC', async () => {
    await open('countdown-offer');
    const input = screen.getByLabelText('Termina el');
    fireEvent.change(input, { target: { value: '2026-12-24T20:30' } });
    expect(latest.endsAt).toBe('2026-12-24T23:30:00.000Z');
    expect(screen.getByText(/Termina el jueves 24\/12 a las 20:30/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '' } });
    expect(latest.endsAt).toBe('');
  });

  it('el origen de los productos va en data.source y data.limit, y el plan lo respeta', async () => {
    const { user } = await open('countdown-offer');
    expect(screen.getByLabelText('Qué productos mostrar')).toHaveValue('on-sale');
    await user.selectOptions(screen.getByLabelText('Qué productos mostrar'), 'category');
    expect(latest.source).toEqual({ kind: 'category', categoryId: '' });
    await settle(2);
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Musculación');
    expect(latest.source).toMatchObject({ kind: 'category', categoryId: expect.any(String) });

    const limit = screen.getByLabelText('Cuántos mostrar como máximo');
    fireEvent.change(limit, { target: { value: '99' } });
    expect(latest.limit).toBe(24);

    const plan = sectionProductPlan({ type: 'countdown-offer', data: latest });
    expect(plan).toMatchObject({ source: { kind: 'category' }, limit: 24 });
    // Sin origen: los que están en oferta.
    expect(sectionProductPlan({ type: 'countdown-offer', data: {} })).toEqual({
      source: { kind: 'on-sale' },
      limit: 8,
    });
  });

  it('el mensaje de cierre solo aparece si se elige mostrarlo', async () => {
    const { user } = await open('countdown-offer');
    expect(screen.queryByLabelText('Mensaje cuando termina')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Cuando termina'), 'message');
    await user.type(screen.getByLabelText('Mensaje cuando termina'), '!');
    expect(latest.whenEnded).toBe('message');
    expect(latest.endedText).toBe('Esta oferta terminó.!');
  });

  it('tolera datos rotos', () => {
    const s = normalizeSection({
      id: 'x',
      type: 'countdown-offer',
      visible: true,
      data: { endsAt: 'pasado mañana', whenEnded: 'explotar', carousel: 'sí', title: 7 },
    })!;
    expect(s.data).toMatchObject({ endsAt: '', whenEnded: 'hide', carousel: true, title: '7' });
  });
});
