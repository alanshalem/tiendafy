import { useState } from 'react';
import { Truck } from 'lucide-react';
import { Button, FormField, Input, Modal, Switch, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { CarrierCard, useCarrierConfig } from './CarrierCard';
import { formatNumber } from '../../lib/format';

interface AndreaniConfig {
  configured: boolean;
  username?: string;
  hasPassword?: boolean;
  clientCode?: string | null;
  homeDeliveryContract?: string | null;
  branchPickupContract?: string | null;
  originBranch?: string | null;
  useQa?: boolean;
  volumetricFactor?: number;
  senderName?: string | null;
  senderEmail?: string | null;
  senderDocumentType?: string | null;
  senderDocumentNumber?: string | null;
  senderPhone?: string | null;
  originStreet?: string | null;
  originNumber?: string | null;
  originCity?: string | null;
  originPostalCode?: string | null;
  defaultWeightGrams?: number;
  defaultLengthCm?: number;
  defaultWidthCm?: number;
  defaultHeightCm?: number;
  active?: boolean;
  canCreateShipments?: boolean;
  unitVolumeCm?: number;
}

export function AndreaniCard() {
  const { config, load } = useCarrierConfig<AndreaniConfig>('/api/v1/admin/shipping/andreani');
  const [open, setOpen] = useState(false);

  if (!config) return null;

  return (
    <>
      <CarrierCard
        className="mt-3"
        icon={<Truck className="h-5 w-5" />}
        title="Andreani"
        tag="Correo privado"
        extraBadges={
          config.configured && !config.canCreateShipments ? (
            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-2xs font-semibold text-warning">
              Faltan datos del remitente
            </span>
          ) : null
        }
        description={
          config.configured
            ? `Contrato ${config.homeDeliveryContract ?? config.branchPickupContract}. El checkout cotiza en vivo por código postal y los envíos se generan desde la venta, con etiqueta PDF.`
            : 'El correo privado con más cobertura del país. Cotización en el checkout, generación del envío desde la venta, etiqueta y seguimiento.'
        }
        config={config}
        disconnect={{
          url: '/api/v1/admin/shipping/andreani',
          confirmMessage:
            'Se borran las credenciales y el checkout deja de cotizar con Andreani. Los envíos ya generados siguen su curso: Andreani no tiene forma de cancelarlos por API.',
          successToast: 'Andreani desconectado',
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
  config: AndreaniConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  const [username, setUsername] = useState(config.username ?? '');
  const [password, setPassword] = useState('');
  const [clientCode, setClientCode] = useState(config.clientCode ?? '');
  const [homeContract, setHomeContract] = useState(config.homeDeliveryContract ?? '');
  const [branchContract, setBranchContract] = useState(config.branchPickupContract ?? '');
  const [originBranch, setOriginBranch] = useState(config.originBranch ?? '');
  const [useQa, setUseQa] = useState(config.useQa ?? false);

  const [senderName, setSenderName] = useState(config.senderName ?? '');
  const [senderEmail, setSenderEmail] = useState(config.senderEmail ?? '');
  const [senderDocType, setSenderDocType] = useState(config.senderDocumentType ?? 'CUIT');
  const [senderDocNumber, setSenderDocNumber] = useState(config.senderDocumentNumber ?? '');
  const [senderPhone, setSenderPhone] = useState(config.senderPhone ?? '');
  const [originStreet, setOriginStreet] = useState(config.originStreet ?? '');
  const [originNumber, setOriginNumber] = useState(config.originNumber ?? '');
  const [originCity, setOriginCity] = useState(config.originCity ?? '');
  const [originZip, setOriginZip] = useState(config.originPostalCode ?? '');

  const [weight, setWeight] = useState(String(config.defaultWeightGrams ?? 1000));
  const [length, setLength] = useState(String(config.defaultLengthCm ?? 30));
  const [width, setWidth] = useState(String(config.defaultWidthCm ?? 20));
  const [height, setHeight] = useState(String(config.defaultHeightCm ?? 15));
  const [active, setActive] = useState(config.active ?? true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const volume = (Number(length) || 0) * (Number(width) || 0) * (Number(height) || 0);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/v1/admin/shipping/andreani', {
        username: username.trim(),
        password: password || null,
        clientCode: clientCode.trim() || null,
        homeDeliveryContract: homeContract.trim() || null,
        branchPickupContract: branchContract.trim() || null,
        originBranch: originBranch.trim() || null,
        useQa,
        volumetricFactor: null,
        senderName: senderName.trim() || null,
        senderEmail: senderEmail.trim() || null,
        senderDocumentType: senderDocType.trim() || null,
        senderDocumentNumber: senderDocNumber.trim() || null,
        senderPhone: senderPhone.trim() || null,
        originStreet: originStreet.trim() || null,
        originNumber: originNumber.trim() || null,
        originCity: originCity.trim() || null,
        originPostalCode: originZip.trim() || null,
        weightGrams: Number(weight) || 1000,
        lengthCm: Number(length) || 30,
        widthCm: Number(width) || 20,
        heightCm: Number(height) || 15,
        active,
      });
      toast('Andreani configurado', { variant: 'success' });
      onSaved();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar la configuración.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await api.post<{ ok: boolean; message: string }>(
        '/api/v1/admin/shipping/andreani/test',
        {},
      );
      toast(res.message, { variant: res.ok ? 'success' : 'error' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo probar la conexión.'), { variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Configurar Andreani"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {config.configured && (
            <Button variant="secondary" onClick={test} loading={testing}>
              Probar conexión
            </Button>
          )}
          <Button onClick={save} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Credenciales</h3>
          <p className="text-xs text-fg-muted">
            Andreani no tiene registro autogestionado: el usuario, la contraseña y los contratos te los da tu
            ejecutivo comercial al dar de alta el servicio.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Usuario">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </FormField>
            <FormField
              label={config.hasPassword ? 'Contraseña (ya cargada)' : 'Contraseña'}
              hint={config.hasPassword ? 'Dejala vacía para conservar la actual.' : undefined}
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={config.hasPassword ? '••••••••' : ''}
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Código de cliente" hint="10 dígitos, sin el prefijo CL.">
              <Input value={clientCode} onChange={(e) => setClientCode(e.target.value)} />
            </FormField>
            <FormField label="Sucursal de imposición" hint="Nomenclatura, por ejemplo PRC.">
              <Input value={originBranch} onChange={(e) => setOriginBranch(e.target.value)} />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Contratos</h3>
          <p className="text-xs text-fg-muted">
            Cada modalidad de entrega es un contrato distinto de Andreani, y es el contrato el que define la
            tarifa. Cargá los que tengas: si solo tenés uno, el checkout ofrece esa sola opción.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Contrato · entrega a domicilio">
              <Input
                value={homeContract}
                onChange={(e) => setHomeContract(e.target.value)}
                placeholder="300006611"
              />
            </FormField>
            <FormField label="Contrato · retiro en sucursal">
              <Input
                value={branchContract}
                onChange={(e) => setBranchContract(e.target.value)}
                placeholder="Opcional"
              />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Remitente y origen</h3>
          <p className="text-xs text-fg-muted">
            Van en cada envío que se genera. Sin estos datos podés cotizar, pero no despachar.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Razón social o nombre">
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={40} />
            </FormField>
            <FormField label="Email" hint="Andreani corta en 40 caracteres.">
              <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} maxLength={40} />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Tipo de documento">
              <Input
                value={senderDocType}
                onChange={(e) => setSenderDocType(e.target.value)}
                placeholder="CUIT"
              />
            </FormField>
            <FormField label="Número">
              <Input value={senderDocNumber} onChange={(e) => setSenderDocNumber(e.target.value)} />
            </FormField>
            <FormField label="Teléfono">
              <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Calle" className="sm:col-span-2">
              <Input value={originStreet} onChange={(e) => setOriginStreet(e.target.value)} />
            </FormField>
            <FormField label="Número">
              <Input value={originNumber} onChange={(e) => setOriginNumber(e.target.value)} />
            </FormField>
            <FormField label="Código postal">
              <Input value={originZip} onChange={(e) => setOriginZip(e.target.value)} maxLength={4} />
            </FormField>
          </div>

          <FormField label="Localidad" hint="Tiene que escribirse igual que en el catálogo de Andreani.">
            <Input value={originCity} onChange={(e) => setOriginCity(e.target.value)} />
          </FormField>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Paquete por unidad</h3>
          <p className="text-xs text-fg-muted">
            Andreani cobra por el mayor entre el peso real y el volumétrico, así que las medidas cambian el
            precio tanto como el peso.
          </p>

          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Peso (g)">
              <Input
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
              />
            </FormField>
            <FormField label="Largo (cm)">
              <Input
                value={length}
                onChange={(e) => setLength(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
              />
            </FormField>
            <FormField label="Ancho (cm)">
              <Input
                value={width}
                onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
              />
            </FormField>
            <FormField label="Alto (cm)">
              <Input
                value={height}
                onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
              />
            </FormField>
          </div>

          <p className="text-xs text-fg-subtle">
            Volumen por unidad: {formatNumber(volume)} cm³
            {volume > 999999 && (
              <span className="ml-1 font-medium text-danger">
                — supera el máximo que acepta Andreani (aprox. 1 m³).
              </span>
            )}
          </p>
        </section>

        <div className="space-y-2 border-t border-border pt-4">
          <Switch checked={active} onChange={setActive} label="Ofrecer Andreani en el checkout" />
          <Switch
            checked={useQa}
            onChange={setUseQa}
            label="Usar el ambiente de pruebas (QA)"
            description="Las tarifas y los envíos no son reales. Requiere que Andreani te habilite QA."
          />
        </div>
      </div>
    </Modal>
  );
}
