'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useCart } from './cart';
import { usePreviewHref } from './preview';

import { API_URL as API } from '@/lib/api-client';

export function ResetPassword() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch(`${API}/api/v1/shop/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
      credentials: 'include',
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else {
      const d = await res.json().catch(() => null);
      setError(d?.detail ?? 'El link no es válido o expiró. Pedí uno nuevo.');
    }
  };

  if (!token) {
    return <p className="py-16 text-center text-sm opacity-70">Link inválido. Pedí uno nuevo desde &quot;Olvidé mi contraseña&quot;.</p>;
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>¡Listo!</h1>
        <p className="mt-2 text-sm opacity-70">Tu contraseña fue cambiada y ya iniciaste sesión.</p>
        <Link href={href('/cuenta')} className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg">Ir a mi cuenta</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm py-12">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Nueva contraseña</h1>
      <p className="mt-1 text-sm opacity-60">Elegí una contraseña de al menos 8 caracteres.</p>
      <input
        type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder="Nueva contraseña" required minLength={8}
        className="mt-4 h-11 w-full rounded-md border border-[rgb(var(--color-fg)/0.2)] bg-transparent px-3 text-sm outline-none focus:border-primary"
      />
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={busy || password.length < 8} className="mt-4 flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-fg disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
