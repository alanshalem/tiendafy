import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import type { ReactNode } from 'react';

/** Estado vacío con marca: ícono en círculo + título + texto + CTA opcional. */
export function EmptyState({
  icon,
  title,
  message,
  cta,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgb(var(--color-primary)/0.1)] text-primary">
        {icon ?? <PackageOpen className="h-8 w-8" />}
      </div>
      <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h2>
      {message && <p className="mt-2 max-w-sm text-sm opacity-65">{message}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-6 inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-fg transition-transform hover:scale-[1.03]"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
