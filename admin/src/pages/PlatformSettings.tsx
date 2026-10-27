import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, RotateCcw, ServerCog, ShieldCheck } from 'lucide-react';
import { Badge, Button, Input, PageHeader, Spinner, Switch, useConfirm, useToast } from '@tiendafy/ui';
import { useAuth } from '../context/AuthContext';
import { api, errMsg } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { qk } from '../lib/queryKeys';
import { SETTINGS_CARD } from '../lib/styles';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';
import { SaveBar } from './Settings/SettingsLayout';

type SettingSource = 'database' | 'environment' | 'default';

export interface PlatformSwitchItem {
  key: string;
  envVar: string;
  value: boolean;
  fallbackValue: boolean;
  source: SettingSource;
}

export interface PlatformTextField {
  key: string;
  envVar: string;
  value: string;
  fallbackValue: string;
  source: SettingSource;
}

export interface PlatformSecretField {
  key: string;
  envVar: string;
  configured: boolean;
  last4: string | null;
  fallbackConfigured: boolean;
  source: SettingSource;
}

export interface PlatformInfraItem {
  key: string;
  envVar: string;
  label: string;
  status: string;
  configured: boolean;
  reason: string;
}

export interface PlatformSettingsView {
  switches: {
    requireTwoFactorForAdmins: PlatformSwitchItem;
    aiDisabled: PlatformSwitchItem;
  };
  services: {
    email: {
      from: PlatformTextField;
      resendApiKey: PlatformSecretField;
      webhookSecret: PlatformSecretField;
    };
    turnstile: {
      siteKey: PlatformTextField;
      secret: PlatformSecretField;
    };
    google: {
      clientId: PlatformTextField;
      clientSecret: PlatformSecretField;
    };
    mercadoPago: {
      clientId: PlatformTextField;
      clientSecret: PlatformSecretField;
      webhookSecret: PlatformSecretField;
    };
    mercadoLibre: {
      clientId: PlatformTextField;
      clientSecret: PlatformSecretField;
    };
    metaAds: {
      appId: PlatformTextField;
      appSecret: PlatformSecretField;
    };
    social: {
      metaAppId: PlatformTextField;
      metaAppSecret: PlatformSecretField;
      xClientId: PlatformTextField;
      xClientSecret: PlatformSecretField;
    };
  };
  infrastructure: PlatformInfraItem[];
  updatedAtUtc: string | null;
  updatedByEmail: string | null;
}

function SourceBadge({ source }: { source: SettingSource }) {
  if (source === 'database') return <Badge variant="primary">Guardado en el panel</Badge>;
  if (source === 'environment') return <Badge variant="neutral">Desde .env.prod</Badge>;
  return <Badge variant="neutral">Valor por defecto</Badge>;
}

export function PlatformSettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.isSuperAdmin);

  const query = useQuery({
    queryKey: qk.platformSettings(),
    queryFn: () => api.get<PlatformSettingsView>('/api/v1/admin/platform-settings'),
    enabled: isSuperAdmin,
    meta: ERROR_SHOWN,
  });

  if (!isSuperAdmin) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Configuración de la plataforma"
          subtitle="Ajustes globales y credenciales compartidas por todas las tiendas de esta instalación."
        />
        <section className={SETTINGS_CARD}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-fg">
                Solo para el superadministrador de la plataforma
              </h2>
              <p className="text-sm text-fg-muted">
                Esta pantalla administra las palancas operativas y las credenciales de servicios de toda la
                instalación. Las cuentas de dueño o administrador de una tienda (incluida la cuenta demo) no
                pueden ver ni modificar estos valores.
              </p>
              <p className="text-xs text-fg-subtle">
                Para crear o promover tu cuenta personal de superadministrador en el servidor, corré:{' '}
                <code className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-fg">
                  dotnet Api.dll make-superadmin tu-email@dominio.com
                </code>
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (query.error && !query.data) {
    return (
      <div className="space-y-5">
        <LoadError
          title="No se pudo cargar la configuración de la plataforma."
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuración de la plataforma"
        subtitle="Lo que cambies acá se guarda cifrado en la base de datos e impacta en el acto en todas las tiendas, sin entrar por SSH ni reiniciar contenedores."
      />
      {!query.data ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner inline /> Cargando configuración de la plataforma…
        </p>
      ) : (
        <PlatformSettingsForm data={query.data} />
      )}
    </div>
  );
}

