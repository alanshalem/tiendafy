import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AiDraft } from '../lib/aiDraft';
import { AiDraftNotice } from './AiDraftNotice';

const draft = (patch: Partial<AiDraft>): AiDraft => ({
  text: 'Hola',
  category: 'other',
  reason: null,
  manual: false,
  warnings: [],
  ...patch,
});

describe('AiDraftNotice', () => {
  it('sin borrador no dibuja nada', () => {
    const { container } = render(<AiDraftNotice draft={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('un borrador sin avisos no dibuja nada', () => {
    const { container } = render(<AiDraftNotice draft={draft({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lista los avisos como texto plano en un status', () => {
    render(
      <AiDraftNotice
        draft={draft({
          warnings: [
            { code: 'link', message: 'El borrador tiene un link.' },
            { code: 'amount', message: '<b>Hay un importe</b>' },
          ],
        })}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('El borrador tiene un link.')).toBeInTheDocument();
    // Nada de HTML: se ve el texto tal cual.
    expect(screen.getByText('<b>Hay un importe</b>')).toBeInTheDocument();
  });

  it('manual: "Respondé a mano" con el motivo', () => {
    render(<AiDraftNotice draft={draft({ text: null, manual: true, reason: 'pide un teléfono' })} />);
    expect(screen.getByText('Respondé a mano')).toBeInTheDocument();
    expect(screen.getByText('pide un teléfono')).toBeInTheDocument();
  });
});
