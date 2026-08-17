import {
  Calendar,
  Check,
  ExternalLink,
  Lock,
  Pencil,
  Plus,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@tiendafy/ui';
import { useStore } from '../../context/StoreContext';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { SETTINGS_CARD, TABLE_CARD } from '../../lib/styles';

export function DomainsPage() {
  const { store } = useStore();

  const domains = store
    ? [
        {
          domain: `${store.subdomain}.tiendafy.com`,
          isDefault: true,
          status: 'Activado',
          ssl: 'SSL activado',
        },
        ...(store.customDomain
          ? [{ domain: store.customDomain, isDefault: false, status: 'Activado', ssl: 'SSL activado' }]
          : []),
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <SettingsHeader
        title="Dominios"
        description="El dominio es la dirección de tu tienda en internet. Podés tener más de uno y administrarlos desde acá."
        action={
          <button className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
            <Plus className="h-4 w-4" /> Agregar
          </button>
        }
      />

      <h2 className="mb-3 text-base font-semibold text-fg">Administrá tus dominios</h2>
      <div className={TABLE_CARD}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-2.5">Dominios</th>
              <th className="px-4 py-2.5">Estado del dominio</th>
              <th className="px-4 py-2.5">Estado del certificado SSL</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.domain} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3">
                  <span className="font-medium text-fg">{d.domain}</span>
                  {d.isDefault && (
                    <span className="ml-2 rounded-full bg-bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
                      Por defecto
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="success">
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> {d.status}
                    </span>
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="success">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3.5 w-3.5" /> {d.ssl}
                    </span>
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="rounded-full border border-border p-1.5 text-fg-muted hover:bg-bg-muted"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-fg">Aprendé más</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            {
              icon: Settings,
              title: 'Configurá tu dominio',
              body: 'Usá un dominio propio para destacar la identidad de tu marca.',
            },
            {
              icon: Search,
              title: 'Verificá la configuración',
              body: 'Seguí estos pasos para revisar si tu dominio quedó vinculado correctamente.',
            },
            {
              icon: Calendar,
              title: 'Consultá el vencimiento',
              body: 'Identificá si el registro de tu dominio debe ser renovado pronto.',
            },
            {
              icon: Lock,
              title: 'Certificado de seguridad',
              body: 'Conocé si tu certificado de seguridad está activo.',
            },
          ] as { icon: LucideIcon; title: string; body: string }[]
        ).map((card) => (
          <div key={card.title} className={SETTINGS_CARD}>
            <card.icon className="h-5 w-5 text-fg-muted" />
            <h3 className="mt-2 font-semibold text-fg">{card.title}</h3>
            <p className="mt-1 text-sm text-fg-muted">{card.body}</p>
            <a
              href="/ayuda/domains"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver tutorial <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>

      <HelpLink id="domains" />
    </div>
  );
}
