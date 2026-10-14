import { useState, useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, KeyRound, MessageCircle, Send, Unplug } from 'lucide-react';
import { Button, Input, Modal, Switch, useConfirm, useToast } from '@tiendafy/ui';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { NotificationUsage } from '../../components/NotificationUsage';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { formatDate } from '../../lib/format';
import { Helper } from './Helper';
import { TemplateGrid } from './TemplateGrid';
import { ConnectedBadge, ConnectionLoading } from './ConnectionBits';
import { TableSkeleton } from '../../components/Skeleton';

const WA_GREEN = '#25D366';

interface ConnectionDto {
  connected: boolean;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  connectedAtUtc: string | null;
}

interface WaTpl {
  type: string;
  group: string;
  label: string;
  description: string;
  enabled: boolean;
  metaTemplateName: string;
  languageCode: string;
  variables: string[];
  sampleBody: string;
}

const GROUPS = ['Ventas', 'Promociones'];

export function WhatsAppAutoPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WaTpl | null>(null);

  // Un error al leer la conexión no es "sin conectar": eso mostraba el form
  // para volver a cargar las credenciales de Meta, que ya estaban.
  const connQ = useQuery({
    queryKey: ['whatsapp-connection', store?.id],
    queryFn: () => api.get<ConnectionDto>('/api/v1/whatsapp/connection'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });
  const { data: conn, isLoading: loadingConn } = connQ;
  const connected = conn?.connected ?? false;

  const tplQ = useQuery({
    queryKey: ['whatsapp-templates', store?.id],
    queryFn: () => api.get<{ items: WaTpl[] }>('/api/v1/whatsapp/templates'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });
  const { data, isLoading: loadingTpls } = tplQ;
  const items = data?.items ?? [];

  const save = useMutation({
    mutationFn: (t: { type: string; enabled: boolean; metaTemplateName: string; languageCode: string }) =>
      api.put(`/api/v1/whatsapp/templates/${t.type}`, {
        enabled: t.enabled,
        metaTemplateName: t.metaTemplateName,
        languageCode: t.languageCode,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', store?.id] }),
    onError: (err) => toast(errMsg(err, 'No se pudo guardar'), { variant: 'error' }),
  });

  const toggle = (t: WaTpl, on: boolean) =>
    save.mutate(
      { type: t.type, enabled: on, metaTemplateName: t.metaTemplateName, languageCode: t.languageCode },
      { onSuccess: () => toast(on ? 'Mensaje activado' : 'Mensaje desactivado', { variant: 'success' }) },
    );

  return (
    <div className="pb-20">
      <SettingsHeader
        title="WhatsApp automático"
        description="Mensajes de WhatsApp que se envían solos a tus clientes, con la API oficial de Meta."
      />

      <NotificationUsage channel="whatsapp" />

      {connQ.isError && !conn ? (
        <LoadError
          title="No se pudo cargar la conexión con WhatsApp."
          error={connQ.error}
          onRetry={() => void connQ.refetch()}
          retrying={connQ.isFetching}
        />
      ) : (
        <ConnectionCard conn={conn ?? null} loading={loadingConn} />
      )}

      {/* Aviso: los cuerpos de mensaje los aprueba Meta como plantillas */}
      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-bg/60 p-3.5 text-sm text-fg">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          El contenido de cada mensaje es una <strong>plantilla que Meta aprueba previamente</strong> (24-48
          hs) desde el Meta Business Manager. Acá activás cada tipo y le decís qué plantilla aprobada usar.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {loadingTpls && (
          <div className="rounded-lg border border-border bg-surface">
            <TableSkeleton rows={4} label="Cargando mensajes…" />
          </div>
        )}
        {tplQ.isError && !data && (
          <LoadError
            title="No se pudieron cargar los mensajes automáticos."
            error={tplQ.error}
            onRetry={() => void tplQ.refetch()}
            retrying={tplQ.isFetching}
          />
        )}
        <TemplateGrid
          groups={GROUPS}
          items={items}
          editLabel="Configurar plantilla"
          onEdit={setEditing}
          renderToggle={(t) => (
            <span title={!connected ? 'Conectá WhatsApp primero' : undefined}>
              <Switch
                aria-label={`Activar «${t.label}»`}
                checked={t.enabled}
                disabled={!connected}
                onChange={(on) => toggle(t, on)}
              />
            </span>
          )}
        />
        {!connected && !loadingTpls && items.length > 0 && (
          <p className="text-xs text-fg-muted">Conectá WhatsApp primero para poder activar los mensajes.</p>
        )}
      </div>

      {editing && (
        <TemplateModal
          key={editing.type}
          template={editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(metaTemplateName, languageCode) =>
            save.mutate(
              { type: editing.type, enabled: editing.enabled, metaTemplateName, languageCode },
              {
                onSuccess: () => {
                  toast('Plantilla guardada', { variant: 'success' });
                  setEditing(null);
                },
              },
            )
          }
        />
      )}
      <HelpLink id="whatsappAuto" />
    </div>
  );
}

// ---- Tarjeta de conexión con la Cloud API de Meta ---------------------------

function ConnectionCard({ conn, loading }: { conn: ConnectionDto | null; loading: boolean }) {
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [editingCreds, setEditingCreds] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const connected = conn?.connected ?? false;
  const showForm = !connected || editingCreds;

  const disconnect = useMutation({
    mutationFn: () => api.delete('/api/v1/whatsapp/connection'),
    onSuccess: () => {
      toast('WhatsApp desconectado', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connection', store?.id] });
    },
    onError: (err) => toast(errMsg(err, 'No se pudo desconectar'), { variant: 'error' }),
  });

  const onDisconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar WhatsApp',
      message: 'Se van a dejar de enviar los mensajes automáticos. Podés reconectar cuando quieras.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    });
    if (ok) disconnect.mutate();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* Cabecera con marca */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: `${WA_GREEN}14` }}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: WA_GREEN }}
        >
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-base font-bold text-fg">WhatsApp Business</span>
          <p className="text-xs text-fg-muted">
            Cloud API oficial de Meta. Los mensajes salen desde tu propio número.
          </p>
        </div>
        {connected && <ConnectedBadge />}
      </div>

      <div className="p-5">
        {loading ? (
          <ConnectionLoading />
        ) : showForm ? (
          <ConnectionForm
            initialPhoneNumberId={editingCreds ? (conn?.phoneNumberId ?? '') : ''}
            initialDisplayPhoneNumber={editingCreds ? (conn?.displayPhoneNumber ?? '') : ''}
            onCancel={editingCreds ? () => setEditingCreds(false) : undefined}
            onSaved={() => setEditingCreds(false)}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-fg-muted">
                Phone Number ID <strong className="text-fg tabular-nums">{conn?.phoneNumberId}</strong>
              </span>
              {conn?.displayPhoneNumber && (
                <span className="text-fg-muted">
                  Número <strong className="text-fg">{conn.displayPhoneNumber}</strong>
                </span>
              )}
              {conn?.connectedAtUtc && (
                <span className="text-fg-muted">Conectada el {formatDate(conn.connectedAtUtc)}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => setTestOpen(true)}>
                <Send className="h-4 w-4" /> Enviar mensaje de prueba
              </Button>
              <Button variant="secondary" onClick={() => setEditingCreds(true)}>
                <KeyRound className="h-4 w-4" /> Actualizar credenciales
              </Button>
              <Button
                variant="ghost"
                onClick={onDisconnect}
                disabled={disconnect.isPending}
                className="text-danger hover:bg-danger/10"
              >
                <Unplug className="h-4 w-4" /> Desconectar
              </Button>
            </div>
          </div>
        )}
      </div>

      {testOpen && <TestModal onClose={() => setTestOpen(false)} />}
    </div>
  );
}

