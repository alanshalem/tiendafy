import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, Switch, useToast } from '@tiendafy/ui';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { RichTextEditor } from '../../components/RichTextEditor';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';

interface Tpl {
  type: string;
  group: string;
  label: string;
  description: string;
  enabled: boolean;
  subject: string;
  bodyHtml: string;
}

const GROUPS = ['Promociones', 'Cuenta de usuarios', 'Ventas'];
const VARS = ['{{store}}', '{{order_id}}', '{{total}}', '{{items}}', '{{name}}', '{{link}}'];

export function AutoEmailsPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Tpl | null>(null);

  const { data } = useQuery({
    queryKey: ['email-templates', store?.id],
    queryFn: () => api.get<{ items: Tpl[] }>('/api/v1/email-templates'),
    enabled: !!store,
  });
  const items = data?.items ?? [];

  const save = useMutation({
    mutationFn: (t: { type: string; enabled: boolean; subject: string; bodyHtml: string }) =>
      api.put(`/api/v1/email-templates/${t.type}`, { enabled: t.enabled, subject: t.subject, bodyHtml: t.bodyHtml }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-templates', store?.id] }),
    onError: () => toast('No se pudo guardar', { variant: 'error' }),
  });

  const toggle = (t: Tpl, on: boolean) =>
    save.mutate(
      { type: t.type, enabled: on, subject: t.subject, bodyHtml: t.bodyHtml },
      { onSuccess: () => toast(on ? 'Email activado' : 'Email desactivado', { variant: 'success' }) },
    );

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <SettingsHeader
        title="E-mails automáticos"
        description="Estos e-mails se envían a tus clientes solos. Activá los que quieras y editá el contenido."
      />

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group}>
              <h2 className="mb-3 text-base font-semibold text-fg">{group}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {groupItems.map((t) => (
                  <div key={t.type} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-fg">{t.label}</div>
                        <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>
                        <button onClick={() => setEditing(t)} className="mt-2 text-xs font-medium text-primary hover:underline">
                          Editar contenido
                        </button>
                      </div>
                      <Switch checked={t.enabled} onChange={(on) => toggle(t, on)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <HelpLink id="autoEmails" />

      {editing && (
        <EditModal
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(subject, bodyHtml) =>
            save.mutate(
              { type: editing.type, enabled: editing.enabled, subject, bodyHtml },
              { onSuccess: () => { toast('Plantilla guardada', { variant: 'success' }); setEditing(null); } },
            )
          }
        />
      )}
    </div>
  );
}

// Valores de ejemplo para la vista previa (lo que verá el cliente).
const SAMPLE: Record<string, string> = {
  '{{store}}': 'Mi Tienda',
  '{{name}}': 'Juan Pérez',
  '{{order_id}}': 'A1B2C3',
  '{{total}}': '$ 24.500',
  '{{link}}': '#',
  '{{items}}':
    '<table style="width:100%;font-size:14px"><tr><td style="padding:4px 0">2× Remera negra</td><td style="text-align:right">$ 18.000</td></tr><tr><td style="padding:4px 0">1× Gorra</td><td style="text-align:right">$ 6.500</td></tr></table>',
};

function fillSample(html: string): string {
  let out = html;
  for (const [key, value] of Object.entries(SAMPLE)) out = out.split(key).join(value);
  return out;
}

function EditModal({ template, onClose, onSave }: { template: Tpl; onClose: () => void; onSave: (subject: string, bodyHtml: string) => void }) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.bodyHtml);

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.bodyHtml);
  }, [template]);

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`Editar: ${template.label}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(subject, body)}>Guardar</Button>
        </>
      }
    >
      <div className="grid max-h-[72vh] gap-6 overflow-y-auto lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Asunto</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del email" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Contenido</label>
            <RichTextEditor value={body} onChange={setBody} />
          </div>
          <div className="rounded-md bg-bg-muted/50 p-3 text-xs text-fg-muted">
            <span className="font-medium text-fg">Variables disponibles:</span>{' '}
            {VARS.map((v) => (
              <code key={v} className="mx-0.5 rounded bg-bg-muted px-1 py-0.5">{v}</code>
            ))}
            <span> — se reemplazan al enviar.</span>
          </div>
          <div className="rounded-md border border-border p-3 text-xs text-fg-muted">
            <div className="mb-1 font-medium text-fg">Recomendaciones de diseño</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Ancho del email: <strong>600&nbsp;px</strong> (es el estándar de los clientes de correo).</li>
              <li>Imagen de header / banner: <strong>600×200&nbsp;px</strong>.</li>
              <li>Logo: hasta <strong>~160&nbsp;px</strong> de ancho.</li>
              <li>Usá JPG, PNG o WebP livianos. Evitá imágenes muy pesadas.</li>
              <li>El footer va abajo, chico y discreto (datos de contacto / baja).</li>
            </ul>
          </div>
        </div>

        {/* Vista previa (como lo verá el cliente) */}
        <div>
          <div className="mb-1.5 text-sm font-medium text-fg">Vista previa</div>
          <div className="rounded-lg border border-border bg-bg-muted/40 p-4">
            <div className="mx-auto max-w-[600px] overflow-hidden rounded-md bg-white shadow-sm">
              <div className="border-b border-black/10 px-4 py-2 text-xs text-gray-500">
                Asunto: <span className="font-medium text-gray-800">{fillSample(subject) || '(sin asunto)'}</span>
              </div>
              <div className="px-4 py-4 text-[#222]" dangerouslySetInnerHTML={{ __html: fillSample(body) }} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
