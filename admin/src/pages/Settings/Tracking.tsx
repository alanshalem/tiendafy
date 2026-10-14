import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Eye, Megaphone, MousePointerClick, ShieldCheck } from 'lucide-react';
import { Button, Input, Switch, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { SETTINGS_CARD, SETTINGS_COLUMNS } from '../../lib/styles';
import { BRAND } from '../../lib/runtime';
import { useServerLoad } from '../../lib/useServerLoad';
import { TableSkeleton } from '../../components/Skeleton';

interface Tracking {
  enabled: boolean;
  requireConsent: boolean;
  ga4Id: string | null;
  googleAdsId: string | null;
  metaPixelId: string | null;
  clarityId: string | null;
  updatedAtUtc: string | null;
}

const DEFAULTS: Tracking = {
  enabled: true,
  requireConsent: true,
  ga4Id: '',
  googleAdsId: '',
  metaPixelId: '',
  clarityId: '',
  updatedAtUtc: null,
};

/**
 * Herramientas de medición de la tienda.
 *
 * Se pide el identificador de cada servicio y nunca un fragmento de código. Es
 * una decisión de seguridad, no de comodidad: el formulario de tarjeta está
 * embebido en el checkout, así que un &lt;script&gt; ajeno en esa página es la
 * forma en que se roban tarjetas en el comercio electrónico. Con un
 * identificador no hay nada que ejecutar — el cargador lo escribe la tienda.
 */
export function TrackingPage() {
  const { store } = useStore();
  const { toast } = useToast();

  const [value, setValue] = useState<Tracking>(DEFAULTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const { loading, reload: load } = useServerLoad(
    store?.id ?? null,
    () => api.get<Tracking>('/api/v1/admin/tracking/'),
    (d) => {
      setValue({
        ...DEFAULTS,
        ...d,
        ga4Id: d.ga4Id ?? '',
        googleAdsId: d.googleAdsId ?? '',
        metaPixelId: d.metaPixelId ?? '',
        clarityId: d.clarityId ?? '',
      });
      setDirty(false);
      setLoadError(null);
    },
    (err) => setLoadError(errMsg(err, 'No se pudo cargar la configuración de medición.')),
  );

  const update = (patch: Partial<Tracking>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/v1/admin/tracking/', {
        enabled: value.enabled,
        requireConsent: value.requireConsent,
        ga4Id: value.ga4Id?.trim() || null,
        googleAdsId: value.googleAdsId?.trim() || null,
        metaPixelId: value.metaPixelId?.trim() || null,
        clarityId: value.clarityId?.trim() || null,
      });
      toast('Configuración guardada', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError)
    return (
      <div>
        <SettingsHeader title="Medición y píxeles" description="Google, Meta y Clarity en tu tienda." />
        <div className={SETTINGS_CARD}>
          <p className="text-sm text-danger">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={load}>
            Reintentar
          </Button>
        </div>
      </div>
    );

  if (loading)
    return (
      <div>
        <SettingsHeader title="Medición y píxeles" description="Google, Meta y Clarity en tu tienda." />
        <div className={SETTINGS_CARD}>
          <TableSkeleton rows={4} label="Cargando medición…" />
        </div>
      </div>
    );

  const configured = [value.ga4Id, value.googleAdsId, value.metaPixelId, value.clarityId].filter((v) =>
    v?.trim(),
  ).length;

  return (
    <div className="pb-20">
      <SettingsHeader
        title="Medición y píxeles"
        description="Conectá tu tienda con las herramientas que miden visitas y campañas. Se pide el identificador de cada servicio, no el código."
      />

      <div className={SETTINGS_COLUMNS}>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-subtle px-4 py-3 2xl:col-span-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-sm text-fg-muted">
            Nunca vas a tener que pegar un <code className="text-fg">&lt;script&gt;</code> acá. El código lo
            escribe {BRAND} con lo que cargues, y ninguna de estas herramientas se carga en la pantalla de
            pago: ahí va el número de tarjeta de tu cliente y no entra nada de afuera.
          </p>
        </div>

        <Field
          icon={<BarChart3 className="h-4 w-4" />}
          title="Google Analytics 4"
          help="Cuánta gente entra, de dónde viene y qué mira. El identificador está en Administrar → Flujos de datos."
          placeholder="G-ABCD123456"
          value={value.ga4Id ?? ''}
          onChange={(ga4Id) => update({ ga4Id })}
        />

        <Field
          icon={<MousePointerClick className="h-4 w-4" />}
          title="Google Ads"
          help="Para medir qué avisos terminan en venta. Es el ID de la etiqueta de Google, en Herramientas → Etiqueta de Google."
          placeholder="AW-123456789"
          value={value.googleAdsId ?? ''}
          onChange={(googleAdsId) => update({ googleAdsId })}
        />

        <Field
          icon={<Megaphone className="h-4 w-4" />}
          title="Píxel de Meta"
          help="Para las campañas de Facebook e Instagram: le devuelve a Meta qué avisos terminaron en compra. Está en el Administrador de eventos."
          placeholder="123456789012345"
          value={value.metaPixelId ?? ''}
          onChange={(metaPixelId) => update({ metaPixelId })}
        />

        <Field
          icon={<Eye className="h-4 w-4" />}
          title="Microsoft Clarity"
          help="Grabaciones de sesión y mapas de calor, gratis. Sirve para ver dónde se traba la gente en el checkout."
          placeholder="abcd1efg2h"
          value={value.clarityId ?? ''}
          onChange={(clarityId) => update({ clarityId })}
        />

        <div className={`${SETTINGS_CARD} 2xl:col-span-2`}>
          <h3 className="text-base font-semibold text-fg">Permiso del visitante</h3>
          <div className="mt-3 space-y-4">
            <Switch
              checked={value.requireConsent}
              onChange={(requireConsent) => update({ requireConsent })}
              label="Pedir permiso antes de medir"
              description="Muestra un aviso abajo de todo y no carga nada hasta que la persona acepte. Si el navegador manda la señal de “no me rastrees”, se toma como un no y ni se pregunta."
            />
            <Switch
              checked={value.enabled}
              onChange={(enabled) => update({ enabled })}
              label="Medición encendida"
              description="Apagalo para cortar todo de golpe sin perder lo que cargaste. Sirve si algo se rompe o hay que dejar la tienda limpia por un rato."
            />
          </div>
          {value.requireConsent && configured > 0 && (
            <p className="mt-3 text-xs text-fg-muted">
              El aviso aparece solo si hay algo que consentir, y nunca en la pantalla de pago. Acordate de
              nombrar estas herramientas en tu política de privacidad: se edita como una{' '}
              <Link to="/paginas" className="text-primary hover:underline">
                página de contenido
              </Link>{' '}
              con la dirección «privacidad».
            </p>
          )}
        </div>

        {value.updatedAtUtc && (
          <p className="text-xs text-fg-subtle">
            Última modificación: {formatDateTime(value.updatedAtUtc)}. Queda registrado quién la hizo.
          </p>
        )}
      </div>

      <HelpLink id="externalCodes" />

      <SaveBar dirty={dirty && !saving} onSave={save} />
    </div>
  );
}

function Field({
  icon,
  title,
  help,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  help: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const on = value.trim().length > 0;
  return (
    <div className={SETTINGS_CARD}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            on ? 'bg-success-bg text-success' : 'bg-bg-muted text-fg-muted'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-fg">{title}</h3>
            {on && (
              <span className="rounded-full bg-success-bg px-2 py-0.5 text-2xs font-semibold text-success">
                Activo
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">{help}</p>
          <div className="mt-3">
            <Input
              aria-label={title}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
