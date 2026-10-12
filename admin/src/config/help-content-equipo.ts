import type { HelpArticle } from './helpContent';

export const EQUIPO = {
  users: {
    title: 'Roles y permisos',
    intro: 'Invitá a tu equipo y dale a cada persona exactamente lo que necesita — ni más ni menos.',
    category: 'Equipo',
    sections: [
      {
        heading: 'Agregar a alguien',
        steps: [
          'En Configuración → Usuarios, tocá “Agregar”, poné su email y elegí el rol.',
          'Si todavía no tenía cuenta, se la creamos: le llega un email para definir su contraseña.',
          'Listo: al entrar al panel ve solo las secciones y acciones que tiene habilitadas.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Usuarios'] }],
      },
      {
        heading: 'Una cuenta, un rol por tienda',
        steps: [
          'Cada persona entra con su email y su contraseña, la misma para todas las tiendas.',
          'Lo que puede hacer se elige por tienda: puede ser vendedora en una y no tener acceso a otra.',
          'Para darle acceso a otra tienda, entrá a esa tienda y sumala desde Configuración → Usuarios.',
          'Nadie ve las contraseñas: si alguien la olvida, la restablece desde “¿Olvidaste tu contraseña?”.',
        ],
      },
      {
        heading: 'Los roles, de fábrica',
        blocks: [
          {
            type: 'table',
            headers: ['Rol', 'Qué puede', 'Qué NO puede'],
            rows: [
              ['Dueño', 'Todo, siempre: dominios, equipo y borrar la tienda', '—'],
              [
                'Administrador',
                'Todo lo operativo y la configuración',
                'Dominios, editar ni borrar la tienda',
              ],
              [
                'Vendedor',
                'Ventas (ver, registrar y despachar), presupuestos, Mercado Libre, clientes, chat y mensajes',
                'Devolver plata, ver costos ni configurar',
              ],
              [
                'Catálogo',
                'Productos, precios, stock, costos y publicaciones de Mercado Libre',
                'Ver ventas ni clientes',
              ],
              [
                'Finanzas',
                'Ventas y estadísticas, devoluciones, facturación, tesorería y compras',
                'Despachar, editar productos ni conectar cobros',
              ],
              [
                'Soporte',
                'Chat posventa, mensajes, preguntas de Mercado Libre y ver las ventas',
                'Modificar ventas o configuración',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Esto es lo que trae cada rol. En tu tienda lo podés cambiar funcionalidad por funcionalidad.',
          },
        ],
      },
      {
        heading: 'Cambiar qué puede cada rol',
        steps: [
          'En Configuración → Roles y permisos tenés una grilla: cada fila es una funcionalidad, cada columna un rol.',
          'Tildá o destildá: vale desde el próximo clic de esa gente, sin que tengan que volver a entrar.',
          'Lo que cambiaste respecto de fábrica queda marcado con un punto; “Restaurar” vuelve el rol a como venía.',
          'Algunas cosas necesitan otra para servir (devolver plata necesita ver las ventas): se tildan juntas.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Roles y permisos'] }],
      },
      {
        heading: 'Excepciones para una persona',
        steps: [
          'Si a alguien puntual le hace falta algo que su rol no trae (o al revés), no hace falta cambiarle el rol.',
          'En Configuración → Usuarios, tocá el botón de permisos de su fila y tildá o destildá.',
          'Esa persona queda marcada como “Personalizado”. “Volver a lo del rol” le saca las excepciones.',
          'Si le cambiás el rol, las excepciones se borran: eran para el puesto anterior.',
        ],
      },
      {
        heading: 'Reglas de seguridad',
        blocks: [
          {
            type: 'checklist',
            items: [
              'El dueño puede todo, siempre: la tienda nunca queda sin alguien que pueda arreglar los permisos.',
              'Nadie da ni quita algo que él mismo no puede hacer.',
              'Nadie asigna un rol por encima del propio ni toca a alguien de su mismo rango.',
              'Solo un dueño puede nombrar o modificar dueños, y la tienda nunca queda sin dueño.',
              'Crear tiendas nuevas es de dueños; editar, archivar o borrar una tienda, solo de su dueño.',
              'Nadie se cambia sus propios permisos.',
              'Cada cambio queda en el registro de actividad (Configuración → Usuarios): quién, qué y cuándo.',
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
