import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';

/**
 * Cualquier dirección del panel que no existe.
 *
 * Antes caía en una pantalla de relleno ("Aplicaciones — un ecosistema para tu
 * tienda"), que le contestaba cualquier cosa a quien se equivocó de URL o entró
 * por un link viejo. Decir "no existe" y ofrecer la salida es más útil que
 * vender un módulo que no hay.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <EmptyState
      as="h1"
      kicker="Página no encontrada"
      title="Esta dirección no existe"
      body="Puede que el link esté viejo o que la pantalla se haya movido de lugar. Desde el inicio llegás a todo."
      action={{ label: 'Ir al inicio', onClick: () => navigate('/') }}
    />
  );
}
