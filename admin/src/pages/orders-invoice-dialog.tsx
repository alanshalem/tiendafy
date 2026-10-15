import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button, FormField, Input, Modal, Select } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';
import { useModalFormGuard } from '../lib/useUnsavedChanges';

/** Condición frente al IVA, como la entiende la API (ver IvaConditionWire). */
export type IvaCondition = 'ResponsableInscripto' | 'Monotributo' | 'Exento' | 'ConsumidorFinal';

/** Lo que el diálogo le pasa a la facturación. Vacío = como siempre. */
export interface InvoiceBuyer {
  buyerDoc?: string;
  buyerIvaCondition?: IvaCondition;
}

const CONDICIONES: { value: '' | IvaCondition; label: string }[] = [
  { value: '', label: 'Según el documento' },
  { value: 'ResponsableInscripto', label: 'Responsable inscripto' },
  { value: 'Monotributo', label: 'Monotributo' },
  { value: 'Exento', label: 'IVA exento' },
  { value: 'ConsumidorFinal', label: 'Consumidor final' },
];

interface Padron {
  name: string;
  condicion: IvaCondition;
  address: string | null;
}

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/**
 * Antes de facturar una venta: con qué documento y con qué condición de IVA.
 *
 * Sin tocar nada, se factura como siempre —el documento que dejó el comprador
 * y la condición que se deduce de él—. Lo que este paso agrega es lo que el
 * documento solo no resuelve: una persona física Responsable Inscripto (el
 * CUIT dice "persona", no "inscripta", y sin declararlo sale B), y una venta
 * grande sin documento, que ARCA no deja facturar anónima. "Consultar en ARCA"
 * trae del padrón el nombre y la condición real.
 */
export function InvoiceDialog({
  open,
  initialDoc,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initialDoc: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (buyer: InvoiceBuyer) => void;
}) {
  const [doc, setDoc] = useState(initialDoc ?? '');
  const [condicion, setCondicion] = useState<'' | IvaCondition>('');
  const [padron, setPadron] = useState<Padron | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dirty, close } = useModalFormGuard({ doc: doc.trim(), condicion }, onClose);

  const esCuit = soloDigitos(doc).length === 11;

  const consultar = async () => {
    setConsultando(true);
    setError(null);
    setPadron(null);
    try {
      const r = await api.get<Padron>(`/api/v1/fiscal/padron/${soloDigitos(doc)}`);
      setPadron(r);
      setCondicion(r.condicion);
    } catch (e) {
      setError(errMsg(e, 'No se pudo consultar el padrón.'));
    } finally {
      setConsultando(false);
    }
  };

  const confirmar = () =>
    onConfirm({
      // Solo se manda lo que cambió: el resto lo resuelve el backend como antes.
      buyerDoc: doc.trim() && doc.trim() !== (initialDoc ?? '') ? doc.trim() : undefined,
      buyerIvaCondition: condicion || undefined,
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty}
      title="Facturar la venta"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Facturar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <FormField
              label="DNI o CUIT del comprador"
              hint="Vacío: consumidor final sin identificar (no se puede por encima del umbral de ARCA)."
            >
              <Input
                value={doc}
                onChange={(e) => {
                  setDoc(e.target.value);
                  setPadron(null);
                }}
                inputMode="numeric"
                placeholder="20-12345678-6"
              />
            </FormField>
          </div>
          <Button variant="secondary" className="mt-6" onClick={consultar} disabled={!esCuit || consultando}>
            {consultando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            Consultar en ARCA
          </Button>
        </div>

        {padron && (
          <div className="rounded-md bg-bg-muted px-3 py-2 text-sm">
            <p className="font-medium text-fg">{padron.name}</p>
            {padron.address && <p className="text-xs text-fg-muted">{padron.address}</p>}
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}

        <FormField
          label="Condición frente al IVA"
          hint="Define si sale Factura A o B. Sin elegir, una sociedad sale A y una persona, B."
        >
          <Select
            value={condicion}
            onChange={(e) => setCondicion(e.target.value as '' | IvaCondition)}
            options={CONDICIONES}
          />
        </FormField>
      </div>
    </Modal>
  );
}
