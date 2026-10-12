import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { HelpLink } from '../../components/HelpLink';
import { ExportTab } from './ExportTab';
import { ImportTab } from './ImportTab';
import { ImagesTab } from './ImagesTab';

const TABS = { export: 'Exportar', import: 'Importar', images: 'Imágenes' } as const;
type Tab = keyof typeof TABS;

export function ExportImportPage() {
  const [tab, setTab] = useState<Tab>('export');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/productos"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="h-4 w-4" /> Productos
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-fg">Exportar e importar</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Economizá tiempo modificando o agregando nuevos productos de forma masiva a través de un archivo
          .csv de Excel.
        </p>
      </div>

      <div className="flex border-b border-border text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px flex-1 border-b-2 pb-3 font-medium',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {TABS[t]}
          </button>
        ))}
      </div>

      {tab === 'export' ? <ExportTab /> : tab === 'import' ? <ImportTab /> : <ImagesTab />}

      <HelpLink id="productos" />
    </div>
  );
}
