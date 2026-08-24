// Config de runtime del admin. En desarrollo queda vacía a propósito: manda el
// .env de Vite. En el servidor, el contenedor REESCRIBE este archivo al
// arrancar (ver admin/docker-config.sh), y por eso la misma imagen puede
// apuntar a staging o a producción sin recompilar.
window.__TIENDAFY_CONFIG__ = {};