function ConnectionForm({
  initialPhoneNumberId,
  initialDisplayPhoneNumber,
  onCancel,
  onSaved,
}: {
  initialPhoneNumberId: string;
  initialDisplayPhoneNumber: string;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const fid = useId();
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phoneNumberId, setPhoneNumberId] = useState(initialPhoneNumberId);
  const [accessToken, setAccessToken] = useState('');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState(initialDisplayPhoneNumber);

  const connect = useMutation({
    mutationFn: () =>
      api.put('/api/v1/whatsapp/connection', {
        phoneNumberId: phoneNumberId.trim(),
        accessToken: accessToken.trim(),
        ...(displayPhoneNumber.trim() ? { displayPhoneNumber: displayPhoneNumber.trim() } : {}),
      }),
    onSuccess: () => {
      toast('¡WhatsApp conectado!', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-connection', store?.id] });
      onSaved();
    },
    onError: (err) => toast(errMsg(err, 'No se pudo conectar'), { variant: 'error' }),
  });

  const canSubmit = phoneNumberId.trim().length > 0 && accessToken.trim().length > 0;

  return (
    <div>
      <p className="mb-4 text-sm text-fg">
        Conectá tu número de WhatsApp Business con la Cloud API de Meta. Necesitás una app en Meta for
        Developers con WhatsApp habilitado.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) connect.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
            Phone Number ID
          </label>
          <Input
            id={`${fid}-1`}
            aria-label="Phone Number ID"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ej: 123456789012345"
            required
          />
        </div>
        <div>
          <label htmlFor={`${fid}-2`} className="mb-1.5 block text-sm font-medium text-fg">
            Access token permanente
          </label>
          <Input
            id={`${fid}-2`}
            aria-label="Access token permanente"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Token generado con tu system user"
            required
          />
        </div>
        <div>
          <label htmlFor={`${fid}-3`} className="mb-1.5 block text-sm font-medium text-fg">
            Número visible <span className="font-normal text-fg-muted">(opcional)</span>
          </label>
          <Input
            id={`${fid}-3`}
            aria-label="Número visible"
            value={displayPhoneNumber}
            onChange={(e) => setDisplayPhoneNumber(e.target.value)}
            placeholder="+54 9 11 1234-5678"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={connect.isPending}
            style={{ background: WA_GREEN }}
          >
            Conectar
          </Button>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <Helper title="¿De dónde saco esto?">
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            Creá una app en <code>developers.facebook.com</code>.
          </li>
          <li>
            Agregá el producto <strong>WhatsApp</strong> a la app.
          </li>
          <li>
            Copiá el <strong>Phone Number ID</strong> del panel de WhatsApp.
          </li>
          <li>
            Generá un <strong>token permanente</strong> con un system user en Meta Business.
          </li>
        </ol>
      </Helper>
    </div>
  );
}

