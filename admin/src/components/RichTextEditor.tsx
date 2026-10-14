import { useEffect, type ReactNode } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Image as ImageIcon,
  Undo,
  Redo,
} from 'lucide-react';
import { cn, usePrompt } from '@tiendafy/ui';
import { UPLOADS, describe } from '../lib/uploads';
import { UploadBar, UploadNotes, uploadMedia, useFilePicker, useUploadQueue } from './upload/primitives';

/**
 * Editor WYSIWYG para el contenido de páginas. Devuelve HTML (sanitizado server-side al guardar).
 * `labelledBy`: id del texto que lo nombra (un contenteditable no se asocia con `<label htmlFor>`).
 */
export function RichTextEditor({
  value,
  onChange,
  labelledBy,
}: {
  value: string;
  onChange: (html: string) => void;
  labelledBy?: string;
}) {
  const prompt = usePrompt();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image.configure({ HTMLAttributes: { class: 'rounded-md' } }),
    ],
    content: value,
    // Tiptap 3 ya no re-renderiza en cada cambio: sin esto la barra nunca
    // marcaba la negrita, la lista o el enlace donde está el cursor.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        // rte-content: fuerza el color del texto al token del tema (adapta dark/light).
        class: 'rte-content prose prose-sm max-w-none min-h-[240px] px-3 py-2 focus:outline-none',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': 'Contenido' }),
      },
    },
  });

  // Una imagen por vez: sube con su avance arriba del texto y entra donde
  // estaba el cursor.
  const images = useUploadQueue('pageImage', uploadMedia);
  const picker = useFilePicker({
    kind: 'pageImage',
    onFiles: (files) =>
      void images.run(files.slice(0, 1), (url) => editor?.chain().focus().setImage({ src: url }).run()),
  });

  // Sincronizar cuando cambia el contenido desde afuera (abrir el modal con otra página).
  // Un editor ya destruido (Tiptap lo rearma al montar dos veces) no tiene
  // esquema: preguntarle el HTML tiraba "reading 'cached'" y rompía la pantalla.
  // Sin emitUpdate: lo que llega de afuera no es una edición. Tiptap 3 avisa
  // por defecto, y un HTML guardado que el editor normaliza distinto (texto
  // suelto que envuelve en <p>) volvía como onChange y el form quedaba
  // "modificado" sin que nadie tocara nada: preguntaba al cerrarlo.
  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== editor.getHTML())
      editor.commands.setContent(value || '', { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  const setLink = async () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = await prompt({
      title: 'Enlace',
      message: 'URL del enlace (vacío para quitar):',
      defaultValue: prev ?? 'https://',
      placeholder: 'https://...',
    });
    if (url === null) return;
    if (url.trim() === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const spec = describe(UPLOADS.pageImage);
  const uploading = images.pending[0];

  return (
    <div className="rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
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
        <Sep />
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Título"
        >
          <Heading2 className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Subtítulo"
        >
          <Heading3 className="h-4 w-4" />
        </Btn>
        <Sep />
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
        <Sep />
        <Btn onClick={setLink} active={editor.isActive('link')} title="Enlace">
          <Link2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={picker.open} title="Imagen" hint={`Imagen: ${spec.formats} · ${spec.weight}`}>
          <ImageIcon className="h-4 w-4" />
        </Btn>
        <Sep />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
          <Undo className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
          <Redo className="h-4 w-4" />
        </Btn>
      </div>
      {uploading && (
        <div className="relative flex items-center gap-2 overflow-hidden border-b border-border px-3 py-2">
          {uploading.preview && (
            <img
              src={uploading.preview}
              alt=""
              className="h-9 w-9 shrink-0 rounded object-cover opacity-70"
            />
          )}
          <UploadBar
            name={uploading.file.name}
            fraction={uploading.progress}
            onCancel={() => images.cancel(uploading.id)}
            className="flex-1"
          />
        </div>
      )}
      {images.notes.length > 0 && (
        <div className="border-b border-border p-2">
          <UploadNotes notes={images.notes} onDismiss={images.dismissNotes} showFile={false} />
        </div>
      )}
      <EditorContent editor={editor} />
      {picker.input}
    </div>
  );
}

function Btn({
  onClick,
  active,
  title,
  hint,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  /** Lo que muestra al pasar el mouse, si dice más que el nombre. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={hint ?? title}
      // Los de formato (negrita, listas…) son interruptores: se anuncia si están puestos.
      aria-pressed={active}
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
