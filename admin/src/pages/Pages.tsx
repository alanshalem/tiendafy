import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Pencil, Trash2, Plus } from 'lucide-react';
import { formatDate } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dropdown,
  FormField,
  Input,
  Modal,
  PageHeader,
  Table,
  useConfirm,
  useToast,
  type BadgeVariant,
  type TableColumn,
} from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api, errMsg } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { NoStoreSelected } from '../components/NoStoreSelected';
import { RichTextEditor } from '../components/RichTextEditor';
import { HelpLink } from '../components/HelpLink';
import { TableSkeleton } from '../components/Skeleton';

interface PageDto {
  id: string;
  title: string;
  slug: string;
  body: string;
  published: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export function PagesPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PageDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pages', store?.id],
    queryFn: () => api.get<{ items: PageDto[] }>('/api/v1/pages'),
    enabled: !!store,
  });
  const pages = data?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pages', store?.id] });

  const remove = useMutation({
    mutationFn: (p: PageDto) => api.delete(`/api/v1/pages/${p.id}`),
    onSuccess: () => {
      refresh();
      toast('Página eliminada', { variant: 'success' });
    },
    onError: (e) => toast(errMsg(e), { variant: 'error' }),
  });

  const statusVariant = (p: PageDto): BadgeVariant => (p.published ? 'success' : 'neutral');

  const columns: TableColumn<PageDto>[] = [
    { key: 'title', header: 'Título', cell: (p) => <span className="font-semibold text-fg">{p.title}</span> },
    {
      key: 'slug',
      header: 'URL',
      cell: (p) => <span className="font-mono text-sm text-fg-muted">/paginas/{p.slug}</span>,
    },
    {
      key: 'published',
      header: 'Estado',
      cell: (p) => <Badge variant={statusVariant(p)}>{p.published ? 'Publicada' : 'Borrador'}</Badge>,
    },
    {
      key: 'updatedAtUtc',
      header: 'Última edición',
      cell: (p) => <span className="text-sm text-fg-muted">{formatDate(p.updatedAtUtc)}</span>,
    },
    {
      key: 'createdAtUtc',
      header: '',
      cell: (p) => (
        <div className="flex justify-end">
          <Dropdown>
            <Dropdown.Trigger label={`Acciones de ${p.title}`}>
              <MoreVertical className="h-4 w-4" />
            </Dropdown.Trigger>
            <Dropdown.Menu align="end">
              <Dropdown.Item onSelect={() => setEditing(p)}>
                <Pencil className="mr-2 inline h-4 w-4" /> Editar
              </Dropdown.Item>
              <Dropdown.Item
                destructive
                onSelect={async () => {
                  if (
                    await confirm({
                      title: 'Eliminar página',
                      message: `¿Eliminar la página ${p.title}?`,
                      confirmLabel: 'Eliminar',
                      variant: 'danger',
                    })
                  )
                    remove.mutate(p);
                }}
              >
                <Trash2 className="mr-2 inline h-4 w-4" /> Eliminar
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      ),
    },
  ];

  if (!store) return <NoStoreSelected />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Páginas de contenido"
        subtitle="Páginas institucionales de tu tienda: sobre nosotros, términos, preguntas frecuentes y más."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Crear página
            </span>
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <TableSkeleton label="Cargando páginas…" />
        </Card>
      ) : pages.length === 0 ? (
        <EmptyState
          kicker="Páginas"
          title="Creá tu primera página"
          body="Páginas con contenido propio como “Sobre nosotros”, términos y condiciones o preguntas frecuentes, accesibles desde tu tienda."
          action={{ label: 'Crear página', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <Card flush>
          <Table columns={columns} rows={pages} rowKey={(p) => p.id} emptyState="No hay páginas." />
        </Card>
      )}

      {/* La key vuelve a montar el formulario en cada apertura: arranca con los
          datos de ese momento, sin un efecto que los copie después. */}
      <PageModal
        key={createOpen ? 'alta' : 'alta-cerrada'}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <PageModal
        key={editing?.id ?? 'edicion-cerrada'}
        open={!!editing}
        page={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <HelpLink id="paginas" />
    </div>
  );
}

function PageModal({
  open,
  page,
  onClose,
  onSaved,
}: {
  open: boolean;
  page?: PageDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  // Crear = vacío, editar = datos de la página (ver la key en quien lo abre).
  const [title, setTitle] = useState(page?.title ?? '');
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [body, setBody] = useState(page?.body ?? '');
  const contentLabelId = useId();
  const [published, setPublished] = useState(page?.published ?? true);
  const [error, setError] = useState<string>();
  const isEdit = !!page;

  const save = useMutation({
    mutationFn: () => {
      const body_ = {
        title: title.trim(),
        slug: slug.trim(),
        body,
        published,
      };
      return isEdit ? api.put(`/api/v1/pages/${page!.id}`, body_) : api.post('/api/v1/pages', body_);
    },
    onSuccess: () => {
      onSaved();
      toast(isEdit ? 'Página actualizada' : 'Página creada', { variant: 'success' });
      onClose();
    },
    onError: (e) => setError(errMsg(e, 'Error inesperado')),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar página' : 'Crear página'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>
            {isEdit ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Título" required error={error}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sobre nosotros" />
        </FormField>

        <FormField label="URL" hint="se genera del título si lo dejás vacío">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="sobre-nosotros" />
        </FormField>

        {/* Un contenteditable no se asocia con <label for>: se nombra con aria-labelledby. */}
        <div className="space-y-1.5">
          <p id={contentLabelId} className="block text-sm font-medium text-fg">
            Contenido
          </p>
          <RichTextEditor labelledBy={contentLabelId} value={body} onChange={setBody} />
          <p className="text-sm text-fg-muted">
            Editá con formato: títulos, negrita, listas, links e imágenes.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <Checkbox checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publicada
        </label>
      </div>
    </Modal>
  );
}
