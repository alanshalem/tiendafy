import type { ComponentType, ReactNode } from 'react';
import { cn } from './cn';

export interface BreadcrumbItem {
  label: ReactNode;
  /** Sin href = item actual (no clickeable). */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /**
   * Componente de link del router de la app (next/link, react-router Link).
   * Default <a> — funciona en ambas, pierde client-side navigation.
   */
  linkComponent?: ComponentType<{ href: string; className?: string; children: ReactNode }>;
  className?: string;
}

function DefaultLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function Breadcrumbs({ items, linkComponent: Link = DefaultLink, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <svg className="h-4 w-4 text-fg-subtle" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m8 6 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {item.href && !isLast ? (
                <Link href={item.href} className="text-fg-muted hover:text-fg hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className={cn(isLast ? 'font-medium text-fg' : 'text-fg-muted')}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
