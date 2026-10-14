/**
 * El editor de cada tipo de sección de la portada (hero, carrusel,
 * destacados, banners, testimonios…), de a uno: se abre vacío, se toca todo
 * lo que tiene y cada cambio tiene que llegar a los datos de la sección.
 *
 * La lista de tipos es un Record<SectionType, true>: si se agrega un tipo de
 * sección y no se suma acá, el test no compila.
 */
import type { SectionType, ThemeSection } from '@tiendafy/types';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import { mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

const ALL_TYPES: Record<SectionType, true> = {
  'hero-video': true,
  carousel: true,
  featured: true,
  'promo-banners': true,
  institutional: true,
  'category-banners': true,
  'new-products': true,
  'image-text': true,
  'sale-products': true,
  instagram: true,
  'info-bar': true,
  newsletter: true,
  testimonials: true,
  faq: true,
  brands: true,
  'countdown-offer': true,
  'featured-product': true,
  'promo-popup': true,
};

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** La sección con estado propio, como la maneja el editor. */
function Harness({ type, onData }: { type: SectionType; onData: (d: Record<string, unknown>) => void }) {
  const [section, setSection] = useState<ThemeSection>({ id: 's1', type, visible: true, data: {} });
  return (
    <SectionPanel
      section={section}
      onBack={() => {}}
      onChange={(next) => {
        setSection(next);
        onData(next.data);
      }}
    />
  );
}

describe('editores de sección', () => {
  it.each(Object.keys(ALL_TYPES) as SectionType[])('%s', { timeout: 60_000 }, async (type) => {
    mockApi();
    const onData = vi.fn();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const { container } = renderWithProviders(<Harness type={type} onData={onData} />);
    await settle(4);

    await explore(user, () => container, 40);
    await settle(2);

    expect(crashes()).toEqual([]);
    // Todos los editores tienen algo que se puede cambiar.
    expect(onData).toHaveBeenCalled();
  });
});
