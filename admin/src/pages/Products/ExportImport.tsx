import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { PageHeader, Tabs } from '@tiendafy/ui';
import { HelpLink } from '../../components/HelpLink';
import { ExportTab } from './ExportTab';
import { ImportTab } from './ImportTab';
import { ImagesTab } from './ImagesTab';

const TABS = { export: 'Exportar', import: 'Importar', images: 'Imágenes' } as const;
type Tab = keyof typeof TABS;

export function ExportImportPage() {
  const [tab, setTab] = useState<Tab>('export');

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link
            to="/productos"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> Productos
          </Link>
        }
        title="Exportar e importar"
        subtitle="Economizá tiempo modificando o agregando nuevos productos de forma masiva a través de un archivo .csv de Excel."
      />

      <Tabs
        items={(Object.keys(TABS) as Tab[]).map((t) => ({ id: t, label: TABS[t] }))}
        value={tab}
        onChange={setTab}
      />

      {tab === 'export' ? <ExportTab /> : tab === 'import' ? <ImportTab /> : <ImagesTab />}

      <HelpLink id="productos" />
    </div>
  );
}
