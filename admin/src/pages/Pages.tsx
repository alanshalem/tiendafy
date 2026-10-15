import { useId, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { LazyRichTextEditor } from '../components/LazyRichTextEditor';
import { HelpLink } from '../components/HelpLink';
import { TableSkeleton } from '../components/Skeleton';
import { ERROR_SHOWN, LoadError } from '../components/LoadError';
import { useBeforeUnload, useGuardedClose } from '../lib/useUnsavedChanges';
import { useListParams, useListSearch } from '../lib/useListParams';
import { Pagination, pageRangeLabel } from '../components/Pagination';

const PAGE_SIZE = 25;
const LIST_DEFAULTS = { q: '', pagina: 1 };

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

  // De a una página y con búsqueda en el servidor: cada página trae su
  // contenido entero y antes venían todas juntas.
  const list = useListParams(LIST_DEFAULTS);
  const [search, setSearch] = useListSearch(list);
  const page = list.values.pagina;
  const q = list.values.q.trim();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['pages', store?.id, page, q],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (q) params.set('q', q);
      return api.get<{ items: PageDto[]; total?: number }>(`/api/v1/pages?${params}`);
    },
    enabled: !!store,
    placeholderData: keepPreviousData,
    meta: ERROR_SHOWN,
  });
  const pages = data?.items ?? [];
  const total = data?.total ?? pages.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      header: <span className="sr-only">Acciones</span>,
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
      ) : isError && !data ? (
        // Un error no es "creá tu primera página": se terminaban duplicando.
        <LoadError
          title="No se pudieron cargar las páginas."
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : total === 0 && !list.filtered ? (
        <EmptyState
          kicker="Páginas"
          title="Creá tu primera página"
          body="Páginas con contenido propio como “Sobre nosotros”, términos y condiciones o preguntas frecuentes, accesibles desde tu tienda."
          action={{ label: 'Crear página', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <Card flush>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
            <Input
              type="search"
              aria-label="Buscar página por título o dirección"
              placeholder="Buscar página por título o dirección…"
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="text-xs text-fg-subtle">
              {pageRangeLabel(page, PAGE_SIZE, total, total === 1 ? 'página' : 'páginas')}
            </span>
          </div>
          <Table
            columns={columns}
            rows={pages}
            rowKey={(p) => p.id}
            emptyState={list.filtered ? 'Ninguna página coincide con la búsqueda.' : 'No hay páginas.'}
          />
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPage={(pagina) => list.set({ pagina })}
          />
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
  // El contenido con formato es lo que más cuesta rehacer: un click afuera o
  // un Escape de más no lo tira.
  const dirty =
    open &&
    (title !== (page?.title ?? '') ||
      slug !== (page?.slug ?? '') ||
      body !== (page?.body ?? '') ||
      published !== (page?.published ?? true));
  const cancel = useGuardedClose(dirty, onClose);
  useBeforeUnload(dirty);

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
      dirty={dirty}
      title={isEdit ? 'Editar página' : 'Crear página'}
      footer={
        <>
          <Button variant="secondary" onClick={cancel}>
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
          <LazyRichTextEditor labelledBy={contentLabelId} value={body} onChange={setBody} />
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
