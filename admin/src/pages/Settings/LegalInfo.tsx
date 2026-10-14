import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Radio, RadioGroup, Switch, useToast } from '@tiendafy/ui';
import { formatMoney } from '@tiendafy/types';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { MediaUpload } from '../../components/upload/MediaUpload';
import { SETTINGS_CARD, SETTINGS_COLUMNS } from '../../lib/styles';
import { useServerLoad } from '../../lib/useServerLoad';
import { TableSkeleton } from '../../components/Skeleton';

type Condition = 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';

interface LegalInfo {
  legalName: string | null;
  cuit: string | null;
  address: string | null;
  condition: Condition;
  vatRatePercent: number;
  otherNationalTaxesPercent: number;
  showPriceWithoutTaxes: boolean;
  dataFiscalUrl: string | null;
  dataFiscalImageUrl: string | null;
}

interface LegalResponse extends LegalInfo {
  configured: boolean;
  /** Lo que ya se cargó en Facturación, para no pedirlo dos veces. */
  fromInvoicing: { legalName: string; cuit: string; condition: Condition } | null;
}

const DEFAULTS: LegalInfo = {
  legalName: '',
  cuit: '',
  address: '',
  condition: 'RESPONSABLE_INSCRIPTO',
  vatRatePercent: 21,
  otherNationalTaxesPercent: 0,
  showPriceWithoutTaxes: true,
  dataFiscalUrl: '',
  dataFiscalImageUrl: '',
};

/** Alícuotas de IVA vigentes que puede tener lo que vende una tienda. */
const VAT_RATES = [21, 10.5, 27, 5, 2.5, 0];

/** El precio de ejemplo de la vista previa: $12.100. */
const SAMPLE = 12_100_00;

/**
 * Lo que la tienda tiene que mostrar de sí misma: quién vende (en el pie) y
 * el "precio sin impuestos nacionales" debajo de cada precio (Ley 27.743).
 */
