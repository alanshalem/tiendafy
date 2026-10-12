import { useState } from 'react';
import { Loader2, Plug, Users } from 'lucide-react';
import { Badge, Button, EmptyList, Input, Modal, Spinner, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import {
  CONNECTOR_META,
  connectorFor,
  providerMeta,
  ProviderIcon,
  type SocialAccountDto,
  type SocialChannelsDto,
} from './redes-shared';

// ---- Cuentas conectadas ------------------------------------------------------

export function CuentasTab({
  channels,
  accounts,
  onChanged,
}: {
  channels: SocialChannelsDto | null;
  accounts: SocialAccountDto[] | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [telegramOpen, setTelegramOpen] = useState(false);

  // Arranca el OAuth: la API devuelve la URL de autorización y el browser va para allá.
  const connect = async (connector: string) => {
    setConnecting(connector);
    try {
      const res = await api.post<{ authUrl: string }>(
        `/api/v1/admin/social/accounts/connect/${connector}`,
        {},
      );
      window.location.href = res.authUrl;
    } catch (err) {
      toast(errMsg(err, 'No se pudo iniciar la conexión.'), { variant: 'error' });
      setConnecting(null);
    }
  };

  const disconnect = async (account: SocialAccountDto) => {
    const ok = await confirm({
      title: 'Desconectar cuenta',
      message: `Los posts programados hacia ${account.name} van a fallar en esa red. ¿Desconectar igual?`,
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/v1/admin/social/accounts/${account.id}`);
      toast('Cuenta desconectada', { variant: 'success' });
      onChanged();
    } catch (err) {
      toast(errMsg(err, 'No se pudo desconectar.'), { variant: 'error' });
    }
  };

  if (!channels || !accounts) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Conectar redes */}
      <div className="grid gap-3 sm:grid-cols-3">
        {channels.connectors.map((c) => (
          <div key={c.key} className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2.5">
              <ProviderIcon provider={CONNECTOR_META[c.key]?.provider ?? c.key} />
              <span className="font-medium text-fg">{c.displayName}</span>
            </div>
            <p className="mt-1.5 text-sm text-fg-muted">{CONNECTOR_META[c.key]?.blurb}</p>
            {c.configured ? (
              <Button
                variant="secondary"
                className="mt-3 w-full"
                disabled={connecting !== null}
                onClick={() => (c.key === 'telegram' ? setTelegramOpen(true) : connect(c.key))}
              >
                {connecting === c.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                Conectar
              </Button>
            ) : (
              <p className="mt-3 text-center text-xs text-fg-subtle">
                No configurado en la plataforma todavía.
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Cuentas conectadas */}
      {accounts.length === 0 ? (
        <EmptyList>
          Conectá tu primera cuenta con los botones de arriba. Después vas a poder publicar en todas tus redes
          a la vez desde el calendario.
        </EmptyList>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3.5 rounded-lg border border-border bg-surface p-4 shadow-card"
            >
              {account.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-muted text-fg-subtle">
                  <Users className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ProviderIcon provider={account.provider} size="sm" />
                  <span className="font-medium text-fg">{account.name}</span>
                  {account.username && <span className="text-sm text-fg-subtle">@{account.username}</span>}
                  {!account.authorized && <Badge variant="warning">Reconectar</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-fg-muted">{providerMeta(account.provider).label}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!account.authorized && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      account.provider === 'telegram'
                        ? setTelegramOpen(true)
                        : connect(connectorFor(account.provider))
                    }
                  >
                    Reconectar
                  </Button>
                )}
                <Button variant="secondary" onClick={() => disconnect(account)}>
                  Desconectar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {telegramOpen && <TelegramModal onClose={() => setTelegramOpen(false)} onConnected={onChanged} />}
    </div>
  );
}

// ---- Telegram: bot token + chat por formulario (sin OAuth) -------------------

function TelegramModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const { toast } = useToast();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/v1/admin/social/accounts/telegram', { botToken, chatId });
      toast('Telegram conectado', { variant: 'success' });
      onConnected();
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo conectar: revisá el token y el chat.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Conectar Telegram"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !botToken.trim() || !chatId.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Conectar
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        Creá un bot con <span className="font-medium text-fg">@BotFather</span> en Telegram, agregalo como
        administrador de tu canal o grupo, y pegá acá el token y el nombre del canal (ej.{' '}
        <span className="font-mono">@mitienda</span>) o su ID numérico.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Token del bot</label>
          <Input
            aria-label="Token del bot"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456789:AAF…"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-fg">Canal o chat</label>
          <Input
            aria-label="Canal o chat"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="@mitienda o -1001234567890"
            autoComplete="off"
          />
        </div>
      </div>
    </Modal>
  );
}
