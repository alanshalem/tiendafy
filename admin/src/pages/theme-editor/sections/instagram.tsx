import { Field, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

export function InstagramEditor({ data, set }: SectionEditorProps<'instagram'>) {
  return (
    <Field
      label="Link de video o publicación"
      hint="YouTube, Vimeo, o un post/reel de Instagram (instagram.com/p/… o /reel/…). Si pegás una cuenta (instagram.com/usuario) se muestra un botón al perfil — Instagram no permite embeber el feed completo."
    >
      <TextInput
        value={data.video}
        onChange={(v) => set({ video: v })}
        placeholder="https://instagram.com/p/…  ó  https://youtube.com/watch?v=…"
      />
    </Field>
  );
}
