import { useEffect, useRef, type ReactNode } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, Image as ImageIcon, Undo, Redo,
} from 'lucide-react';
import { cn, useToast } from '@tiendafy/ui';
import { api, ApiRequestError } from '../lib/api';

/** Editor WYSIWYG para el contenido de páginas. Devuelve HTML (sanitizado server-side al guardar). */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image.configure({ HTMLAttributes: { class: 'rounded-md' } }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        // rte-content: fuerza el color del texto al token del tema (adapta dark/light).
        class: 'rte-content prose prose-sm max-w-none min-h-[240px] px-3 py-2 focus:outline-none',
      },
    },
  });

  // Sincronizar cuando cambia el contenido desde afuera (abrir el modal con otra página).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Enlace (URL):', prev ?? 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const uploadImage = async (file: File) => {
    try {
      const { url } = await api.upload<{ url: string }>('/api/v1/media', file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : 'No se pudo subir la imagen.', { variant: 'error' });
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrita"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Cursiva"><Italic className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título"><Heading2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Subtítulo"><Heading3 className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada"><ListOrdered className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Cita"><Quote className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={setLink} active={editor.isActive('link')} title="Enlace"><Link2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => fileRef.current?.click()} title="Imagen"><ImageIcon className="h-4 w-4" /></Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Deshacer"><Undo className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Rehacer"><Redo className="h-4 w-4" /></Btn>
      </div>
      <EditorContent editor={editor} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadImage(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Btn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg',
        active && 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

// Evita el warning de tipo no usado de Editor en algunos setups de TS.
export type { Editor };
