import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Input, Select, Textarea, useToast } from '@tiendafy/ui';
import { SaveBar, SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { useSettings } from './useSettings';
import { SETTINGS_CARD, TABLE_CARD, TABLE_HEAD_STICKY } from '../../lib/styles';

/* ---------- Centros de distribución ---------- */
export function DistributionCentersPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <SettingsHeader
        title="Centros de distribución"
        description="Definí desde dónde salen tus envíos. Podés tener varios y elegir cuál usar en cada pedido."
        action={
          <button className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            <Plus className="h-4 w-4" /> Agregar centro
          </button>
        }
      />
      <div className={TABLE_CARD}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4 last:border-b-0">
          <div>
            <div className="font-medium text-fg">Centro principal</div>
            <div className="text-sm text-fg-muted">Dirección configurada en Información de contacto</div>
          </div>
          <span className="rounded-full bg-bg-muted px-2.5 py-0.5 text-xs font-medium text-fg-muted">
            Por defecto
          </span>
        </div>
      </div>
      <HelpLink id="distributionCenters" />
    </div>
  );
}

/* ---------- Códigos externos ---------- */
export function ExternalCodesPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings('externalCodes', { head: '', body: '' });

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SettingsHeader
        title="Códigos externos"
        description="Insertá scripts de terceros (Google Analytics, Meta Pixel, chats). Se cargan en todas las páginas de tu tienda."
      />
      <div className="space-y-4">
        <div className={SETTINGS_CARD}>
          <h3 className="text-sm font-semibold text-fg">Código en &lt;head&gt;</h3>
          <p className="mt-0.5 text-xs text-fg-muted">Ideal para etiquetas de seguimiento y verificación.</p>
          <Textarea
            value={value.head}
            onChange={(e) => update({ head: e.target.value })}
            rows={5}
            className="mt-3 font-mono text-xs"
            placeholder="<!-- Google Analytics, Meta Pixel... -->"
          />
        </div>
        <div className={SETTINGS_CARD}>
          <h3 className="text-sm font-semibold text-fg">Código antes de &lt;/body&gt;</h3>
          <p className="mt-0.5 text-xs text-fg-muted">Ideal para widgets y chats.</p>
          <Textarea
            value={value.body}
            onChange={(e) => update({ body: e.target.value })}
            rows={5}
            className="mt-3 font-mono text-xs"
            placeholder="<!-- Chat, remarketing... -->"
          />
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Códigos guardados', { variant: 'success' });
        }}
      />
      <HelpLink id="externalCodes" />
    </div>
  );
}

/* ---------- Idiomas y monedas ---------- */
export function LanguagesCurrenciesPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings('locale', { language: 'es-AR', currency: 'ARS' });

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <SettingsHeader
        title="Idiomas y monedas"
        description="Definí el idioma y la moneda con que opera tu tienda."
      />
      <div className={`space-y-4 ${SETTINGS_CARD}`}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">Idioma de la tienda</label>
          <Select
            value={value.language}
            onChange={(e) => update({ language: e.target.value })}
            options={[
              { value: 'es-AR', label: 'Español (Argentina)' },
              { value: 'es-MX', label: 'Español (México)' },
              { value: 'pt-BR', label: 'Português (Brasil)' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">Moneda</label>
          <Select
            value={value.currency}
            onChange={(e) => update({ currency: e.target.value })}
            options={[
              { value: 'ARS', label: 'Peso argentino (ARS $)' },
              { value: 'MXN', label: 'Peso mexicano (MXN $)' },
              { value: 'BRL', label: 'Real brasileño (BRL R$)' },
              { value: 'USD', label: 'Dólar (USD $)' },
            ]}
          />
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Idioma y moneda guardados', { variant: 'success' });
        }}
      />
      <HelpLink id="ajustesAvanzados" />
    </div>
  );
}

/* ---------- Redireccionamientos 301 ---------- */
interface Redirect {
  from: string;
  to: string;
}
export function RedirectsPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<{ rules: Redirect[] }>('redirects', { rules: [] });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const add = () => {
    if (!from || !to) return;
    update({ rules: [...value.rules, { from, to }] });
    setFrom('');
    setTo('');
  };

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <SettingsHeader
        title="Redireccionamientos 301"
        description="Redirigí URLs viejas a nuevas para no perder posicionamiento ni dejar links rotos."
      />
      <div className={SETTINGS_CARD}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[12rem]">
            <label className="mb-1.5 block text-sm font-medium text-fg">Desde (URL vieja)</label>
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/producto-viejo" />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="mb-1.5 block text-sm font-medium text-fg">Hacia (URL nueva)</label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="/productos/nuevo-slug" />
          </div>
          <Button onClick={add} disabled={!from || !to}>
            Agregar
          </Button>
        </div>

        {value.rules.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 font-medium">Desde</th>
                <th className="py-2 font-medium">Hacia</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {value.rules.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="py-2 font-mono text-xs text-fg">{r.from}</td>
                  <td className="py-2 font-mono text-xs text-fg">{r.to}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => update({ rules: value.rules.filter((_, idx) => idx !== i) })}
                      className="text-danger hover:underline"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Redirecciones guardadas', { variant: 'success' });
        }}
      />
      <HelpLink id="ajustesAvanzados" />
    </div>
  );
}

/* ---------- Campos personalizados ---------- */
interface CustomField {
  name: string;
  type: string;
}
export function CustomFieldsPage() {
  const { toast } = useToast();
  const { value, update, save, dirty } = useSettings<{ fields: CustomField[] }>('customFields', {
    fields: [],
  });
  const [name, setName] = useState('');
  const [type, setType] = useState('text');

  const add = () => {
    if (!name) return;
    update({ fields: [...value.fields, { name, type }] });
    setName('');
  };

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <SettingsHeader
        title="Campos personalizados"
        description="Agregá atributos propios a tus productos, clientes o pedidos (ej: material, talle de cintura, dedicatoria)."
      />
      <div className={SETTINGS_CARD}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[12rem]">
            <label className="mb-1.5 block text-sm font-medium text-fg">Nombre del campo</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Material" />
          </div>
          <div className="w-44">
            <label className="mb-1.5 block text-sm font-medium text-fg">Tipo</label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={[
                { value: 'text', label: 'Texto' },
                { value: 'number', label: 'Número' },
                { value: 'boolean', label: 'Sí / No' },
                { value: 'list', label: 'Lista de opciones' },
              ]}
            />
          </div>
          <Button onClick={add} disabled={!name}>
            Agregar
          </Button>
        </div>

        {value.fields.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {value.fields.map((f, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-fg">{f.name}</span>
                <span className="flex items-center gap-3">
                  <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-fg-muted">{f.type}</span>
                  <button
                    onClick={() => update({ fields: value.fields.filter((_, idx) => idx !== i) })}
                    className="text-danger hover:underline"
                  >
                    Eliminar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SaveBar
        dirty={dirty}
        onSave={() => {
          save();
          toast('Campos guardados', { variant: 'success' });
        }}
      />
      <HelpLink id="ajustesAvanzados" />
    </div>
  );
}
