# pgAdmin con la base de desarrollo ya cargada y sin nada que tipear.
#
# El archivo de contraseñas se COPIA adentro de la imagen en vez de montarse:
# libpq rechaza un archivo de credenciales con permisos abiertos, y un bind
# mount de Windows siempre los tiene (-rwxrwxrwx). Copiado con --chmod=600 sí
# lo acepta, y entonces el servidor conecta de un click.
#
# Son las credenciales de DESARROLLO, las mismas que están en el compose.
# En un servidor esto no se usa: la base productiva no se abre a un panel web.
FROM dpage/pgadmin4:latest

COPY --chown=5050:0 --chmod=600 pgpass /pgpass
COPY --chown=5050:0 servers.json /pgadmin4/servers.json
