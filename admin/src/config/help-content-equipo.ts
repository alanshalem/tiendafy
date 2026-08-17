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
          'La persona se registra en Tiendafy con su email (una vez).',
          'En Configuración → Usuarios, tocá “Agregar”, poné su email y elegí el rol.',
          'Listo: al entrar al panel ve solo las secciones y acciones de su rol.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Usuarios'] }],
      },
      {
        heading: 'Los roles',
        blocks: [
          {
            type: 'table',
            headers: ['Rol', 'Qué puede', 'Qué NO puede'],
            rows: [
              ['Dueño', 'Control total: dominios, plan y gestión de otros dueños', '—'],
              ['Administrador', 'Todo lo operativo y la configuración', 'Plan y gestión de dueños'],
              [
                'Vendedor',
                'Ventas (ver y despachar), clientes, chat posventa y mensajes',
                'Reembolsar ni tocar configuración',
              ],
              ['Catálogo', 'Productos, categorías, inventario e imágenes', 'Ver ventas ni clientes'],
              [
                'Finanzas',
                'Leer ventas y estadísticas, ejecutar reembolsos, ver config de pagos',
                'Editar catálogo ni configuración general',
              ],
              [
                'Soporte',
                'Chat posventa, mensajes de contacto y lectura de pedidos',
                'Modificar ventas o configuración',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Reglas de seguridad',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Nadie puede asignar un rol por encima del propio.',
              'Solo un dueño puede nombrar o modificar dueños.',
              'La tienda nunca puede quedar sin dueño.',
              'Todo intento de acción sin permiso se bloquea y queda registrado.',
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
