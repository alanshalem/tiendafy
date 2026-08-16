import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, Switch, useToast } from '@tiendafy/ui';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { NotificationUsage } from '../../components/NotificationUsage';
import { RichTextEditor } from '../../components/RichTextEditor';
import { EmailPreview } from '../../components/EmailPreview';
import { api } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { TemplateGrid } from './TemplateGrid';

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
      api.put(`/api/v1/email-templates/${t.type}`, {
        enabled: t.enabled,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
      }),
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

      <NotificationUsage channel="email" />

      <div className="space-y-6">
        <TemplateGrid
          groups={GROUPS}
          items={items}
          editLabel="Editar contenido"
          onEdit={setEditing}
          renderToggle={(t) => <Switch checked={t.enabled} onChange={(on) => toggle(t, on)} />}
        />
      </div>

      <HelpLink id="autoEmails" />

      {editing && (
        <EditModal
          template={editing}
          onClose={() => setEditing(null)}
          onSave={(subject, bodyHtml) =>
            save.mutate(
              { type: editing.type, enabled: editing.enabled, subject, bodyHtml },
              {
                onSuccess: () => {
                  toast('Plantilla guardada', { variant: 'success' });
                  setEditing(null);
                },
              },
            )
          }
        />
      )}
    </div>
  );
}

function EditModal({
  template,
  onClose,
  onSave,
}: {
  template: Tpl;
  onClose: () => void;
  onSave: (subject: string, bodyHtml: string) => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.bodyHtml);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.bodyHtml);
  }, [template]);

  // Preview EXACTO: lo renderiza el backend con el mismo layout brandeado
  // (logo + color de la tienda) que usa al enviar. Debounce para no spamear.
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .post<{ subject: string; html: string }>('/api/v1/email-templates/preview', {
          subject,
          bodyHtml: body,
        })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [subject, body]);

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`Editar: ${template.label}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(subject, body)}>Guardar</Button>
        </>
      }
    >
      <div className="grid h-[72vh] gap-6 lg:grid-cols-2">
        {/* Editor (única columna con scroll) */}
        <div className="min-h-0 space-y-4 overflow-y-auto pb-2 pr-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Asunto</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto del email"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-fg">Contenido</label>
            <RichTextEditor value={body} onChange={setBody} />
          </div>
          <div className="rounded-md bg-bg-muted/50 p-3 text-xs text-fg-muted">
            <span className="font-medium text-fg">Variables disponibles:</span>{' '}
            {VARS.map((v) => (
              <code key={v} className="mx-0.5 rounded bg-bg-muted px-1 py-0.5">
                {v}
              </code>
            ))}
            <span> — se reemplazan al enviar.</span>
          </div>
          <div className="rounded-md border border-border p-3 text-xs text-fg-muted">
            <div className="mb-1 font-medium text-fg">Recomendaciones de diseño</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                Ancho del email: <strong>600&nbsp;px</strong> (es el estándar de los clientes de correo).
              </li>
              <li>
                Imagen de header / banner: <strong>600×200&nbsp;px</strong>.
              </li>
              <li>
                Logo: hasta <strong>~160&nbsp;px</strong> de ancho.
              </li>
              <li>Usá JPG, PNG o WebP livianos. Evitá imágenes muy pesadas.</li>
              <li>El footer va abajo, chico y discreto (datos de contacto / baja).</li>
            </ul>
          </div>
        </div>

        {/* Vista previa: idéntica al email real, fija, sin doble scroll */}
        <div className="flex min-h-0 flex-col">
          <div className="mb-1.5 text-sm font-medium text-fg">Vista previa</div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div className="shrink-0 border-b border-border bg-bg-muted/50 px-4 py-2 text-xs text-fg-muted">
              Asunto:{' '}
              <span className="font-medium text-fg">{preview?.subject || subject || '(sin asunto)'}</span>
            </div>
            <div className="min-h-0 flex-1">
              {preview ? (
                <EmailPreview html={preview.html} />
              ) : (
                <div className="flex h-full items-center justify-center bg-bg-muted/30 text-sm text-fg-muted">
                  Generando vista previa…
                </div>
              )}
            </div>
          </div>
          <p className="mt-1.5 shrink-0 text-xs text-fg-muted">
            Así lo recibe tu cliente: con el logo y el color de tu tienda, y las variables reemplazadas con
            datos de ejemplo.
          </p>
        </div>
      </div>
    </Modal>
  );
}
