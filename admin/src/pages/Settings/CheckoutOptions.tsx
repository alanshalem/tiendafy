import { useState, useId } from 'react';
import { Link } from 'react-router-dom';
import {} from 'lucide-react';
import { Button, Input, Radio, RadioGroup, Switch, Textarea, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { SETTINGS_CARD, SETTINGS_COLUMNS } from '../../lib/styles';
import { useServerLoad } from '../../lib/useServerLoad';
import { useUnsavedInScope } from '../../lib/unsavedScope';
import { TableSkeleton } from '../../components/Skeleton';

interface CheckoutSettings {
  singleColumn: boolean;
  requirePhone: boolean;
  requireDocument: boolean;
  customerNoteEnabled: boolean;
  customerNoteLabel: string;
  orderMessageEnabled: boolean;
  orderMessageText: string;
}

const DEFAULTS: CheckoutSettings = {
  singleColumn: false,
  requirePhone: true,
  requireDocument: false,
  customerNoteEnabled: true,
  customerNoteLabel: 'Aclaraciones sobre tu pedido',
  orderMessageEnabled: false,
  orderMessageText: '',
};

const NOTE_MAX = 60;
const MESSAGE_MAX = 500;

/**
 * Qué datos se le piden al comprador y qué se le muestra al terminar.
 *
 * Todo lo de acá lo lee el storefront: antes la pantalla guardaba en el
 * localStorage del navegador del comerciante, así que cada máquina tenía su
 * propia configuración y el comprador no veía ninguna.
 */
export function CheckoutOptionsPage() {
  const fid = useId();
  const { store } = useStore();
  const { toast } = useToast();

  const [value, setValue] = useState<CheckoutSettings>(DEFAULTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CheckoutSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  // Contra lo último guardado, no "se tocó algo": volver un campo a como
  // estaba no deja la barra de guardar ni el aviso al salir.
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  useUnsavedInScope(dirty);

  const { loading, reload: load } = useServerLoad(
    store?.id ?? null,
    () => api.get<CheckoutSettings>('/api/v1/admin/checkout/settings'),
    (d) => {
      setValue({ ...DEFAULTS, ...d });
      setSaved({ ...DEFAULTS, ...d });
      setLoadError(null);
    },
    (err) => setLoadError(errMsg(err, 'No se pudieron cargar las opciones del checkout.')),
  );

  const update = (patch: Partial<CheckoutSettings>) => {
    setValue((v) => ({ ...v, ...patch }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.put<CheckoutSettings>('/api/v1/admin/checkout/settings', value);
      setValue({ ...DEFAULTS, ...saved });
      setSaved({ ...DEFAULTS, ...saved });
      toast('Opciones del checkout guardadas', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar las opciones.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError)
    return (
      <div>
        <SettingsHeader title="Opciones del checkout" description="Qué se le pide al comprador." />
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
        <SettingsHeader title="Opciones del checkout" description="Qué se le pide al comprador." />
        <div className={SETTINGS_CARD}>
          <TableSkeleton rows={4} label="Cargando opciones del checkout…" />
        </div>
      </div>
    );

  return (
    <div className="pb-20">
      <SettingsHeader
        title="Opciones del checkout"
        description="Qué datos se le piden al comprador para terminar la compra, y qué ve cuando termina."
      />

      <div className={SETTINGS_COLUMNS}>
        <Section
          title="Datos que se piden"
          description="Cuantos menos campos obligatorios, menos gente abandona a mitad de camino. Pero sin teléfono cuesta coordinar una entrega, y sin documento no se puede facturar como corresponde."
        >
          <div className="space-y-4">
            <Choice
              name="phone"
              label="Teléfono"
              value={value.requirePhone ? 'req' : 'opt'}
              onChange={(v) => update({ requirePhone: v === 'req' })}
              options={[
                {
                  id: 'req',
                  label: 'Obligatorio',
                  hint: 'Sirve para coordinar la entrega o avisar de un problema.',
                },
                {
                  id: 'opt',
                  label: 'Opcional',
                  hint: 'Se muestra el campo, pero se puede comprar sin completarlo.',
                },
              ]}
            />
            <Choice
              name="doc"
              label="DNI o CUIT"
              value={value.requireDocument ? 'req' : 'opt'}
              onChange={(v) => update({ requireDocument: v === 'req' })}
              options={[
                {
                  id: 'opt',
                  label: 'Opcional',
                  hint: 'Quien no lo complete se factura como consumidor final, que tiene tope de monto.',
                },
                {
                  id: 'req',
                  label: 'Obligatorio',
                  hint: 'Necesario si facturás todas las ventas o vendés a empresas.',
                },
              ]}
            />
            {value.requireDocument && (
              <p className="text-xs text-fg-subtle">
                Con esto encendido, quien no tenga el documento a mano no puede terminar la compra. Revisá que
                te convenga en{' '}
                <Link to="/configuracion/facturacion" className="text-primary hover:underline">
                  Facturación
                </Link>
                .
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Nota del comprador"
          description="Un campo libre para que aclare algo del pedido: un timbre, un horario, un color."
          toggle={
            <Switch
              aria-label="Pedir nota del comprador"
              checked={value.customerNoteEnabled}
              onChange={(customerNoteEnabled) => update({ customerNoteEnabled })}
            />
          }
        >
          {value.customerNoteEnabled && (
            <div>
              <label htmlFor={`${fid}-1`} className="mb-1 block text-sm font-medium text-fg">
                Qué dice el campo
              </label>
              <Input
                id={`${fid}-1`}
                aria-label="Qué dice el campo"
                value={value.customerNoteLabel}
                maxLength={NOTE_MAX}
                onChange={(e) => update({ customerNoteLabel: e.target.value })}
                placeholder="Aclaraciones sobre tu pedido"
              />
              <p className="mt-1 text-xs text-fg-muted">
                Es el texto que el comprador ve dentro del recuadro. Cuanto más concreto, mejores notas
                recibís: «¿Timbre o portero?» rinde más que «Aclaraciones».
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Mensaje al terminar la compra"
          description="Se muestra en la pantalla final, junto con la confirmación del pago. Es donde contestar lo que todos preguntan apenas pagan: cuándo sale el pedido, cómo lo siguen, a dónde escribir."
          toggle={
            <Switch
              aria-label="Mostrar mensaje al terminar la compra"
              checked={value.orderMessageEnabled}
              onChange={(orderMessageEnabled) => update({ orderMessageEnabled })}
            />
          }
        >
          {value.orderMessageEnabled && (
            <div>
              <Textarea
                aria-label="Mensaje al terminar la compra"
                value={value.orderMessageText}
                maxLength={MESSAGE_MAX}
                onChange={(e) => update({ orderMessageText: e.target.value })}
                rows={3}
                placeholder="Preparamos los pedidos de lunes a viernes y despachamos dentro de las 48 horas. Cualquier duda escribinos por WhatsApp al 11 5555-5555."
              />
              <p className="mt-1 text-xs text-fg-muted">
                {value.orderMessageText.length}/{MESSAGE_MAX}. No aparece cuando el pago se rechaza: ahí no
                hay pedido del que hablar.
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Cómo se ve"
          description="En pantallas grandes el checkout muestra el formulario a la izquierda y el resumen de la compra a la derecha."
        >
          <Choice
            name="layout"
            label="Diseño"
            value={value.singleColumn ? 'one' : 'two'}
            onChange={(v) => update({ singleColumn: v === 'one' })}
            options={[
              {
                id: 'two',
                label: 'Dos columnas',
                hint: 'El resumen queda siempre a la vista mientras completa.',
              },
              {
                id: 'one',
                label: 'Una columna',
                hint: 'Todo en fila, uno abajo del otro. Menos distracción.',
              },
            ]}
          />
        </Section>
      </div>

      <HelpLink id="checkout" />

      <SaveBar dirty={dirty && !saving} onSave={save} />
    </div>
  );
}

/** Elección entre dos alternativas, cada una con su consecuencia escrita. */
function Choice({
  name,
  label,
  value,
  onChange,
  options,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string; hint: string }[];
}) {
  return (
    <div>
      {/* El título es la legend del grupo: con una legend vacía, los dos
          "Obligatorio / Opcional" de la pantalla no decían de qué eran. */}
      <RadioGroup legend={label}>
        {options.map((o) => (
          <div key={o.id}>
            <Radio name={name} label={o.label} checked={value === o.id} onChange={() => onChange(o.id)} />
            <p className="ml-6 text-xs text-fg-muted">{o.hint}</p>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

function Section({
  title,
  description,
  toggle,
  children,
}: {
  title: string;
  description?: string;
  toggle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={SETTINGS_CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {toggle}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
