'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Icon } from './Icon';
import { useAuth } from './auth';
import { usePreviewHref } from './preview';

// El formulario de ingreso (con su captcha y el botón de Google) baja recién
// cuando alguien lo abre: el ícono va en todas las páginas, el modal casi nunca.
const AuthModal = dynamic(() => import('./AuthModal').then((m) => m.AuthModal), { ssr: false });

/** Entrada de cuenta en el header: menú si está logueado, modal de login si no. */
export function AccountButton() {
  const { user, logout } = useAuth();
  const href = usePreviewHref();
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menu]);

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModal(true)}
          aria-label="Iniciar sesión"
          title="Iniciar sesión"
          className="-m-2.5 p-2.5 opacity-90 hover:opacity-100"
        >
          <Icon name="user" className="h-5 w-5" />
        </button>
        {modal && <AuthModal onClose={() => setModal(false)} />}
      </>
    );
  }

  const firstName = user.name.split(' ')[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenu((o) => !o)}
        className="inline-flex items-center gap-1.5 opacity-90 hover:opacity-100"
        aria-label="Mi cuenta"
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <Icon name="user" className="h-5 w-5" />
        <span className="hidden max-w-[7rem] truncate text-sm sm:inline">{firstName}</span>
      </button>
      {menu && (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-lg border border-[rgb(var(--color-fg)/0.12)] bg-bg shadow-xl">
          <div className="border-b border-[rgb(var(--color-fg)/0.1)] px-4 py-3">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-fg-muted">{user.email}</div>
          </div>
          <Link
            href={href('/cuenta')}
            onClick={() => setMenu(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[rgb(var(--color-fg)/0.06)]"
          >
            <Icon name="user" className="h-4 w-4" /> Mi cuenta y pedidos
          </Link>
          <Link
            href={href('/cuenta/conversaciones')}
            onClick={() => setMenu(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[rgb(var(--color-fg)/0.06)]"
          >
            <Icon name="chat" className="h-4 w-4" /> Mis conversaciones
          </Link>
          <Link
            href={href('/favoritos')}
            onClick={() => setMenu(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[rgb(var(--color-fg)/0.06)]"
          >
            <Icon name="heart" className="h-4 w-4" /> Mis favoritos
          </Link>
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              logout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-[rgb(var(--color-fg)/0.06)]"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