function PlatformSettingsForm({ data }: { data: PlatformSettingsView }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [require2fa, setRequire2fa] = useState<boolean | null>(null);
  const [aiDisabled, setAiDisabled] = useState<boolean | null>(null);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [clearingKey, setClearingKey] = useState<string | null>(null);

  const s = data.switches;
  const srv = data.services;

  const effectiveRequire2fa = require2fa ?? s.requireTwoFactorForAdmins.value;
  const effectiveAiDisabled = aiDisabled ?? s.aiDisabled.value;

  const textFields: PlatformTextField[] = [
    srv.email.from,
    srv.turnstile.siteKey,
    srv.google.clientId,
    srv.mercadoPago.clientId,
    srv.mercadoLibre.clientId,
    srv.metaAds.appId,
    srv.social.metaAppId,
    srv.social.xClientId,
  ];

  const changedTexts = textFields.filter(
    (f) => textDrafts[f.key] !== undefined && textDrafts[f.key]!.trim() !== f.value,
  );
  const changedSecrets = Object.entries(secretDrafts).filter(([, val]) => val.trim().length > 0);

  const dirty =
    effectiveRequire2fa !== s.requireTwoFactorForAdmins.value ||
    effectiveAiDisabled !== s.aiDisabled.value ||
    changedTexts.length > 0 ||
    changedSecrets.length > 0;

  const resetDrafts = () => {
    setRequire2fa(null);
    setAiDisabled(null);
    setTextDrafts({});
    setSecretDrafts({});
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const values: Record<string, string> = {};
      for (const f of changedTexts) {
        values[f.key] = textDrafts[f.key]!.trim();
      }
      for (const [k, v] of changedSecrets) {
        values[k] = v.trim();
      }

      const updated = await api.put<PlatformSettingsView>('/api/v1/admin/platform-settings', {
        requireTwoFactorForAdmins:
          effectiveRequire2fa !== s.requireTwoFactorForAdmins.value ? effectiveRequire2fa : undefined,
        aiDisabled: effectiveAiDisabled !== s.aiDisabled.value ? effectiveAiDisabled : undefined,
        values: Object.keys(values).length > 0 ? values : undefined,
      });

      qc.setQueryData(qk.platformSettings(), updated);
      resetDrafts();
      toast('Configuración de la plataforma guardada', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar la configuración de la plataforma.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const restoreToEnv = async (key: string, label: string) => {
    const ok = await confirm({
      title: 'Restaurar al valor de .env.prod',
      message: `Se borra el valor de «${label}» guardado desde el panel y vuelve a regir lo que tenga configurado .env.prod en el servidor.`,
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;

    setClearingKey(key);
    try {
      const updated = await api.put<PlatformSettingsView>('/api/v1/admin/platform-settings', {
        clearKeys: [key],
      });
      qc.setQueryData(qk.platformSettings(), updated);
      setTextDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSecretDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (key === s.requireTwoFactorForAdmins.key) setRequire2fa(null);
      if (key === s.aiDisabled.key) setAiDisabled(null);
      toast(`«${label}» volvió al valor de .env.prod`, { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo restaurar el ajuste.'), { variant: 'error' });
    } finally {
      setClearingKey(null);
    }
  };

  const renderTextField = (id: string, label: string, field: PlatformTextField, placeholder?: string) => {
    const val = textDrafts[field.key] ?? field.value;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {label}{' '}
            <code className="ml-1 rounded bg-bg-muted px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
              {field.envVar}
            </code>
          </label>
          <div className="flex items-center gap-2">
            <SourceBadge source={field.source} />
            {field.source === 'database' && (
              <button
                type="button"
                disabled={clearingKey === field.key}
                onClick={() => void restoreToEnv(field.key, label)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Usar .env.prod
              </button>
            )}
          </div>
        </div>
        <Input
          id={id}
          compact
          autoComplete="off"
          placeholder={placeholder ?? 'Sin configurar'}
          value={val}
          onChange={(e) => setTextDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
        />
      </div>
    );
  };

  const renderSecretField = (id: string, label: string, field: PlatformSecretField) => {
    const val = secretDrafts[field.key] ?? '';
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {label}{' '}
            <code className="ml-1 rounded bg-bg-muted px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
              {field.envVar}
            </code>
          </label>
          <div className="flex items-center gap-2">
            {field.configured ? (
              <Badge variant={field.source === 'database' ? 'primary' : 'success'}>
                {field.source === 'database' ? 'En panel' : 'En .env.prod'}
                {field.last4 && <span className="ml-1 font-mono">…{field.last4}</span>}
              </Badge>
            ) : (
              <Badge variant="neutral">Sin clave</Badge>
            )}
            {field.source === 'database' && (
              <button
                type="button"
                disabled={clearingKey === field.key}
                onClick={() => void restoreToEnv(field.key, label)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Usar .env.prod
              </button>
            )}
          </div>
        </div>
        <Input
          id={id}
          compact
          type="password"
          autoComplete="new-password"
          placeholder={
            field.configured ? 'Pegá una clave nueva para reemplazar la actual' : 'Pegá la clave secreta'
          }
          value={val}
          onChange={(e) => setSecretDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Guía rápida: qué va en el panel vs qué queda en .env.prod */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={SETTINGS_CARD}>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <ServerCog className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2>Qué se configura desde acá (en vivo)</h2>
          </div>
          <p className="mt-1.5 text-sm text-fg-muted">
            Las <strong>palancas operativas</strong> (2FA obligatorio, corte general de IA) y las{' '}
            <strong>credenciales de servicios externos</strong> (Resend, Turnstile, Google OAuth, Mercado
            Pago, Mercado Libre, Meta Ads y redes sociales). Se guardan en Postgres con los secretos cifrados
            con <code className="font-mono text-xs">DataProtection</code>. Si cargás un valor acá, pisa en el
            acto al de <code className="font-mono text-xs">.env.prod</code>; si lo restaurás, vuelve a regir{' '}
            <code className="font-mono text-xs">.env.prod</code>.
          </p>
        </section>

        <section className={SETTINGS_CARD}>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2>Qué queda fijo en .env.prod (en el servidor)</h2>
          </div>
          <p className="mt-1.5 text-sm text-fg-muted">
            La <strong>infraestructura de arranque</strong>: contraseña de Postgres, llaves del bucket R2/S3 (
            <code className="font-mono text-xs">MEDIA_*</code>), ruta de las llaves maestras de cifrado,
            dominio raíz, puertos y techos de RAM. Nunca se editan desde la web: así, aunque alguien
            comprometiera una sesión, no podría apuntar la API a otra base ni extraer las llaves del bucket.
          </p>
        </section>
      </div>

      {/* Sección 1: Palancas de operación */}
      <section className={SETTINGS_CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-fg">Palancas de operación</h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              Impactan en el acto en toda la plataforma sin reiniciar contenedores.
            </p>
          </div>
          {data.updatedAtUtc && (
            <span className="text-xs text-fg-subtle">
              Último cambio en panel: {formatDateTime(data.updatedAtUtc)}
              {data.updatedByEmail ? ` por ${data.updatedByEmail}` : ''}
            </span>
          )}
        </div>

        <div className="mt-4 divide-y divide-border">
          <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={effectiveRequire2fa}
                  onChange={setRequire2fa}
                  label="Exigir verificación en dos pasos (2FA) a dueños y administradores"
                />
              </div>
              <p className="text-xs text-fg-muted">
                Si está activa, ningún dueño, administrador ni superadministrador puede usar el panel sin
                configurar su app autenticadora (<code className="font-mono">AUTH_REQUIRE_2FA_ADMINS</code>).
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SourceBadge source={s.requireTwoFactorForAdmins.source} />
              {s.requireTwoFactorForAdmins.source === 'database' && (
                <button
                  type="button"
                  disabled={clearingKey === s.requireTwoFactorForAdmins.key}
                  onClick={() =>
                    void restoreToEnv(
                      s.requireTwoFactorForAdmins.key,
                      'Exigir verificación en dos pasos a dueños y administradores',
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Usar .env.prod
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={effectiveAiDisabled}
                  onChange={setAiDisabled}
                  label="Apagar la inteligencia artificial en todas las tiendas (corte de emergencia)"
                />
              </div>
              <p className="text-xs text-fg-muted">
                Frena en el acto el asistente, las sugerencias de respuestas, el escaneo de facturas y las
                fichas con IA en todas las tiendas (<code className="font-mono">Ai__Disabled</code>).
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SourceBadge source={s.aiDisabled.source} />
              {s.aiDisabled.source === 'database' && (
                <button
                  type="button"
                  disabled={clearingKey === s.aiDisabled.key}
                  onClick={() => void restoreToEnv(s.aiDisabled.key, 'Apagar la inteligencia artificial')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Usar .env.prod
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Sección 2: Credenciales de servicios de la plataforma */}
      <section className={SETTINGS_CARD}>
        <h2 className="text-base font-semibold text-fg">Credenciales de servicios de la plataforma</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Llaves de las aplicaciones centrales de la plataforma. Las claves secretas nunca se devuelven en
          claro: solo se muestran sus últimos cuatro caracteres. Dejá un campo de clave secreta vacío para
          mantener la que ya está guardada.
        </p>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {/* Email / Resend */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Emails transaccionales y campañas (Resend)</h3>
              <p className="text-xs text-fg-muted">
                Envío de correos de cuentas, avisos de compra y campañas de marketing.
              </p>
            </div>
            {renderTextField(
              'plat-email-from',
              'Remitente por defecto',
              srv.email.from,
              'Nombre <no-reply@tudominio.com>',
            )}
            {renderSecretField('plat-email-key', 'API Key de Resend', srv.email.resendApiKey)}
            {renderSecretField('plat-email-webhook', 'Secreto de webhook (Svix)', srv.email.webhookSecret)}
          </div>

          {/* Cloudflare Turnstile */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Protección anti-bots (Cloudflare Turnstile)</h3>
              <p className="text-xs text-fg-muted">
                Protege login, registro, contacto, newsletter, reseñas y «avisame cuando ingrese».
              </p>
            </div>
            {renderTextField('plat-turnstile-site', 'Site Key (pública)', srv.turnstile.siteKey)}
            {renderSecretField('plat-turnstile-secret', 'Secret Key', srv.turnstile.secret)}
          </div>

          {/* Google OAuth */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Ingreso de compradores con Google</h3>
              <p className="text-xs text-fg-muted">
                Credenciales OAuth 2.0 para el botón «Continuar con Google» en las tiendas.
              </p>
            </div>
            {renderTextField('plat-google-id', 'Client ID', srv.google.clientId)}
            {renderSecretField('plat-google-secret', 'Client Secret', srv.google.clientSecret)}
          </div>

          {/* Mercado Pago */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Mercado Pago (app de la plataforma)</h3>
              <p className="text-xs text-fg-muted">
                Permite que cada tienda conecte su cuenta de Mercado Pago por OAuth y valida la firma de los
                webhooks.
              </p>
            </div>
            {renderTextField('plat-mp-id', 'App ID / Client ID', srv.mercadoPago.clientId)}
            {renderSecretField('plat-mp-secret', 'Client Secret', srv.mercadoPago.clientSecret)}
            {renderSecretField(
              'plat-mp-webhook',
              'Secreto de firma de webhooks',
              srv.mercadoPago.webhookSecret,
            )}
          </div>

          {/* Mercado Libre */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Mercado Libre (app de la plataforma)</h3>
              <p className="text-xs text-fg-muted">
                Credenciales de la aplicación de Mercado Libre para vincular cuentas de vendedor.
              </p>
            </div>
            {renderTextField('plat-meli-id', 'App ID / Client ID', srv.mercadoLibre.clientId)}
            {renderSecretField('plat-meli-secret', 'Client Secret', srv.mercadoLibre.clientSecret)}
          </div>

          {/* Meta Ads */}
          <div className="space-y-3 rounded-md border border-border p-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Meta Ads (pauta en Rentabilidad)</h3>
              <p className="text-xs text-fg-muted">
                Aplicación de Meta para importar el gasto publicitario y calcular el ROAS real.
              </p>
            </div>
            {renderTextField('plat-metaads-id', 'App ID', srv.metaAds.appId)}
            {renderSecretField('plat-metaads-secret', 'App Secret', srv.metaAds.appSecret)}
          </div>

          {/* Redes Sociales */}
          <div className="space-y-3 rounded-md border border-border p-4 xl:col-span-2">
            <div>
              <h3 className="text-sm font-semibold text-fg">
                Redes sociales (publicación en Facebook, Instagram y X)
              </h3>
              <p className="text-xs text-fg-muted">
                Aplicaciones OAuth para conectar cuentas de Meta y X desde la sección Redes sociales.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                {renderTextField('plat-social-meta-id', 'Meta App ID', srv.social.metaAppId)}
                {renderSecretField('plat-social-meta-secret', 'Meta App Secret', srv.social.metaAppSecret)}
              </div>
              <div className="space-y-3">
                {renderTextField('plat-social-x-id', 'X (Twitter) Client ID', srv.social.xClientId)}
                {renderSecretField(
                  'plat-social-x-secret',
                  'X (Twitter) Client Secret',
                  srv.social.xClientSecret,
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {dirty && (
            <Button variant="secondary" onClick={resetDrafts} disabled={saving}>
              Descartar cambios
            </Button>
          )}
          <Button onClick={() => void saveAll()} disabled={!dirty || saving}>
            {saving && <Spinner inline />} Guardar configuración de la plataforma
          </Button>
        </div>
      </section>

      {/* Sección 3: Infraestructura fija en .env.prod (solo lectura) */}
      <section className={SETTINGS_CARD}>
        <h2 className="text-base font-semibold text-fg">
          Infraestructura fija en <code className="font-mono text-sm">.env.prod</code> (solo lectura)
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Estas variables pertenecen a la infraestructura del servidor y al arranque de Docker. Se muestran
          acá para que tengas el panorama completo de la instalación sin exponer ninguna contraseña ni llave
          maestra.
        </p>

        <div className="mt-4 divide-y divide-border rounded-md border border-border">
          {data.infrastructure.map((item) => (
            <div
              key={item.key}
              className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-start"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-fg">{item.label}</h3>
                  <code className="rounded bg-bg-muted px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
                    {item.envVar}
                  </code>
                </div>
                <p className="text-xs text-fg-muted">{item.reason}</p>
              </div>
              <div className="shrink-0">
                <Badge variant={item.configured ? 'success' : 'neutral'}>{item.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SaveBar dirty={dirty} onSave={() => void saveAll()} onCancel={resetDrafts} />
    </div>
  );
}
