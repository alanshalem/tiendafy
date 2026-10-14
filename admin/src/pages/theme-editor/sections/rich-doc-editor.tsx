import { useEffect, type ReactNode } from 'react';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading3, Heading4, Italic, Link2, List, ListOrdered, Quote, Redo, Undo } from 'lucide-react';
import { cn, usePrompt } from '@tiendafy/ui';
import { isSafeLink, normalizeLink, normalizeRichDoc, type RichDoc } from '@tiendafy/types';

/** Un documento vacío para ProseMirror tiene un párrafo vacío (no puede no tener bloques). */
const toEditor = (doc: RichDoc): JSONContent =>
  doc.content.length > 0 ? (doc as JSONContent) : { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Editor del texto con formato de una sección. Escribe el ÁRBOL del documento
 * (JSON de ProseMirror) recortado a lo que la tienda sabe dibujar —títulos,
 * negrita, cursiva, listas, citas y links—, nunca HTML: ver rich-text.ts.
 * Sin imágenes, código ni tablas (la sección tiene su propia imagen).
 */
export function RichDocEditor({
  value,
  onChange,
  labelledBy,
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  labelledBy?: string;
}) {
  const prompt = usePrompt();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // La sección ya tiene su título (h2): adentro van subtítulos.
        heading: { levels: [3, 4] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
    ],
    content: toEditor(value),
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(normalizeRichDoc(editor.getJSON(), isSafeLink)),
    editorProps: {
      attributes: {
        class: 'rte-content prose prose-sm max-w-none min-h-[180px] px-3 py-2 focus:outline-none',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': 'Texto' }),
      },
    },
  });

  // Cambios desde afuera (deshacer del editor de diseño, otra sección): se
  // compara lo normalizado, así lo que escribió este mismo editor no se reescribe.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = JSON.stringify(normalizeRichDoc(editor.getJSON(), isSafeLink));
    if (current !== JSON.stringify(value)) editor.commands.setContent(toEditor(value), { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  const setLink = async () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const raw = await prompt({
      title: 'Link',
      message: 'A dónde lleva (vacío para quitarlo). Puede ser una ruta de la tienda, como /productos.',
      defaultValue: prev ?? '',
      placeholder: '/productos o https://…',
    });
    if (raw === null) return;
    if (raw.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // El mismo criterio que el resto de los links de la tienda: completa el
    // https:// y descarta javascript:, data: y compañía.
    const href = normalizeLink(raw).href;
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <div className="rounded-md border border-border-strong bg-surface focus-within:ring-2 focus-within:ring-primary/40">
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-1"
        role="toolbar"
        aria-label="Formato"
      >
        <Btn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Negrita"
        >
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Cursiva"
        >
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Subtítulo"
        >
          <Heading3 className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          active={editor.isActive('heading', { level: 4 })}
          title="Subtítulo chico"
        >
          <Heading4 className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Lista"
        >
          <List className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Cita"
        >
          <Quote className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => void setLink()} active={editor.isActive('link')} title="Link">
          <Link2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
          <Undo className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
          <Redo className="h-4 w-4" />
        </Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg',
        active && 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </button>
  );
}