// ---- Modal de mensaje de prueba ---------------------------------------------

function TestModal({ onClose }: { onClose: () => void }) {
  const fid = useId();
  const { toast } = useToast();
  const [to, setTo] = useState('');

  const test = useMutation({
    mutationFn: () => api.post<{ sent: boolean; to: string }>('/api/v1/whatsapp/test', { to: to.trim() }),
    onSuccess: (res) => {
      toast(`Mensaje de prueba enviado a ${res.to}`, { variant: 'success' });
      onClose();
    },
    onError: (err) => toast(errMsg(err, 'No se pudo enviar el mensaje de prueba'), { variant: 'error' }),
  });

  const canSend = to.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar mensaje de prueba"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => canSend && test.mutate()} disabled={!canSend} loading={test.isPending}>
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
            Número de destino
          </label>
          <Input
            id={`${fid}-1`}
            aria-label="Número de destino"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+54 9 11 1234-5678"
            autoFocus
          />
        </div>
        <p className="text-xs text-fg-muted">
          Si tu app de Meta está en modo prueba, el mensaje solo llega a números registrados como testers en
          el panel de la app.
        </p>
      </div>
    </Modal>
  );
}

// ---- Modal de configuración de plantilla ------------------------------------

function TemplateModal({
  template,
  saving,
  onClose,
  onSave,
}: {
  template: WaTpl;
  saving: boolean;
  onClose: () => void;
  onSave: (metaTemplateName: string, languageCode: string) => void;
}) {
  const fid = useId();
  // Otra plantilla, otro formulario: lo vuelve a montar la key de quien lo abre.
  const [name, setName] = useState(template.metaTemplateName);
  const [lang, setLang] = useState(template.languageCode || 'es_AR');

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Configurar: ${template.label}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(name.trim(), lang.trim() || 'es_AR')} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div>
          <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
            Nombre de la plantilla en Meta
          </label>
          <Input
            id={`${fid}-1`}
            aria-label="Nombre de la plantilla en Meta"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="confirmacion_compra"
          />
          <p className="mt-1 text-xs text-fg-muted">
            El nombre exacto con el que la aprobaste, ej: <code>confirmacion_compra</code>.
          </p>
        </div>
        <div>
          <label htmlFor={`${fid}-2`} className="mb-1.5 block text-sm font-medium text-fg">
            Idioma
          </label>
          <Input
            id={`${fid}-2`}
            aria-label="Idioma"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            placeholder="es_AR"
          />
        </div>

        <div className="rounded-md border border-border bg-bg-muted/40 p-3">
          <div className="mb-2 text-sm font-medium text-fg">Sugerencia para crear la plantilla en Meta</div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed text-fg">
            {template.sampleBody}
          </pre>
          {template.variables.length > 0 && (
            <div className="mt-2 text-xs text-fg-muted">
              <span className="font-medium text-fg">Variables, en este orden:</span>
              <ul className="mt-1 space-y-0.5">
                {template.variables.map((v, i) => (
                  <li key={v}>
                    <code className="rounded bg-bg-muted px-1 py-0.5">{`{{${i + 1}}}`}</code> = {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---- Helper colapsable (mismo patrón que MercadoPagoConnect) ----------------