export function LegalInfoPage() {
  const fid = useId();
  const { store } = useStore();
  const { toast } = useToast();
  const [value, setValue] = useState<LegalInfo>(DEFAULTS);
  const [fromInvoicing, setFromInvoicing] = useState<LegalResponse['fromInvoicing']>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const apply = (d: LegalResponse) => {
    const inv = d.fromInvoicing;
    // Sin nada guardado todavía, se sugiere lo que ya está en Facturación.
    setValue({
      legalName: d.legalName ?? inv?.legalName ?? '',
      cuit: d.cuit ?? inv?.cuit ?? '',
      address: d.address ?? '',
      condition: d.condition ?? DEFAULTS.condition,
      vatRatePercent: d.vatRatePercent ?? DEFAULTS.vatRatePercent,
      otherNationalTaxesPercent: d.otherNationalTaxesPercent ?? 0,
      showPriceWithoutTaxes: d.showPriceWithoutTaxes ?? true,
      dataFiscalUrl: d.dataFiscalUrl ?? '',
      dataFiscalImageUrl: d.dataFiscalImageUrl ?? '',
    });
    setFromInvoicing(inv);
    setDirty(false);
    setLoadError(null);
  };

  const { loading, reload } = useServerLoad(
    store?.id ?? null,
    () => api.get<LegalResponse>('/api/v1/admin/store-legal/'),
    apply,
    (err) => setLoadError(errMsg(err, 'No se pudieron cargar los datos legales.')),
  );

  const update = (patch: Partial<LegalInfo>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      apply(await api.put<LegalResponse>('/api/v1/admin/store-legal/', value));
      toast('Datos legales guardados', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar los datos legales.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <SettingsHeader
      title="Datos legales"
      description="Quién vende y cómo se informa el precio sin impuestos: lo que la ley pide mostrar en la tienda."
    />
  );

  if (loadError)
    return (
      <div>
        {header}
        <div className={SETTINGS_CARD}>
          <p className="text-sm text-danger">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={reload}>
            Reintentar
          </Button>
        </div>
      </div>
    );

  if (loading)
    return (
      <div>
        {header}
        <div className={SETTINGS_CARD}>
          <TableSkeleton rows={4} label="Cargando datos legales…" />
        </div>
      </div>
    );

  const ri = value.condition === 'RESPONSABLE_INSCRIPTO';
  const divisor = ri ? 1 + (Number(value.vatRatePercent) + Number(value.otherNationalTaxesPercent)) / 100 : 1;
  const sampleNet = Math.round(SAMPLE / divisor);

  return (
    <div className="pb-20">
      {header}

      <div className={SETTINGS_COLUMNS}>
        <div className={SETTINGS_CARD}>
          <h3 className="text-base font-semibold text-fg">Quién vende</h3>
          <p className="mt-0.5 text-sm text-fg-muted">
            Se muestra en el renglón legal del pie de la tienda. Tiene que coincidir con lo que figura en
            ARCA.
          </p>
          {fromInvoicing && (
            <p className="mt-2 text-xs text-fg-muted">
              Lo que no completes se toma de{' '}
              <Link to="/configuracion/facturacion" className="text-primary hover:underline">
                Facturación
              </Link>
              .
            </p>
          )}
          <div className="mt-4 space-y-3">
            <Field id={`${fid}-name`} label="Razón social (o nombre y apellido)">
              <Input
                id={`${fid}-name`}
                value={value.legalName ?? ''}
                maxLength={200}
                onChange={(e) => update({ legalName: e.target.value })}
                placeholder="Importadora Ejemplo S.A."
              />
            </Field>
            <Field id={`${fid}-cuit`} label="CUIT">
              <Input
                id={`${fid}-cuit`}
                value={value.cuit ?? ''}
                inputMode="numeric"
                maxLength={13}
                onChange={(e) => update({ cuit: e.target.value })}
                placeholder="30-12345678-9"
              />
            </Field>
            <Field id={`${fid}-address`} label="Domicilio">
              <Input
                id={`${fid}-address`}
                value={value.address ?? ''}
                maxLength={300}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="Av. Corrientes 1234, CABA"
              />
            </Field>
          </div>
        </div>

        <div className={SETTINGS_CARD}>
          <h3 className="text-base font-semibold text-fg">QR de Data Fiscal (ARCA)</h3>
          <p className="mt-0.5 text-sm text-fg-muted">
            ARCA lo da en el trámite “Data Fiscal” (formulario 960/D) con tu clave fiscal. Pegá el link del QR
            o subí la imagen; va en el pie, al lado de tus datos.
          </p>
          <div className="mt-4 space-y-3">
            <Field id={`${fid}-qr`} label="Link del QR">
              <Input
                id={`${fid}-qr`}
                value={value.dataFiscalUrl ?? ''}
                maxLength={500}
                onChange={(e) => update({ dataFiscalUrl: e.target.value })}
                placeholder="https://servicios1.afip.gov.ar/clavefiscal/qr/response.aspx?qr=…"
              />
            </Field>
            <MediaUpload
              kind="dataFiscalQr"
              label="Elegir imagen del QR"
              value={value.dataFiscalImageUrl ?? ''}
              onChange={(url) => update({ dataFiscalImageUrl: url })}
            />
          </div>
        </div>

        <div className={SETTINGS_CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-fg">Precio sin impuestos nacionales</h3>
              <p className="mt-0.5 text-sm text-fg-muted">
                La Ley 27.743 (transparencia fiscal) pide informar, debajo del precio final y con letra menor,
                el precio sin IVA ni otros impuestos nacionales indirectos.
              </p>
            </div>
            <Switch
              aria-label="Mostrar el precio sin impuestos nacionales"
              checked={value.showPriceWithoutTaxes}
              onChange={(showPriceWithoutTaxes) => update({ showPriceWithoutTaxes })}
            />
          </div>

          <div className="mt-4 space-y-4">
            <RadioGroup legend="Condición frente al IVA">
              {(
                [
                  [
                    'RESPONSABLE_INSCRIPTO',
                    'Responsable Inscripto',
                    'El precio se divide por 1 + IVA (+ otros impuestos nacionales).',
                  ],
                  [
                    'MONOTRIBUTO',
                    'Monotributo',
                    'No discriminás IVA: el precio sin impuestos es el mismo precio.',
                  ],
                  ['EXENTO', 'Exento', 'No cobrás IVA: el precio sin impuestos es el mismo precio.'],
                ] as const
              ).map(([id, label, hint]) => (
                <div key={id}>
                  <Radio
                    name={`${fid}-cond`}
                    label={label}
                    checked={value.condition === id}
                    onChange={() => update({ condition: id })}
                  />
                  <p className="ml-6 text-xs text-fg-muted">{hint}</p>
                </div>
              ))}
            </RadioGroup>

            {ri && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={`${fid}-vat`} label="IVA de lo que vendés">
                  <select
                    id={`${fid}-vat`}
                    value={value.vatRatePercent}
                    onChange={(e) => update({ vatRatePercent: Number(e.target.value) })}
                    className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
                  >
                    {VAT_RATES.map((r) => (
                      <option key={r} value={r}>
                        {String(r).replace('.', ',')} %
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${fid}-other`} label="Otros impuestos nacionales (%)">
                  <Input
                    id={`${fid}-other`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={value.otherNationalTaxesPercent}
                    onChange={(e) => update({ otherNationalTaxesPercent: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
            )}

            <div className="rounded-md border border-border bg-fg/[0.03] p-3 text-sm">
              <div className="font-semibold text-fg">{formatMoney(SAMPLE, 'ARS')}</div>
              {value.showPriceWithoutTaxes ? (
                <div className="text-xs text-fg-muted">
                  Precio sin impuestos nacionales: {formatMoney(sampleNet, 'ARS')}
                </div>
              ) : (
                <div className="text-xs text-fg-muted">(la leyenda está apagada)</div>
              )}
              <p className="mt-2 text-xs text-fg-subtle">
                Así se ve debajo de cada precio, en la ficha y en el listado.
              </p>
            </div>
          </div>
        </div>
      </div>

      <HelpLink id="datosLegales" />
      <SaveBar dirty={dirty && !saving} onSave={save} />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}
