import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';

const dismissedKey = (userId: string) => `tiendafy.2fa-reminder-dismissed:${userId}`;

function wasDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(userId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Aviso discreto en el Inicio para los dueños que todavía no activaron la
 * verificación en dos pasos: con la contraseña de un dueño se puede todo. Se
 * cierra con la cruz y no vuelve a aparecer en ese navegador para esa persona.
 */
export function TwoFactorReminder() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const [dismissed, setDismissed] = useState(() => (user ? wasDismissed(user.id) : true));

  if (!user || role !== 'owner' || user.twoFactorEnabled || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissedKey(user.id), '1');
    } catch {
      // Sin almacenamiento, se cierra solo por ahora.
    }
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Recomendación de seguridad"
      className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-card"
    >
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-fg-muted">
        <strong className="text-fg">Protegé tu cuenta de dueño.</strong> Activá la verificación en dos pasos:
        además de la contraseña, un código de tu teléfono.{' '}
        <Link to="/mi-cuenta" className="font-semibold text-primary hover:underline">
          Activarla
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar la recomendación"
        className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-fg"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
