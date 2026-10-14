import { useState } from 'react';
import { AlertTriangle, Landmark } from 'lucide-react';
import { Button, FormField, Input, Select, Switch, Textarea, useToast } from '@tiendafy/ui';
import type { MoneyDto } from '@tiendafy/types';
import { api, errMsg } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { Helper } from './Helper';
import { TableSkeleton } from '../../components/Skeleton';
import { useServerLoad } from '../../lib/useServerLoad';

/** Lo que guarda y devuelve /admin/payments/options. */
interface PaymentOptions {
  transferEnabled: boolean;
  discountPercent: number;
  bankName: string | null;
  accountHolder: string | null;
  holderTaxId: string | null;
  cbu: string | null;
  alias: string | null;
  instructions: string | null;
  holdHours: number;
  cashOnPickupEnabled: boolean;
  installmentsMax: number;
  installmentsNote: string | null;
}

interface PaymentOptionsDto extends PaymentOptions {
  /** false = nunca se guardó: la tienda muestra lo que tenía el diseño. */
  configured: boolean;
  /** Lo que anuncia el diseño publicado (de antes de esta pantalla). */
  legacyTheme: { cashDiscountPercent: number; installments: number; freeShippingThreshold: MoneyDto | null };
  /** Las cuotas más largas que se ofrecen con Payway, si está conectado. */
  paywayMaxInstallments: number | null;
}

const EMPTY: PaymentOptions = {
  transferEnabled: false,
  discountPercent: 0,
  bankName: '',
  accountHolder: '',
  holderTaxId: '',
  cbu: '',
  alias: '',
  instructions: '',
  holdHours: 48,
  cashOnPickupEnabled: false,
  installmentsMax: 0,
  installmentsNote: '',
};

const HOLD_CHOICES = [12, 24, 48, 72, 96, 168];
const INSTALLMENT_CHOICES = [0, 3, 6, 9, 12, 18, 24];

/**
 * Lo que la tienda promete sobre cómo se le paga: el descuento por
 * transferencia (con los datos de la cuenta y cuánto se guarda el stock), el
 * efectivo al retirar y las cuotas sin interés que se anuncian.
 *
 * Es la única fuente de esos números: la ficha del producto, las tarjetas del
 * listado y el checkout los leen de acá. Antes el descuento era un número del
 * diseño y el checkout no ofrecía transferencia: lo anunciado obliga (Ley
 * 24.240, art. 7), así que lo que se muestra tiene que ser lo que se cobra.
 */
