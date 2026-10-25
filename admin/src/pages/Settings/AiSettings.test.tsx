/**
 * Configuración → Inteligencia artificial: claves que nunca se muestran, modelos por tarea,
 * tope mensual, consumo y copia a las otras tiendas. La API es la de las fixtures, con las
 * respuestas de /ai/config pisadas por cada test.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ALL_PATHS } from '../../App';
import { routePerm, satisfies, type Perm } from '../../lib/access';
import { visibleSettingsNav } from '../../config/navigation';
import { fixtureTenantId } from '../../../../test-fixtures/mock-api';
import { mockApi, type MockApi } from '../../test/api';
import { settle } from '../../test/explore';
import { renderApp } from '../../test/render';

const PATH = '/configuracion/inteligencia-artificial';

const provider = (name: string, configured = false, last4: string | null = null) => ({
  provider: name,
  configured,
  last4,
  lastTestOk: null,
  lastTestAt: null,
});

const task = (
  name: string,
  label: string,
  eligible: string[],
  suggested: string[],
  warning: string | null = null,
) => ({
  task: name,
  label,
  eligibleModels: eligible,
  suggestedModels: suggested,
  warning,
});

const TASKS = [
  task('QuestionDraft', 'Redactar respuestas', ['claude-sonnet', 'gpt-mini'], ['gpt-mini']),
  task('CatalogWrite', 'Redactar fichas de productos', ['claude-sonnet', 'gpt-mini'], ['claude-sonnet']),
];

function config(over: Record<string, unknown> = {}) {
  return {
    providers: [provider('Anthropic'), provider('OpenAI'), provider('Google'), provider('Groq')],
    assignments: [],
    settings: { enabled: false, monthlyBudgetUsd: 0, alertThresholdPct: 80 },
    tasks: TASKS,
    ...over,
  };
}

const usage = (over: Record<string, unknown> = {}) => ({
  month: '2026-10',
  scope: 'store',
  budgetMicroUsd: 0,
  spentMicroUsd: 0,
  byDay: [],
  byTask: [],
  byModel: [],
  byUser: [],
  stores: null,
  ...over,
});

async function open(setup?: (api: MockApi) => void) {
  const api = mockApi();
  api.on('GET', '/api/v1/ai/config', config());
  api.on('GET', '/api/v1/ai/config/usage', usage());
  setup?.(api);
  renderApp(PATH);
  await screen.findByRole('heading', { name: 'Inteligencia artificial', level: 1 });
  await settle(2);
  return api;
}

describe('la pantalla en el panel', () => {
  it('está entre las rutas y pide ai.config', () => {
    expect(ALL_PATHS).toContain(PATH);
    expect(routePerm(PATH)).toBe('ai.config');
  });

  it('el menú de Configuración la muestra solo a quien tiene ai.config', () => {
    const links = (...perms: Perm[]) =>
      visibleSettingsNav((p) => perms.includes(p)).flatMap((g) => g.items.map((i) => i.to));
    expect(links('ai.config')).toContain(PATH);
    expect(links('store.config')).not.toContain(PATH);
    expect(satisfies((p) => p === 'ai.config', routePerm(PATH))).toBe(true);
    expect(satisfies((p) => p === 'store.config', routePerm(PATH))).toBe(false);
  });
});

describe('claves', () => {
  it('la clave nunca se muestra: después de guardar el campo queda vacío y se ve …a1b2', async () => {
    const user = userEvent.setup();
    let saved = false;
    const api = await open((a) => {
      a.on('GET', '/api/v1/ai/config', () =>
        config({
          providers: [
            provider('Anthropic', saved, saved ? 'a1b2' : null),
            provider('OpenAI'),
            provider('Google'),
            provider('Groq'),
          ],
        }),
      );
      a.on('PUT', '/api/v1/ai/config/providers/Anthropic', () => {
        saved = true;
        return {};
      });
    });

    const input = screen.getByLabelText('Clave de Anthropic');
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, 'sk-test-xxxxa1b2');
    await user.click(screen.getByRole('button', { name: 'Guardar clave de Anthropic' }));

    expect(await screen.findByText('…a1b2')).toBeInTheDocument();
    expect(screen.getByLabelText('Clave de Anthropic')).toHaveValue('');
    expect(document.body.textContent).not.toContain('sk-test-xxxxa1b2');
    const put = api.calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/v1/ai/config/providers/Anthropic',
    );
    expect(put?.body).toEqual({ apiKey: 'sk-test-xxxxa1b2' });
  });

  it('borrar pide confirmación', async () => {
    const user = userEvent.setup();
    const api = await open((a) =>
      a.on(
        'GET',
        '/api/v1/ai/config',
        config({
          providers: [
            provider('Anthropic', true, 'a1b2'),
            provider('OpenAI'),
            provider('Google'),
            provider('Groq'),
          ],
        }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Borrar la clave de Anthropic' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Borrar clave' }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/v1/ai/config/providers/Anthropic'),
      ).toBe(true),
    );
  });

  it('probar conexión muestra el mensaje del servidor', async () => {
    const user = userEvent.setup();
    await open((a) => {
      a.on(
        'GET',
        '/api/v1/ai/config',
        config({
          providers: [
            provider('Anthropic', true, 'a1b2'),
            provider('OpenAI'),
            provider('Google'),
            provider('Groq'),
          ],
        }),
      );
      a.on('POST', '/api/v1/ai/config/providers/Anthropic/test', {
        ok: false,
        message: 'La clave de Anthropic no es válida.',
      });
    });
    await user.click(screen.getByRole('button', { name: 'Probar conexión con Anthropic' }));
    expect(await screen.findByText('La clave de Anthropic no es válida.')).toBeInTheDocument();
  });
});

describe('modelos por tarea', () => {
  it('"Usar recomendados" completa el principal de cada tarea con el primero sugerido', async () => {
    const user = userEvent.setup();
    const api = await open((a) =>
      a.on(
        'GET',
        '/api/v1/ai/config',
        config({
          providers: [
            provider('Anthropic', true, 'a1b2'),
            provider('OpenAI', true, 'c3d4'),
            provider('Google'),
            provider('Groq'),
          ],
        }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Usar recomendados' }));
    expect(screen.getByLabelText('Modelo principal de Redactar respuestas')).toHaveValue('gpt-mini');
    expect(screen.getByLabelText('Modelo principal de Redactar fichas de productos')).toHaveValue(
      'claude-sonnet',
    );

    await user.click(screen.getByRole('button', { name: 'Guardar modelos' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/api/v1/ai/config/assignments')).toBe(
        true,
      ),
    );
    const put = api.calls.find((c) => c.path === '/api/v1/ai/config/assignments');
    expect(put?.body).toEqual({
      items: [
        { task: 'QuestionDraft', primaryModel: 'gpt-mini', fallbackModel: null },
        { task: 'CatalogWrite', primaryModel: 'claude-sonnet', fallbackModel: null },
      ],
    });
  });

  it('muestra el aviso de la tarea', async () => {
    await open((a) =>
      a.on(
        'GET',
        '/api/v1/ai/config',
        config({
          tasks: [
            task(
              'CatalogJudge',
              'Evaluar fichas de productos',
              ['x'],
              ['x'],
              'Conviene que evalúe un modelo de otro proveedor.',
            ),
          ],
        }),
      ),
    );
    expect(screen.getByText('Conviene que evalúe un modelo de otro proveedor.')).toBeInTheDocument();
  });
});

describe('presupuesto', () => {
  it('el interruptor está deshabilitado hasta que haya tope', async () => {
    const user = userEvent.setup();
    await open();
    const toggle = screen.getByRole('switch', { name: /Usar inteligencia artificial/ });
    expect(toggle).toBeDisabled();
    await user.type(screen.getByLabelText('Tope mensual (US$)'), '20');
    expect(toggle).toBeEnabled();
  });

  it('sugiere 20 dólares', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Poner US$ 20' }));
    expect(screen.getByLabelText('Tope mensual (US$)')).toHaveValue('20');
  });

  it('guarda y manda el tope en dólares', async () => {
    const user = userEvent.setup();
    const api = await open();
    await user.type(screen.getByLabelText('Tope mensual (US$)'), '12,5');
    await user.click(screen.getByRole('switch', { name: /Usar inteligencia artificial/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar presupuesto' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/api/v1/ai/config/settings')).toBe(true),
    );
    expect(api.calls.find((c) => c.path === '/api/v1/ai/config/settings')?.body).toEqual({
      enabled: true,
      monthlyBudgetUsd: 12.5,
      alertThresholdPct: 80,
    });
  });
});

describe('consumo', () => {
  it('sin tope no muestra "tope US$ 0" ni una barra', async () => {
    await open((a) => a.on('GET', '/api/v1/ai/config/usage', usage({ spentMicroUsd: 1_500_000 })));
    expect(screen.getByText('US$ 1,50')).toBeInTheDocument();
    expect(screen.getByText('Sin tope')).toBeInTheDocument();
    expect(screen.queryByText(/tope US\$ 0/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('con tope muestra lo gastado contra el tope y el porcentaje', async () => {
    await open((a) =>
      a.on('GET', '/api/v1/ai/config/usage', usage({ spentMicroUsd: 5_000_000, budgetMicroUsd: 20_000_000 })),
    );
    expect(screen.getByText('de un tope de US$ 20,00 (25 %)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('"Todas mis tiendas" pide scope=owned', async () => {
    const user = userEvent.setup();
    const api = await open();
    expect(api.calls.some((c) => c.path.includes('scope=owned'))).toBe(false);
    await user.selectOptions(screen.getByLabelText('Alcance del consumo'), 'owned');
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.path.includes('/ai/config/usage') && c.path.includes('scope=owned')),
      ).toBe(true),
    );
  });

  it('el consumo por tarea usa los nombres de la tarea', async () => {
    await open((a) =>
      a.on(
        'GET',
        '/api/v1/ai/config/usage',
        usage({
          spentMicroUsd: 2_000_000,
          byTask: [{ key: 'QuestionDraft', microUsd: 2_000_000 }],
          byUser: [{ userId: null, name: 'Automático', microUsd: 2_000_000 }],
        }),
      ),
    );
    expect(screen.getByText('Redactar respuestas', { selector: 'span[title]' })).toBeInTheDocument();
    expect(screen.getByText('Automático')).toBeInTheDocument();
  });
});

describe('copiar a mis otras tiendas', () => {
  const OTHER = '11111111-1111-4111-8111-111111111111';
  const owned = usage({
    scope: 'owned',
    stores: [
      { tenantId: fixtureTenantId, name: 'Esta tienda', spentMicroUsd: 0, budgetMicroUsd: 0 },
      { tenantId: OTHER, name: 'Tienda hermana', spentMicroUsd: 0, budgetMicroUsd: 0 },
    ],
  });

  it('lista solo las otras tiendas propias, confirma y copia', async () => {
    const user = userEvent.setup();
    const api = await open((a) => a.on('GET', '/api/v1/ai/config/usage', owned));
    await user.click(screen.getByRole('button', { name: 'Copiar a mis otras tiendas' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Tienda hermana')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Esta tienda')).toBeNull();

    const copy = within(dialog).getByRole('button', { name: 'Copiar' });
    expect(copy).toBeDisabled();
    await user.click(within(dialog).getByLabelText('Tienda hermana'));
    await user.click(within(dialog).getByLabelText('Presupuesto'));
    await user.click(copy);

    expect(
      await screen.findByText('Esto reemplaza la configuración de IA de las tiendas elegidas.'),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/v1/ai/config/copy')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Reemplazar' }));
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/v1/ai/config/copy')).toBe(true));
    expect(api.calls.find((c) => c.path === '/api/v1/ai/config/copy')?.body).toEqual({
      targetTenantIds: [OTHER],
      keys: true,
      models: true,
      budget: false,
    });
  });
});
