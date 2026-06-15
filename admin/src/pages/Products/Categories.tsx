import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Copy, ExternalLink, GripVertical, MoreVertical } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, cn, useToast } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { api, ApiRequestError } from '../../lib/api';
import { EmptyState } from '../../components/EmptyState';
import { useFlipList } from '../../lib/useFlip';

interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  depth: number;
}

interface CategoriesResponse {
  items: CategoryDto[];
}

/** Nodo del árbol con sus hijos, en orden. */
interface TreeNode extends CategoryDto {
  children: TreeNode[];
}

function buildTree(items: CategoryDto[], order: Record<string, string[]>): TreeNode[] {
  const byId = new Map(items.map((c) => [c.id, { ...c, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  // Aplicar orden guardado por scope (parentId o 'root').
  const sortScope = (nodes: TreeNode[], scope: string) => {
    const saved = order[scope];
    if (saved) {
      nodes.sort((a, b) => {
        const ia = saved.indexOf(a.id);
        const ib = saved.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }
    nodes.forEach((n) => sortScope(n.children, n.id));
  };
  sortScope(roots, 'root');
  return roots;
}

export function CategoriesPage() {
  const { store } = useStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const storageKey = `tiendafy.catOrder.${store?.id ?? ''}`;

  const { data, isLoading } = useQuery({
    queryKey: ['categories', store?.id],
    queryFn: () => api.get<CategoriesResponse>('/api/v1/categories'),
    enabled: !!store,
  });
  const categories = useMemo(() => data?.items ?? [], [data]);

  // Cargar orden guardado del navegador.
  useEffect(() => {
    if (!store) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setOrder(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }, [store, storageKey]);

  // Aviso del navegador si hay cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const tree = useMemo(() => buildTree(categories, order), [categories, order]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const scopeOf = (node: CategoryDto) => node.parentId ?? 'root';

  const handleDrop = (target: TreeNode) => {
    if (!dragId || dragId === target.id) {
      setDragId(null);
      return;
    }
    const dragged = categories.find((c) => c.id === dragId);
    if (!dragged) return;
    // Solo reordenar dentro del mismo nivel (mismo padre).
    if ((dragged.parentId ?? null) !== (target.parentId ?? null)) {
      toast('Solo se puede reordenar dentro de la misma categoría padre', { variant: 'error' });
      setDragId(null);
      return;
    }
    const scope = scopeOf(target);
    const siblings = (scope === 'root' ? tree : findNode(tree, scope)?.children ?? []).map((n) => n.id);
    const from = siblings.indexOf(dragId);
    const to = siblings.indexOf(target.id);
    const reordered = [...siblings];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragId);
    setOrder((prev) => ({ ...prev, [scope]: reordered }));
    setDirty(true);
    setDragId(null);
  };

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(order));
    setDirty(false);
    toast('Orden de categorías guardado', { variant: 'success' });
  };

  const discard = () => {
    const raw = localStorage.getItem(storageKey);
    setOrder(raw ? JSON.parse(raw) : {});
    setDirty(false);
  };

  const listRef = useFlipList<HTMLDivElement>(
    JSON.stringify(order) + '|' + [...collapsed].sort().join(','),
  );

  if (!store) {
    return <p className="py-16 text-center text-sm text-fg-muted">Elegí una tienda arriba.</p>;
  }

  const isEmpty = !isLoading && categories.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg">Categorías</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Para organizar tus productos, creá categorías y subcategorías que aparecerán en el menú de la tienda.
            Arrastrá <GripVertical className="inline h-3.5 w-3.5 text-fg" /> para reordenar.
          </p>
        </div>
        {!isEmpty && <Button onClick={() => setCreateOpen(true)}>Crear categoría</Button>}
      </div>

      {isEmpty ? (
        <EmptyState
          kicker="Categorías"
          title="Organizá tu catálogo"
          body="Creá categorías y subcategorías (hasta 3 niveles). El menú de tu tienda se arma solo con esta estructura."
          action={{ label: 'Crear mi primera categoría', onClick: () => setCreateOpen(true) }}
        />
      ) : isLoading ? (
        <p className="py-12 text-center text-sm text-fg-muted">Cargando...</p>
      ) : (
        <div ref={listRef} className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {tree.map((node) => (
            <CategoryRow
              key={node.id}
              node={node}
              collapsed={collapsed}
              onToggle={toggle}
              dragId={dragId}
              onDragStart={setDragId}
              onDrop={handleDrop}
              onDuplicate={() => toast('Duplicar categoría — próximamente', { variant: 'info' })}
            />
          ))}
        </div>
      )}

      <p className="inline-flex w-full items-center justify-center gap-1 text-center text-sm text-primary">Más sobre crear y organizar categorías <ExternalLink className="h-3.5 w-3.5" /></p>

      {/* Barra de cambios sin guardar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur md:left-sidebar">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">Tenés cambios de orden sin guardar.</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={discard}>
                Descartar
              </Button>
              <Button onClick={save}>Guardar orden</Button>
            </div>
          </div>
        </div>
      )}

      <CreateCategoryModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        storeId={store.id}
        categories={categories}
      />
    </div>
  );
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function CategoryRow({
  node,
  collapsed,
  onToggle,
  dragId,
  onDragStart,
  onDrop,
  onDuplicate,
}: {
  node: TreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (node: TreeNode) => void;
  onDuplicate: () => void;
}) {
  const [over, setOver] = useState(false);
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);

  return (
    <>
      <div
        data-flip-key={node.id}
        draggable
        onDragStart={() => onDragStart(node.id)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDrop(node);
        }}
        className={cn(
          'flex items-center gap-2 border-b border-border px-3 py-2.5 transition-colors',
          dragId === node.id && 'opacity-40',
          over && 'bg-primary/[0.06] ring-1 ring-inset ring-primary',
        )}
        style={{ paddingLeft: `${0.75 + (node.depth - 1) * 1.75}rem` }}
      >
        <span className="cursor-grab select-none text-fg-subtle active:cursor-grabbing" title="Arrastrar para reordenar">
          <GripVertical className="h-4 w-4" />
        </span>

        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
            className="text-fg-subtle hover:text-fg"
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', !isCollapsed && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="flex-1 text-sm font-medium text-primary">{node.name}</span>
        <span className="hidden text-xs text-fg-subtle sm:inline">/{node.path}</span>

        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicar"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-fg-muted hover:bg-bg-muted"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Más opciones"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-fg-muted hover:bg-bg-muted"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <CategoryRow
            key={child.id}
            node={child}
            collapsed={collapsed}
            onToggle={onToggle}
            dragId={dragId}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDuplicate={onDuplicate}
          />
        ))}
    </>
  );
}

function CreateCategoryModal({
  open,
  onClose,
  storeId,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  categories: CategoryDto[];
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const parentOptions = categories
    .filter((c) => c.depth < 3)
    .map((c) => ({ value: c.id, label: `${'— '.repeat(c.depth - 1)}${c.name}` }));

  const createCategory = useMutation({
    mutationFn: () => api.post<CategoryDto>('/api/v1/categories', { name, parentId: parentId || null }),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ['categories', storeId] });
      toast(`Categoría "${category.name}" creada`, { variant: 'success' });
      setName('');
      setParentId('');
      setError(undefined);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : 'Error inesperado'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear categoría"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={createCategory.isPending} disabled={!name} onClick={() => createCategory.mutate()}>
            Crear
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nombre" required error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Indumentaria" />
        </FormField>
        <FormField label="Categoría padre" hint="Opcional — hasta 3 niveles">
          <Select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            options={parentOptions}
            placeholder="Sin padre (nivel principal)"
          />
        </FormField>
      </div>
    </Modal>
  );
}
