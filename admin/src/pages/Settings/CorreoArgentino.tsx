import { useState } from 'react';
import { Loader2, Mail, Package } from 'lucide-react';
import { Button, Input, Modal, Select, Switch, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { CarrierCard, useCarrierConfig } from './CarrierCard';

interface CorreoConfig {
  configured: boolean;
  customerId?: string;
  environment?: string;
  originPostalCode?: string;
  defaultWeightGrams?: number;
  defaultLengthCm?: number;
  defaultWidthCm?: number;
  defaultHeightCm?: number;
  offerHomeDelivery?: boolean;
  offerAgencyDelivery?: boolean;
  active?: boolean;
}

interface TestRate {
  deliveredType: string;
  productName: string;
  price: number;
  deliveryTimeMin: string | null;
  deliveryTimeMax: string | null;
}

/**
 * Cotización automática con Correo Argentino (API MiCorreo). La tienda carga
 * sus credenciales una vez y el checkout cotiza solo por código postal.
 * Los tokens nunca vuelven del servidor: los inputs quedan vacíos al editar.
 */
export function CorreoArgentinoCard() {
  const { config, load } = useCarrierConfig<CorreoConfig>('/api/v1/admin/shipping/correo');
  const [open, setOpen] = useState(false);

  if (!config) return null;

  return (
    <>
      <CarrierCard
        className="mt-3"
        icon={<Mail className="h-5 w-5" />}
        title="Correo Argentino"
        tag="Cotización automática"
        extraBadges={
          config.configured &&
          config.environment === 'TEST' && (
            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
              Modo prueba
            </span>
          )
        }
        description={
          config.configured
            ? `El checkout cotiza en vivo por código postal desde el CP ${config.originPostalCode}. Cliente MiCorreo ${config.customerId}.`
            : 'Cotizá el envío en vivo en el checkout con la API oficial MiCorreo: el comprador pone su código postal y ve el precio real, a domicilio o a sucursal.'
        }
        config={config}
        disconnect={{
          url: '/api/v1/admin/shipping/correo',
          confirmMessage:
            'Se borran las credenciales guardadas y el checkout deja de cotizar con Correo Argentino. Los pedidos ya realizados no cambian.',
          successToast: 'Correo Argentino desconectado',
          onDone: load,
        }}
        onConfigure={() => setOpen(true)}
      />

      {open && (
        <ConfigModal
          config={config}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function ConfigModal({
  config,
  onClose,
  onSaved,
}: {
  config: CorreoConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [userToken, setUserToken] = useState('');
  const [passwordToken, setPasswordToken] = useState('');
  const [customerId, setCustomerId] = useState(config.customerId ?? '');
  const [miEmail, setMiEmail] = useState('');
  const [miPassword, setMiPassword] = useState('');
  const [environment, setEnvironment] = useState(config.environment ?? 'TEST');
  const [originCp, setOriginCp] = useState(config.originPostalCode ?? '');
  const [weight, setWeight] = useState(String(config.defaultWeightGrams ?? 500));
  const [length, setLength] = useState(String(config.defaultLengthCm ?? 30));
  const [width, setWidth] = useState(String(config.defaultWidthCm ?? 20));
  const [height, setHeight] = useState(String(config.defaultHeightCm ?? 10));
  const [offerHome, setOfferHome] = useState(config.offerHomeDelivery ?? true);
  const [offerAgency, setOfferAgency] = useState(config.offerAgencyDelivery ?? true);
  const [active, setActive] = useState(config.active ?? true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRates, setTestRates] = useState<TestRate[] | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/v1/admin/shipping/correo', {
        userToken: userToken.trim() || null,
        passwordToken: passwordToken.trim() || null,
        customerId: customerId.trim() || null,
        miCorreoEmail: miEmail.trim() || null,
        miCorreoPassword: miPassword || null,
        environment,
        originPostalCode: originCp.trim(),
        defaultWeightGrams: Number(weight) || 500,
        defaultLengthCm: Number(length) || 30,
        defaultWidthCm: Number(width) || 20,
        defaultHeightCm: Number(height) || 10,
        offerHomeDelivery: offerHome,
        offerAgencyDelivery: offerAgency,
        active,
      });
      toast('Correo Argentino configurado', { variant: 'success' });
      onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar la configuración.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestRates(null);
    try {
      const res = await api.post<{ rates: TestRate[] }>('/api/v1/admin/shipping/correo/test', {});
      setTestRates(res.rates ?? []);
    } catch (err) {
      toast(errMsg(err, 'La cotización de prueba falló.'), { variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const inputHint = config.configured ? 'Guardado — dejá vacío para no cambiarlo' : '';

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Correo Argentino (MiCorreo)"
      footer={
        <>
          {config.configured && (
            <Button variant="secondary" onClick={test} disabled={testing}>
              {testing && <Loader2 className="h-4 w-4 animate-spin" />} Probar cotización
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
        <p className="text-sm text-fg-muted">
          Necesitás una cuenta en{' '}
          <a
            href="https://www.correoargentino.com.ar/MiCorreo/public/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
          >
            MiCorreo
          </a>{' '}
          y las credenciales de API (userToken y passwordToken) que Correo te da por su formulario de
          contacto. Son distintas para prueba y producción.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">userToken</label>
            <Input
              type="password"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder={inputHint || 'Te lo da Correo Argentino'}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">passwordToken</label>
            <Input
              type="password"
              value={passwordToken}
              onChange={(e) => setPasswordToken(e.target.value)}
              placeholder={inputHint || 'Te lo da Correo Argentino'}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Ambiente</label>
            <Select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              options={[
                { value: 'TEST', label: 'Prueba (homologación)' },
                { value: 'PROD', label: 'Producción' },
              ]}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">CP de origen (despacho)</label>
            <Input value={originCp} onChange={(e) => setOriginCp(e.target.value)} placeholder="1704" />
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium text-fg">Tu customerId de MiCorreo</div>
          <p className="mt-0.5 text-xs text-fg-muted">
            Si lo sabés, pegalo directo. Si no, poné tu email y contraseña de MiCorreo y lo buscamos por vos
            (no se guardan: solo se usan una vez para obtener el ID).
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="customerId (ej: 0090000025)"
            />
            <Input
              value={miEmail}
              onChange={(e) => setMiEmail(e.target.value)}
              placeholder="Email de MiCorreo"
            />
            <Input
              type="password"
              value={miPassword}
              onChange={(e) => setMiPassword(e.target.value)}
              placeholder="Contraseña de MiCorreo"
            />
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <Package className="h-4 w-4 text-fg-muted" /> Paquete estimado por unidad
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            Como los productos no tienen peso propio, la cotización estima: peso × cantidad, apilados en alto.
            Límites de Correo: 25 kg y 150 cm por lado.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Peso (g)</label>
              <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Largo (cm)</label>
              <Input value={length} onChange={(e) => setLength(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Ancho (cm)</label>
              <Input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Alto (cm)</label>
              <Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" />
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center justify-between text-sm text-fg">
            Ofrecer envío a domicilio
            <Switch checked={offerHome} onChange={setOfferHome} />
          </label>
          <label className="flex items-center justify-between text-sm text-fg">
            Ofrecer retiro en sucursal de Correo
            <Switch checked={offerAgency} onChange={setOfferAgency} />
          </label>
          <label className="flex items-center justify-between text-sm text-fg">
            Activo (cotizar en el checkout)
            <Switch checked={active} onChange={setActive} />
          </label>
        </div>

        {testRates && (
          <div className="rounded-md border border-border bg-bg-muted/40 p-3 text-sm">
            <div className="font-medium text-fg">
              {testRates.length > 0 ? 'Cotización de prueba OK ✓' : 'Conectó, pero sin tarifas para ese CP.'}
            </div>
            {testRates.map((r, i) => (
              <div key={i} className="mt-1 flex justify-between text-fg-muted">
                <span>
                  {r.productName} — {r.deliveredType === 'S' ? 'sucursal' : 'domicilio'}
                  {r.deliveryTimeMin && ` (${r.deliveryTimeMin}-${r.deliveryTimeMax} días)`}
                </span>
                <span className="font-medium tabular-nums text-fg">$ {r.price.toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
