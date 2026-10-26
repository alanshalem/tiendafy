import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clipHistory, type AssistantTurn } from '../lib/assistant';
import { MiniMarkdown } from '../lib/miniMarkdown';

const turn = (tag: string, chars = 10): AssistantTurn => ({
  question: `P${tag}`.padEnd(chars, 'x'),
  answer: `R${tag}`.padEnd(chars, 'y'),
});

describe('clipHistory', () => {
  it('deja las últimas cuatro vueltas, en orden', () => {
    const turns = [1, 2, 3, 4, 5, 6].map((n) => turn(String(n)));
    expect(clipHistory(turns)).toEqual(turns.slice(2));
  });

  it('respeta los 4.000 caracteres', () => {
    const turns = [1, 2, 3, 4].map((n) => turn(String(n), 750));
    expect(clipHistory(turns)).toEqual(turns.slice(2));
  });

  it('corta una sola vuelta larga', () => {
    const [only] = clipHistory([{ question: 'p'.repeat(500), answer: 'r'.repeat(5500) }]);
    expect(only.question.length + only.answer.length).toBeLessThanOrEqual(4000);
  });

  it('sin vueltas es vacío', () => {
    expect(clipHistory([])).toEqual([]);
  });
});

describe('MiniMarkdown', () => {
  it('arma negrita, listas y tablas', () => {
    const { container } = render(
      <MiniMarkdown text={'**Ventas**\n\n- a\n- b\n\n| Mes | Total |\n|---|---|\n| Oct | 10 |'} />,
    );
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('table th')).toHaveLength(2);
    expect(container.querySelectorAll('table td')).toHaveLength(2);
  });

  it('lista numerada', () => {
    const { container } = render(<MiniMarkdown text={'1. uno\n2. dos'} />);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('el HTML se ve como texto y no se ejecuta ni se carga', () => {
    const { container } = render(<MiniMarkdown text="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img');
  });

  it('una imagen es solo su descripción', () => {
    const { container } = render(<MiniMarkdown text="![dato](https://evil.test/?q=1)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('dato');
  });

  it('un link es solo su texto', () => {
    const { container } = render(<MiniMarkdown text="[acá](https://evil.test)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('acá');
  });

  it('un script no entra al DOM', () => {
    const { container } = render(<MiniMarkdown text="<script>alert(1)</script>" />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });
});
