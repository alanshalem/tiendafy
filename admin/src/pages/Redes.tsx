import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button, Tabs, useToast } from '@tiendafy/ui';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { HelpLink } from '../components/HelpLink';
import { LoadError } from '../components/LoadError';
import { ListStats } from '../components/stats/ListStats';
import { formatMoney, formatNumber } from '../lib/format';
import { CalendarioTab } from './redes-calendario';
import { PublicacionesTab, SOCIAL_POSTS_KEY } from './redes-publicaciones';
import { CuentasTab } from './redes-cuentas';
import { ComposerModal } from './redes-composer';
import { postDate, type SocialAccountDto, type SocialChannelsDto, type SocialPostDto } from './redes-shared';

/**
 * El rango que pide el calendario: el mes visible con margen para las semanas
 * de los meses vecinos que entran en la grilla (6 semanas).
 */
function monthRange(month: Date): { from: Date; to: Date } {
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  from.setDate(from.getDate() - 7);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  to.setDate(to.getDate() + 14);
  return { from, to };
}

type Tab = 'calendario' | 'publicaciones' | 'cuentas';

const TABS: { id: Tab; label: string }[] = [
  { id: 'calendario', label: 'Calendario' },
  { id: 'publicaciones', label: 'Publicaciones' },
  { id: 'cuentas', label: 'Cuentas' },
];

/**
 * Redes sociales: conectar cuentas (Facebook, Instagram, X, Telegram), armar un
 * post una vez y publicarlo o programarlo para todas las redes a la vez.
 */
