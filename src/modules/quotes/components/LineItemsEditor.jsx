import { formatCurrency } from '../../../shared/utils/formatCurrency'

const inputCls = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

export default function LineItemsEditor({ items, catalogue, onChange }) {
  function addRow() {
    onChange([...items, { item_id: '', description: '', quantity: 1, unit: 'each', unit_price: 0, tax_rate: 15 }])
  }

  function removeRow(i) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  const NUMERIC_FIELDS = ['quantity', 'unit_price', 'tax_rate']

  function updateRow(i, field, value) {
    let v = value
    if (NUMERIC_FIELDS.includes(field)) {
      const n = Number(value)
      if (!Number.isNaN(n) && n < 0) v = 0
    }
    const next = items.map((it, idx) => idx === i ? { ...it, [field]: v } : it)
    onChange(next)
  }

  function selectCatalogueItem(i, itemId) {
    const catItem = catalogue.find(c => c.id === itemId)
    if (!catItem) {
      updateRow(i, 'item_id', '')
      return
    }
    const next = items.map((it, idx) => idx === i ? {
      ...it,
      item_id: itemId,
      description: catItem.name,
      unit: catItem.unit,
      unit_price: catItem.sell_price,
      tax_rate: catItem.tax_rate,
    } : it)
    onChange(next)
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  const taxTotal  = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * ((Number(it.tax_rate) || 0) / 100), 0)
  const total     = subtotal + taxTotal

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wider">Line Items</h2>
        <button type="button" onClick={addRow}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded transition-colors">
          + Add Line
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No line items yet — click "Add Line" to start.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <th className="text-left pb-2 pr-2">Catalogue Item</th>
              <th className="text-left pb-2 pr-2">Description</th>
              <th className="text-right pb-2 pr-2 w-20">Qty</th>
              <th className="text-left pb-2 pr-2 w-24">Unit</th>
              <th className="text-right pb-2 pr-2 w-28">Unit Price</th>
              <th className="text-right pb-2 pr-2 w-20">Tax %</th>
              <th className="text-right pb-2 pr-2 w-28">Line Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
              return (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1.5 pr-2">
                    <select value={it.item_id || ''} onChange={e => selectCatalogueItem(i, e.target.value)} className={inputCls}>
                      <option value="">— Custom line —</option>
                      {catalogue.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input value={it.description} onChange={e => updateRow(i, 'description', e.target.value)}
                      placeholder="Description" className={inputCls} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" min="0" step="0.01" value={it.quantity}
                      onChange={e => updateRow(i, 'quantity', e.target.value)} className={inputCls + ' text-right'} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input value={it.unit} onChange={e => updateRow(i, 'unit', e.target.value)} className={inputCls} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" min="0" step="0.01" value={it.unit_price}
                      onChange={e => updateRow(i, 'unit_price', e.target.value)} className={inputCls + ' text-right'} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" min="0" step="0.01" value={it.tax_rate}
                      onChange={e => updateRow(i, 'tax_rate', e.target.value)} className={inputCls + ' text-right'} />
                  </td>
                  <td className="py-1.5 pr-2 text-right font-medium text-gray-800">{formatCurrency(lineTotal)}</td>
                  <td className="py-1.5 text-center">
                    <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Tax</span><span>{formatCurrency(taxTotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
            <span>Total</span><span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
