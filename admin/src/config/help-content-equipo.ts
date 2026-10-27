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
          'En Configuración → Usuarios, tocá “Agregar usuario”, poné su email (y su nombre, si querés), elegí el rol y tocá “Agregar”. La lista de roles muestra solo los que vos podés asignar.',
          'Si todavía no tenía cuenta, se la creamos: le llega un email para definir su contraseña. Si ya tenía (por ejemplo, porque trabaja en otra tienda del grupo), no le llega nada: entra con la contraseña de siempre y ya ve esta tienda. El aviso al agregarla te dice cuál de los dos casos fue.',
          'Listo: al entrar al panel ve solo las secciones y acciones que tiene habilitadas.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Usuarios'] }],
      },
      {
        heading: 'Qué muestra la pantalla de Usuarios',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Arriba, cuántas personas tienen acceso, cuántos dueños hay, cuántos pueden devolver plata y cuántos pueden invitar gente.',
              'Si hay un solo dueño, un aviso te sugiere sumar un segundo dueño de confianza.',
              'La lista con el rol de cada persona (lo cambiás desde ahí mismo), sus “Accesos sensibles” y desde cuándo está. En el teléfono, cada persona es una tarjeta con su rol y sus botones.',
              'Abajo, “Los roles, en resumen”, con el link a Roles y permisos, y la “Actividad del equipo”.',
              'Para sacar a alguien de la tienda, el tacho de su fila. Sigue teniendo su cuenta, pero ya no entra a esta tienda.',
            ],
          },
        ],
      },
      {
        heading: 'Una cuenta, un rol por tienda',
        steps: [
          'Cada persona entra con su email y su contraseña, la misma para todas las tiendas.',
          'Lo que puede hacer se elige por tienda: puede ser vendedora en una y no tener acceso a otra.',
          'Para darle acceso a otra tienda, entrá a esa tienda y sumala desde Configuración → Usuarios.',
          'Nadie ve las contraseñas: si alguien la olvida, la restablece desde “¿Olvidaste tu contraseña?”.',
          'Cada persona puede sumarle a su cuenta la verificación en dos pasos (un código del teléfono además de la contraseña), desde Mi cuenta. Para dueños y administradores es obligatoria: la configuran al entrar.',
        ],
      },
      {
        heading: 'Los roles, de fábrica',
        blocks: [
          {
            type: 'table',
            headers: ['Rol', 'Qué puede', 'Qué NO puede'],
            rows: [
              ['Dueño', 'Todo, siempre: dominios, equipo y editar o borrar la tienda', '—'],
              [
                'Administrador',
                'Todo lo operativo, el equipo y la configuración',
                'Dominios, editar ni borrar la tienda',
              ],
              [
                'Vendedor',
                'Ventas (ver, registrar y despachar), presupuestos, atender Mercado Libre (ventas, preguntas y mensajes), ver clientes, chat posventa, mensajes, reseñas, estadísticas, y ver el stock y los cupones',
                'Devolver plata, ver costos, editar productos ni configurar',
              ],
              [
                'Catálogo',
                'Productos, precios y listas de precios, stock, costos y publicaciones de Mercado Libre',
                'Ver ventas ni clientes',
              ],
              [
                'Finanzas',
                'Ver ventas, devolver plata, facturación, tesorería y cuentas corrientes, compras, costos y estadísticas; además ver clientes, cupones, stock y cómo están conectados los cobros',
                'Despachar, editar productos ni conectar cobros',
              ],
              [
                'Soporte',
                'Chat posventa, mensajes, reseñas, atender Mercado Libre y ver las ventas y los clientes',
                'Modificar ventas, ver estadísticas ni configurar',
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
          'Lo que cambiaste respecto de fábrica queda marcado con un punto; “Restaurar”, arriba de la columna, vuelve el rol a como venía (las excepciones de cada persona se mantienen).',
          'Lo que mueve plata, toca la facturación o da más accesos lleva la marca “sensible”: pensalo dos veces antes de dárselo a un rol.',
          'Algunas cosas necesitan otra para servir (devolver plata necesita ver las ventas): se tildan juntas, y al destildar la de base se van las que dependen de ella.',
          'Cada uno edita solo los roles por debajo del suyo, y la columna del dueño no se edita. Si tu rol no puede cambiar la matriz, la ves en “Solo lectura”.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Roles y permisos'] }],
      },
      {
        heading: 'Excepciones para una persona',
        steps: [
          'Si a alguien puntual le hace falta algo que su rol no trae (o al revés), no hace falta cambiarle el rol.',
          'En Configuración → Usuarios, tocá el ícono de ajustes de su fila (“Permisos de esta persona”), tildá o destildá y guardá.',
          'Esa persona queda marcada como “Personalizado”. “Volver a lo del rol” le saca las excepciones.',
          'Si le cambiás el rol, las excepciones se borran: eran para el puesto anterior. El panel te avisa antes.',
          'La columna “Accesos sensibles” cuenta cuántos permisos de ese tipo tiene cada persona: sirve para revisar de un vistazo quién puede devolver plata o sumar gente.',
        ],
      },
      {
        heading: 'Varias tiendas: Mis tiendas',
        paragraphs: [
          'En Plataforma → Mis tiendas ves todas las tiendas del grupo con lo que vendió cada una en los últimos 30 días, y entrás a cualquiera. Para cambiar de tienda sin salir de lo que estás haciendo, usá el selector de tienda de arriba.',
          'Crear una tienda nueva (“Crear tienda”: nombre y URL de la tienda) es de quien ya es dueño de alguna, y queda como dueño de la nueva. Editar, archivar o eliminar una, solo de su dueño, desde el menú de su fila. Archivar la saca de las tiendas activas y se vuelve atrás con “Activar”. Eliminar pide escribir el nombre de la tienda para confirmar; los datos no se borran, pero la tienda deja de estar accesible y solo se recupera pidiéndolo a soporte.',
        ],
        blocks: [{ type: 'path', segments: ['Plataforma', 'Mis tiendas'] }],
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
              'Crear tiendas nuevas es de dueños; editar, archivar o borrar una tienda, solo de su dueño. Los dominios de la tienda también son solo del dueño: no se pueden delegar.',
              'Nadie se da excepciones a sí mismo. Bajarte el rol sí podés, y el panel te pide confirmar porque podrías quedarte sin acceso a esta pantalla.',
              'Cada cambio queda en “Actividad del equipo”, al pie de Configuración → Usuarios: quién, qué y cuándo.',
            ],
          },
        ],
      },
    ],
  },
  dosPasos: {
    title: 'Verificación en dos pasos',
    intro:
      'Un segundo paso al entrar al panel: además de la contraseña, un código que cambia cada 30 segundos en una app de tu teléfono. Si alguien consigue tu contraseña, sin tu teléfono no entra. Para dueños y administradores es obligatoria.',
    category: 'Equipo',
    keywords: [
      '2FA',
      'MFA',
      'doble factor',
      'autenticación',
      'Google Authenticator',
      'Authy',
      'seguridad',
      'código',
      'obligatoria',
      'perdí el teléfono',
    ],
    sections: [
      {
        heading: 'Obligatoria para dueños y administradores',
        paragraphs: [
          'Si sos dueño o administrador de alguna tienda, no podés usar el panel sin la verificación en dos pasos: con tu contraseña se maneja la tienda entera (cobros, precios, el equipo). La primera vez que entres después de que se exija, te pedimos configurarla antes de seguir: tocá “Empezar”, escaneá el código QR con la app y escribí el código que te muestra. Al terminar te mostramos los códigos de recuperación y entrás al panel.',
          'Si ya tenías el panel abierto, la próxima pantalla que cargues te lleva a la misma configuración.',
          'No se puede desactivar. Sí podés generar códigos de recuperación nuevos o pasarla a otra app (por ejemplo, si cambiás de teléfono).',
          'Para los demás roles es opcional: en el Inicio te aparece un aviso que te la recomienda.',
        ],
      },
      {
        heading: 'Activarla',
        steps: [
          'Instalá en tu teléfono una app de autenticación: Google Authenticator, Microsoft Authenticator, Authy, 1Password o la que uses para otras cuentas.',
          'En el panel, abrí el menú de tu cuenta (tu inicial, arriba a la derecha) y entrá a Mi cuenta. (Si sos dueño o administrador, el panel te la pide al entrar: seguí desde el paso 4.)',
          'En “Verificación en dos pasos”, tocá “Activar”.',
          'Con la app, escaneá el código QR que aparece. Si no podés escanearlo, en la app elegí “Ingresar clave” y escribí la clave que figura abajo del QR.',
          'Escribí el código de 6 dígitos que te muestra la app y tu contraseña (para confirmar que sos vos: una sesión abierta en una computadora ajena no alcanza para activarla), y tocá “Confirmar y activar”.',
          'Te mostramos 10 códigos de recuperación. Descargalos o copialos y guardalos fuera de la computadora (en tu gestor de contraseñas, por ejemplo): no se vuelven a mostrar.',
        ],
        blocks: [{ type: 'path', segments: ['Tu cuenta', 'Mi cuenta'] }],
      },
      {
        heading: 'Entrar con la verificación activa',
        steps: [
          'Escribí tu email y tu contraseña como siempre.',
          'Te pedimos el código de la app: abrila y escribí el que muestra en ese momento. Tenés unos minutos; si se pasan, volvé a poner la contraseña.',
          'Si la sesión vence con el panel abierto, el mismo aviso que te pide la contraseña te pide después el código.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Cada código sirve una sola vez. Si la app muestra el mismo que acabás de usar, esperá a que cambie.',
          },
        ],
      },
      {
        heading: 'Si perdés el teléfono',
        steps: [
          'En la pantalla del código, tocá “¿No tenés el teléfono? Usá un código de recuperación” y escribí uno de los que guardaste. Cada uno sirve una sola vez.',
          'Ya adentro, en Mi cuenta tocá “Pasar a otra app”: te pedimos tu contraseña y otro código de recuperación, escaneás el QR nuevo con el teléfono nuevo y confirmás con el código que muestra. Después generá códigos de recuperación nuevos.',
          'Sin teléfono y sin códigos de recuperación no podés entrar: pedile a quien opera la plataforma que te borre la verificación (antes te va a pedir confirmar que sos vos por otro medio). Al entrar con tu contraseña la configurás de nuevo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'En Mi cuenta ves cuántos códigos de recuperación te quedan. Cuando quedan 3 o menos, generá nuevos (los anteriores dejan de servir).',
          },
        ],
      },
      {
        heading: 'Desactivarla, generar códigos nuevos o pasarla a otra app',
        paragraphs: [
          'Las tres cosas se hacen desde Mi cuenta y piden confirmar que sos vos: tu contraseña, o un código (de la app o de recuperación). Así, una sesión que quedó abierta en una computadora ajena no alcanza para sacarle el segundo paso a tu cuenta.',
          'Pasarla a otra app pide las dos cosas: tu contraseña y un código. Hasta que confirmes con el código de la app nueva, sigue valiendo la de antes; al confirmar, la anterior deja de servir. Los códigos de recuperación siguen siendo los mismos.',
          'Al desactivarla, la clave de la app y los códigos de recuperación se borran: si la volvés a activar, hay que escanear un QR nuevo. Dueños y administradores no la pueden desactivar.',
        ],
      },
      {
        heading: 'Intentos fallidos',
        paragraphs: [
          'Los códigos equivocados cuentan igual que una contraseña equivocada: después de 5 intentos fallidos seguidos, la cuenta queda bloqueada unos minutos y no entra ni con el código bueno. Pasado ese tiempo se puede volver a probar.',
        ],
      },
      {
        heading: 'Es de cada persona',
        paragraphs: [
          'Si no te la exigen y no la tenés activa, en el Inicio te aparece un aviso que te la recomienda. Lo podés cerrar; no vuelve a aparecer en esa computadora.',
          'La verificación en dos pasos es de cada persona: un dueño no puede activarla ni desactivarla por otra persona del equipo. Si sumás a alguien como administrador, la va a tener que configurar al entrar.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
