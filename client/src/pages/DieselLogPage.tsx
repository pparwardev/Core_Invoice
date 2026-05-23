import { useState, useEffect } from 'react';
import api from '../api/client';

export default function DieselLogPage() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [average, setAverage] = useState<any>(null);
  const [form, setForm] = useState({ purchaseDate: '', liters: '', pricePerLiter: '', billNumber: '', pumpName: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [month] = useState(new Date().getMonth() + 1);
  const [year] = useState(new Date().getFullYear());

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [pRes, aRes] = await Promise.all([
      api.get('/diesel'),
      api.get('/diesel/average', { params: { month, year } }),
    ]);
    setPurchases(pRes.data);
    setAverage(aRes.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/diesel/${editing}`, form);
    } else {
      await api.post('/diesel', form);
    }
    setForm({ purchaseDate: '', liters: '', pricePerLiter: '', billNumber: '', pumpName: '' });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this entry?')) { await api.delete(`/diesel/${id}`); load(); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Diesel Log</h1>

      {/* Monthly Average Card */}
      {average && (
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-5 mb-6 border border-orange-100">
          <h3 className="font-semibold text-orange-800 mb-2">Monthly Average — {month}/{year}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-2xl font-bold text-orange-700">₹{average.weightedAvgPrice?.toFixed(2)}</div><div className="text-xs text-orange-500">Avg Price/Liter</div></div>
            <div><div className="text-2xl font-bold text-orange-700">{average.totalLiters?.toFixed(0)}</div><div className="text-xs text-orange-500">Total Liters</div></div>
            <div><div className="text-2xl font-bold text-orange-700">₹{Number(average.totalCost || 0).toLocaleString('en-IN')}</div><div className="text-xs text-orange-500">Total Cost</div></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Form */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold mb-4">{editing ? 'Edit Entry' : 'Add Purchase'}</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input type="number" step="0.01" placeholder="Liters" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input type="number" step="0.01" placeholder="Price/Liter (₹)" value={form.pricePerLiter} onChange={(e) => setForm({ ...form, pricePerLiter: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input placeholder="Bill Number" value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Pump Name" value={form.pumpName} onChange={(e) => setForm({ ...form, pumpName: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            <div className="bg-gray-50 rounded p-2 text-sm">
              Total: ₹{((parseFloat(form.liters) || 0) * (parseFloat(form.pricePerLiter) || 0)).toFixed(2)}
            </div>
            <button type="submit" className="w-full bg-[#4fc3f7] text-[#1a1a2e] py-2 rounded-lg font-semibold text-sm">
              {editing ? 'Update' : 'Add Entry'}
            </button>
          </form>
        </div>

        {/* Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Liters</th>
                <th className="text-left px-4 py-3">₹/L</th>
                <th className="text-left px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Pump</th>
                <th className="text-left px-4 py-3">Bill#</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{p.purchase_date}</td>
                  <td className="px-4 py-2">{p.liters}</td>
                  <td className="px-4 py-2">₹{Number(p.price_per_liter).toFixed(2)}</td>
                  <td className="px-4 py-2 font-medium">₹{Number(p.total_cost).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-gray-500">{p.pump_name || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{p.bill_number || '—'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => { setEditing(p.id); setForm({ purchaseDate: p.purchase_date, liters: String(p.liters), pricePerLiter: String(p.price_per_liter), billNumber: p.bill_number || '', pumpName: p.pump_name || '' }); }}
                      className="text-blue-500 text-xs mr-2">Edit</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-500 text-xs">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