export function RedesPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Al volver de conectar una cuenta (?social=…) se abre directo en Cuentas.
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('social') ? 'cuentas' : 'calendario'));
  const [channels, setChannels] = useState<SocialChannelsDto | null>(null);
  const [accounts, setAccounts] = useState<SocialAccountDto[] | null>(null);
  const [posts, setPosts] = useState<SocialPostDto[] | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [composer, setComposer] = useState<{ post: SocialPostDto | null; date: Date | null } | null>(null);
  // Lo que no se pudo cargar. Antes un error dejaba listas vacías: "sin
  // cuentas conectadas" (y el botón mandaba a conectar de nuevo) o un
  // calendario sin posts que sí estaban programados.
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadAccounts = useCallback(() => {
    api
      .get<{ accounts: SocialAccountDto[] }>('/api/v1/admin/social/accounts')
      .then((r) => setAccounts(r.accounts))
      .catch((e: unknown) => setLoadError(e ?? true));
  }, []);

  // Los del mes que se mira (calendario y cifras de arriba), no los de toda la
  // historia: la bandeja pagina aparte (ver PublicacionesTab).
  const loadPosts = useCallback(() => {
    const { from, to } = monthRange(month);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    api
      .get<{ posts: SocialPostDto[] }>(`/api/v1/admin/social/posts?${params}`)
      .then((r) => setPosts(r.posts))
      .catch((e: unknown) => setLoadError(e ?? true));
  }, [month]);

  const loadSetup = useCallback(() => {
    api
      .get<SocialChannelsDto>('/api/v1/admin/social/channels')
      .then(setChannels)
      .catch((e: unknown) => setLoadError(e ?? true));
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (store) loadSetup();
  }, [store, loadSetup]);

  // Aparte: cambiar de mes pide solo los posts, no las cuentas.
  useEffect(() => {
    if (store) loadPosts();
  }, [store, loadPosts]);

  const retry = () => {
    setLoadError(null);
    loadSetup();
    loadPosts();
  };

  // Vuelta del OAuth: ?social=connected|error (y la URL queda limpia).
  useEffect(() => {
    const result = searchParams.get('social');
    if (!result) return;
    if (result === 'connected') {
      toast('¡Cuenta conectada!', { variant: 'success' });
      loadAccounts();
    } else {
      toast('No se pudo conectar la cuenta. Probá de nuevo.', { variant: 'error' });
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, toast, loadAccounts]);

  if (!store) return null;

  const onSaved = () => {
    loadPosts();
    void queryClient.invalidateQueries({ queryKey: [SOCIAL_POSTS_KEY, store.id] });
  };

  // Del mes que se está mirando en el calendario, no de toda la historia: es
  // el período que el resto de la pantalla ya muestra (lo pedido trae unos
  // días de los meses vecinos para la grilla).
  const monthPosts = (posts ?? []).filter((p) => {
    const at = postDate(p);
    return at.getFullYear() === month.getFullYear() && at.getMonth() === month.getMonth();
  });
  const scheduled = monthPosts.filter((p) => p.status === 'Scheduled').length;
  const published = monthPosts.filter((p) => p.status === 'Published').length;
  const failed = monthPosts.filter((p) => p.status === 'Failed').length;
  const attributedRevenue = monthPosts.reduce((sum, p) => sum + p.attributedRevenueMinor, 0);
  const hasAuthorized = (accounts ?? []).some((a) => a.authorized);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Redes sociales</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Un solo post para todas tus redes: escribilo una vez, programalo y listo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs items={TABS} value={tab} onChange={setTab} />
          {tab !== 'cuentas' && (
            <Button
              onClick={() => {
                if (accounts === null) return; // todavía cargando (o no se pudo)
                if (!hasAuthorized) {
                  toast('Conectá una cuenta primero (pestaña Cuentas).', { variant: 'error' });
                  setTab('cuentas');
                  return;
                }
                setComposer({ post: null, date: null });
              }}
            >
              <Plus className="h-4 w-4" /> Nuevo post
            </Button>
          )}
        </div>
      </div>

      {loadError !== null && (
        <LoadError
          className="mb-4"
          title="No se pudieron cargar las redes sociales."
          error={loadError}
          onRetry={retry}
        />
      )}

      {loadError === null && tab !== 'cuentas' && monthPosts.length > 0 && (
        <div className="mb-4">
          <ListStats
            items={[
              {
                label: 'Programados',
                value: formatNumber(scheduled),
                hint: 'Posts de este mes esperando su turno de publicación.',
              },
              {
                label: 'Publicados',
                value: formatNumber(published),
                hint: 'Posts que ya salieron en al menos una red.',
              },
              {
                label: 'Fallidos',
                value: formatNumber(failed),
                hint: 'No se pudieron publicar (token vencido, red caída). Revisá el detalle del post.',
                tone: failed > 0 ? 'danger' : 'success',
              },
              {
                label: 'Ventas atribuidas',
                value: formatMoney(attributedRevenue),
                hint: 'Facturado por ventas que usaron el cupón de un post de este mes. Es el piso de lo que rindieron las redes.',
                tone: attributedRevenue > 0 ? 'success' : 'default',
              },
            ]}
          />
        </div>
      )}

      {loadError === null && tab === 'calendario' && (
        <CalendarioTab
          posts={posts}
          month={month}
          onMonthChange={setMonth}
          onDayClick={(day) => {
            if (accounts === null) return;
            if (!hasAuthorized) {
              setTab('cuentas');
              return;
            }
            const at = new Date(day);
            at.setHours(12, 0, 0, 0);
            setComposer({ post: null, date: at });
          }}
          onPostClick={(post) => setComposer({ post, date: null })}
        />
      )}
      {loadError === null && tab === 'publicaciones' && (
        <PublicacionesTab onChanged={loadPosts} onEdit={(post) => setComposer({ post, date: null })} />
      )}
      {loadError === null && tab === 'cuentas' && (
        <CuentasTab channels={channels} accounts={accounts} onChanged={loadAccounts} />
      )}

      {composer && channels && (
        <ComposerModal
          post={composer.post}
          channels={channels}
          accounts={accounts ?? []}
          initialDate={composer.date}
          onClose={() => setComposer(null)}
          onSaved={onSaved}
        />
      )}

      <HelpLink id="redes" />
    </div>
  );
}