export function PaymentOptionsCard() {
  const { store } = useStore();
  const { can } = usePermissions();
  const readOnly = !can('payments.write');
  const { toast } = useToast();

  const [value, setValue] = useState<PaymentOptions>(EMPTY);
  const [meta, setMeta] = useState<PaymentOptionsDto | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = (d: PaymentOptionsDto) => {
    setMeta(d);
    setValue({
      ...EMPTY,
      ...d,
      bankName: d.bankName ?? '',
      accountHolder: d.accountHolder ?? '',
      holderTaxId: d.holderTaxId ?? '',
      cbu: d.cbu ?? '',
      alias: d.alias ?? '',
      instructions: d.instructions ?? '',
      installmentsNote: d.installmentsNote ?? '',
    });
  };

  const { loading } = useServerLoad(
    store?.id ?? null,
    () => api.get<PaymentOptionsDto>('/api/v1/admin/payments/options'),
    apply,
    (err) => toast(errMsg(err, 'No se pudieron cargar las opciones de pago.'), { variant: 'error' }),
  );

  const update = (patch: Partial<PaymentOptions>) => setValue((v) => ({ ...v, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      apply(await api.put<PaymentOptionsDto>('/api/v1/admin/payments/options', value));
      toast('Opciones de pago guardadas', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar las opciones de pago.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const legacy = meta?.legacyTheme;
  // La tienda anuncia un descuento que el checkout todavía no cobra.
  const promisesWithoutCheckout = meta && !meta.configured && (legacy?.cashDiscountPercent ?? 0) > 0;

  return (
    <div className="mt-6 rounded-lg border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-fg-muted">
          <Landmark className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-base font-bold text-fg">Transferencia, efectivo y cuotas</span>
          <p className="text-xs text-fg-muted">
            Lo que tu tienda anuncia sobre cómo se paga. La ficha, el listado y el checkout leen estos
            números.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {loading ? (
          <TableSkeleton rows={4} label="Cargando las opciones de pago…" />
        ) : (
          <>
            {promisesWithoutCheckout && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Tu tienda muestra {legacy!.cashDiscountPercent}% de descuento pagando con transferencia,
                  pero el checkout todavía no ofrece transferencia. Lo que se anuncia obliga: cargá los datos
                  de tu cuenta y guardá, o poné el descuento en 0.
                </span>
              </div>
            )}

            {/* Transferencia */}
            <section className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">Transferencia o depósito</h3>
                  <p className="text-xs text-fg-muted">
                    El comprador ve el precio con descuento, confirma el pedido y le mostramos los datos de tu
                    cuenta. Vos registrás el pago desde Ventas.
                  </p>
                </div>
                <Switch
                  aria-label="Ofrecer transferencia"
                  checked={value.transferEnabled}
                  onChange={(transferEnabled) => update({ transferEnabled })}
                  disabled={readOnly}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Descuento pagando con transferencia o efectivo (%)"
                  hint="El mismo que se anuncia en la ficha y en el listado. 0 = sin descuento."
                >
                  <Input
                    inputMode="numeric"
                    value={String(value.discountPercent)}
                    onChange={(e) =>
                      update({
                        discountPercent: Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 0),
                      })
                    }
                    disabled={readOnly}
                  />
                </FormField>
                <FormField
                  label="Cuánto te guardamos el stock"
                  hint="Si no registrás el pago en ese plazo, el pedido se cancela solo y el stock vuelve a la venta."
                >
                  <Select
                    value={String(value.holdHours)}
                    onChange={(e) => update({ holdHours: Number(e.target.value) })}
                    disabled={readOnly}
                    options={HOLD_CHOICES.map((h) => ({
                      value: String(h),
                      label: h < 48 ? `${h} horas` : h === 168 ? '1 semana' : `${h / 24} días`,
                    }))}
                  />
                </FormField>
              </div>

              {value.transferEnabled && (
                <>
                  <Helper title="Qué datos ve el comprador">
                    Los de abajo, recién cuando confirma el pedido: en la pantalla final y en el email de
                    instrucciones. No se publican en la tienda.
                  </Helper>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Titular de la cuenta">
                      <Input
                        value={value.accountHolder ?? ''}
                        onChange={(e) => update({ accountHolder: e.target.value })}
                        placeholder="Mi Tienda SRL"
                        disabled={readOnly}
                      />
                    </FormField>
                    <FormField label="CUIT del titular">
                      <Input
                        value={value.holderTaxId ?? ''}
                        onChange={(e) => update({ holderTaxId: e.target.value })}
                        placeholder="30-71234567-8"
                        disabled={readOnly}
                      />
                    </FormField>
                    <FormField label="Banco o billetera">
                      <Input
                        value={value.bankName ?? ''}
                        onChange={(e) => update({ bankName: e.target.value })}
                        placeholder="Banco Nación"
                        disabled={readOnly}
                      />
                    </FormField>
                    <FormField label="Alias">
                      <Input
                        value={value.alias ?? ''}
                        onChange={(e) => update({ alias: e.target.value })}
                        placeholder="MI.TIENDA.PAGOS"
                        disabled={readOnly}
                      />
                    </FormField>
                  </div>
                  <FormField label="CBU o CVU" hint="22 números. Con el alias alcanza, pero los dos ayudan.">
                    <Input
                      inputMode="numeric"
                      value={value.cbu ?? ''}
                      onChange={(e) => update({ cbu: e.target.value })}
                      placeholder="0110599520000012345678"
                      disabled={readOnly}
                    />
                  </FormField>
                  <FormField
                    label="Instrucciones (opcional)"
                    hint="Qué hacer después de transferir: a dónde mandar el comprobante, en cuánto lo ves."
                  >
                    <Textarea
                      rows={2}
                      maxLength={1000}
                      value={value.instructions ?? ''}
                      onChange={(e) => update({ instructions: e.target.value })}
                      placeholder="Mandanos el comprobante por WhatsApp al 11 5555-5555 y despachamos en el día."
                      disabled={readOnly}
                    />
                  </FormField>
                </>
              )}
            </section>

            {/* Efectivo */}
            <section className="flex items-start justify-between gap-3 border-t border-border pt-5">
              <div>
                <h3 className="text-sm font-semibold text-fg">Efectivo al retirar</h3>
                <p className="text-xs text-fg-muted">
                  Solo aparece si el comprador elige retirar en tu local. Lleva el mismo descuento que la
                  transferencia y el mismo plazo para pasar a buscarlo.
                </p>
              </div>
              <Switch
                aria-label="Ofrecer efectivo al retirar"
                checked={value.cashOnPickupEnabled}
                onChange={(cashOnPickupEnabled) => update({ cashOnPickupEnabled })}
                disabled={readOnly}
              />
            </section>

            {/* Cuotas */}
            <section className="space-y-4 border-t border-border pt-5">
              <div>
                <h3 className="text-sm font-semibold text-fg">Cuotas sin interés que anunciás</h3>
                <p className="text-xs text-fg-muted">
                  Se muestran como «Hasta N cuotas sin interés» en la ficha y en el listado. Poné solo las que
                  realmente ofrecés: dependen de lo que acordaste con Mercado Pago o Payway y de cada tarjeta.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Hasta">
                  <Select
                    value={String(value.installmentsMax)}
                    onChange={(e) => update({ installmentsMax: Number(e.target.value) })}
                    disabled={readOnly}
                    options={INSTALLMENT_CHOICES.map((n) => ({
                      value: String(n),
                      label: n === 0 ? 'No anunciar cuotas' : `${n} cuotas sin interés`,
                    }))}
                  />
                </FormField>
                {value.installmentsMax > 0 && (
                  <FormField label="Condiciones" hint="Se muestran debajo de las cuotas, en la ficha.">
                    <Input
                      maxLength={160}
                      value={value.installmentsNote ?? ''}
                      onChange={(e) => update({ installmentsNote: e.target.value })}
                      placeholder="Con tarjetas de crédito bancarias"
                      disabled={readOnly}
                    />
                  </FormField>
                )}
              </div>
              {meta?.paywayMaxInstallments != null &&
                value.installmentsMax > meta.paywayMaxInstallments &&
                meta.paywayMaxInstallments > 1 && (
                  <p className="text-xs text-warning">
                    En Payway ofrecés hasta {meta.paywayMaxInstallments} cuotas: anunciar más promete algo que
                    ese medio no da.
                  </p>
                )}
            </section>

            {meta && !meta.configured && legacy?.freeShippingThreshold && (
              <p className="border-t border-border pt-4 text-xs text-fg-muted">
                Tu diseño mostraba «envío gratis desde{' '}
                {formatMoney(legacy.freeShippingThreshold.amount, legacy.freeShippingThreshold.currency)}».
                Ahora ese monto se carga en cada medio de envío (Configuración › Medios de envío), que es
                donde se cobra.
              </p>
            )}

            {!readOnly && (
              <div className="pt-1">
                <Button onClick={save} loading={saving}>
                  Guardar
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
