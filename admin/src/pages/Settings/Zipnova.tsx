import { useState, useId } from 'react';
import { Loader2, Package, Zap } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, Switch, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { CarrierCard, useCarrierConfig } from './CarrierCard';
import { formatNumber } from '../../lib/format';

interface ZipnovaConfig {
  configured: boolean;
  country?: string;
  accountId?: number;
  originId?: string;
  defaultWeightGrams?: number;
  defaultLengthCm?: number;
  defaultWidthCm?: number;
  defaultHeightCm?: number;
  active?: boolean;
}

interface TestOption {
  carrier: string | null;
  service: string | null;
  logisticType: string | null;
  price: number;
  estimatedDelivery: string | null;
}

/**
 * Cotización multi-transporte con Zipnova (Andreani, OCA, etc. detrás de una
 * sola API). El checkout cotiza en vivo y los envíos se crean desde la venta,
 * con etiqueta PDF. OJO: crear envíos consume saldo real, salvo que soporte
 * de Zipnova habilite la modalidad "testing" en la cuenta (cotizar es gratis).
 */
export function ZipnovaCard() {
  const { config, load } = useCarrierConfig<ZipnovaConfig>('/api/v1/admin/shipping/zipnova');
  const [open, setOpen] = useState(false);

  if (!config) return null;

  return (
    <>
      <CarrierCard
        className="mt-3"
        icon={<Zap className="h-5 w-5" />}
        title="Zipnova"
        tag="Multi-transporte"
        description={
          config.configured
            ? `Cuenta ${config.accountId} (${config.country}). El checkout cotiza en vivo con los transportes de tu cuenta; los envíos se crean desde la venta con etiqueta PDF.`
            : 'Andreani, OCA y más transportes detrás de una sola API: el comprador ve el precio real por código postal y vos creás el envío con etiqueta desde la venta.'
        }
        config={config}
        disconnect={{
          url: '/api/v1/admin/shipping/zipnova',
          confirmMessage:
            'Se borran las credenciales guardadas y el checkout deja de cotizar con Zipnova. Los envíos ya creados siguen viviendo en tu cuenta de Zipnova.',
          successToast: 'Zipnova desconectado',
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
  config: ZipnovaConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fid = useId();
  const { toast } = useToast();
  const [apiToken, setApiToken] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [country, setCountry] = useState(config.country ?? 'AR');
  const [accountId, setAccountId] = useState(config.accountId ? String(config.accountId) : '');
  const [originId, setOriginId] = useState(config.originId === 'auto' ? '' : (config.originId ?? ''));
  const [weight, setWeight] = useState(String(config.defaultWeightGrams ?? 500));
  const [length, setLength] = useState(String(config.defaultLengthCm ?? 30));
  const [width, setWidth] = useState(String(config.defaultWidthCm ?? 20));
  const [height, setHeight] = useState(String(config.defaultHeightCm ?? 10));
  const [active, setActive] = useState(config.active ?? true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testCity, setTestCity] = useState('Rosario');
  const [testState, setTestState] = useState('Santa Fe');
  const [testZip, setTestZip] = useState('2000');
  const [testOptions, setTestOptions] = useState<TestOption[] | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/v1/admin/shipping/zipnova', {
        apiToken: apiToken.trim() || null,
        apiSecret: apiSecret || null,
        country,
        accountId: Number(accountId) || 0,
        originId: originId.trim() || null,
        defaultWeightGrams: Number(weight) || 500,
        defaultLengthCm: Number(length) || 30,
        defaultWidthCm: Number(width) || 20,
        defaultHeightCm: Number(height) || 10,
        active,
      });
      toast('Zipnova configurado', { variant: 'success' });
      onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar la configuración.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestOptions(null);
    try {
      const res = await api.post<{ options: TestOption[] }>('/api/v1/admin/shipping/zipnova/test', {
        city: testCity.trim(),
        state: testState.trim(),
        zipcode: testZip.trim(),
      });
      setTestOptions(res.options ?? []);
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
      title="Zipnova"
      footer={
        <>
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
          Las credenciales se generan en tu panel de Zipnova: Configuración → Integraciones → Gestionar
          credenciales. Ahí mismo ves tu número de cuenta.{' '}
          <span className="font-medium text-fg">
            Cotizar es gratis, pero crear un envío es real y consume saldo (salvo que soporte de Zipnova te
            habilite la modalidad de prueba “testing”).
          </span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
              API Token
            </label>
            <Input
              id={`${fid}-1`}
              aria-label="API Token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={inputHint || 'Del panel de Zipnova'}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-2`} className="mb-1.5 block text-sm font-medium text-fg">
              API Secret
            </label>
            <Input
              id={`${fid}-2`}
              aria-label="API Secret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={inputHint || 'Del panel de Zipnova'}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-3`} className="mb-1.5 block text-sm font-medium text-fg">
              País de la cuenta
            </label>
            <Select
              id={`${fid}-3`}
              aria-label="País de la cuenta"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              options={[
                { value: 'AR', label: 'Argentina' },
                { value: 'CL', label: 'Chile' },
                { value: 'MX', label: 'México' },
              ]}
            />
          </div>
          <div>
            <label htmlFor={`${fid}-4`} className="mb-1.5 block text-sm font-medium text-fg">
              ID de cuenta
            </label>
            <Input
              id={`${fid}-4`}
              aria-label="ID de cuenta"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              inputMode="numeric"
              placeholder="Ej: 4821"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${fid}-5`} className="mb-1.5 block text-sm font-medium text-fg">
              Origen (ID del address book) — opcional
            </label>
            <Input
              id={`${fid}-5`}
              aria-label="Origen (ID del address book) — opcional"
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
              placeholder="Vacío = origen por defecto de la cuenta"
            />
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <Package className="h-4 w-4 text-fg-muted" /> Paquete estimado por unidad
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            La cotización arma un paquete por unidad del carrito con estas medidas (en cm y gramos).
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label htmlFor={`${fid}-6`} className="mb-1 block text-xs text-fg-muted">
                Peso (g)
              </label>
              <Input
                id={`${fid}-6`}
                aria-label="Peso (g)"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-7`} className="mb-1 block text-xs text-fg-muted">
                Largo (cm)
              </label>
              <Input
                id={`${fid}-7`}
                aria-label="Largo (cm)"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-8`} className="mb-1 block text-xs text-fg-muted">
                Ancho (cm)
              </label>
              <Input
                id={`${fid}-8`}
                aria-label="Ancho (cm)"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <label htmlFor={`${fid}-9`} className="mb-1 block text-xs text-fg-muted">
                Alto (cm)
              </label>
              <Input
                id={`${fid}-9`}
                aria-label="Alto (cm)"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <label className="flex items-center justify-between text-sm text-fg">
          Activo (cotizar en el checkout)
          <Switch checked={active} onChange={setActive} />
        </label>

        {config.configured && (
          <div className="rounded-md border border-border p-3">
            <div className="text-sm font-medium text-fg">Probar cotización (gratis, no crea nada)</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <FormField label="Ciudad">
                <Input value={testCity} onChange={(e) => setTestCity(e.target.value)} placeholder="Ciudad" />
              </FormField>
              <FormField label="Provincia">
                <Input
                  value={testState}
                  onChange={(e) => setTestState(e.target.value)}
                  placeholder="Provincia"
                />
              </FormField>
              <FormField label="CP">
                <Input value={testZip} onChange={(e) => setTestZip(e.target.value)} placeholder="CP" />
              </FormField>
            </div>
            <Button variant="secondary" className="mt-2" onClick={test} disabled={testing}>
              {testing && <Loader2 className="h-4 w-4 animate-spin" />} Cotizar
            </Button>
            {testOptions && (
              <div className="mt-2 text-sm">
                {testOptions.length === 0 && (
                  <p className="text-fg-muted">Conectó, pero sin opciones para ese destino.</p>
                )}
                {testOptions.map((o, i) => (
                  <div key={i} className="flex justify-between text-fg-muted">
                    <span>
                      {o.carrier} — {o.service}
                    </span>
                    <span className="font-medium tabular-nums text-fg">$ {formatNumber(o.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
