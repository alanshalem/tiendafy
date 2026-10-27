#!/bin/sh
# Backup diario de un ambiente (lo corre el servicio pg-backup del stack):
#   - la base, con pg_dump en formato custom;
#   - el keyring de DataProtection (volumen dpkeys). Sin él, los secretos que
#     la base guarda cifrados (tokens de Mercado Pago, certificados de ARCA)
#     no se pueden leer: un dump sin su keyring restaura una base a medias.
# Retención: 14 días. La copia fuera del servidor es otro servicio
# (backup-offsite), que levanta lo que quede acá.
set -u

# El dump y el keyring juntos abren todos los secretos de las tiendas: solo el
# dueño los lee. Los archivos se crean 0600 y se le devuelven a quien corre
# deploy.sh (BACKUP_UID/BACKUP_GID); si no vienen, quedan del usuario del contenedor.
umask 077
owner="${BACKUP_UID:-}:${BACKUP_GID:-}"
[ "$owner" = ":" ] && owner=""
# Deja el archivo para su dueño. Un fallo se avisa pero no frena el backup.
handover() {
  [ -n "$owner" ] || return 0
  chown "$owner" "$1" || echo "backup: no pude pasar $1 a $owner" >&2
}
chmod 700 /backups 2> /dev/null\n[ -n "$owner" ] && chown "$owner" /backups 2> /dev/null
while true; do
  stamp="$(date +%Y%m%d-%H%M)"

  # A un .tmp y recién después al nombre final, y solo si el archivo se puede
  # leer entero: un dump cortado nunca tiene que quedar con el nombre de uno
  # bueno (refresh-staging.sh y check-backup.sh agarran "el último").
  tmp="/backups/.tiendafy-$stamp.dump.tmp"
  if pg_dump -h postgres -U tiendafy -d tiendafy -Fc -f "$tmp" && pg_restore -l "$tmp" > /dev/null; then
    mv "$tmp" "/backups/tiendafy-$stamp.dump" && handover "/backups/tiendafy-$stamp.dump"
  else
    echo "backup: falló el dump de $stamp" >&2
    rm -f "$tmp"
  fi

  tmp="/backups/.dpkeys-$stamp.tgz.tmp"
  if tar czf "$tmp" -C /keys . && tar tzf "$tmp" > /dev/null; then
    mv "$tmp" "/backups/dpkeys-$stamp.tgz" && handover "/backups/dpkeys-$stamp.tgz"
  else
    echo "backup: falló la copia del keyring de $stamp" >&2
    rm -f "$tmp"
  fi

  find /backups -maxdepth 1 \( -name 'tiendafy-*.dump' -o -name 'dpkeys-*.tgz' \) -mtime +14 -delete
  sleep 86400
done
