import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

export default function BillingWizardPage() {
  const { vendorId } = useParams();
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedVendor, setSelectedVendor] = useState(vendorId || '');
  const [vendor, setVendor] = useState<any>(null);
  const [step, setStep] = useState(vendorId ? 2 : 1);
  const [month] = useState(new Date().getMonth() + 1);
  const [year] = useState(new Date().getFullYear());
  const [wizardState, setWizardState] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!vendorId) api.get('/vendors').then((r) => setVendors(r.data));
  }, []);

  useEffect(() => {
    if (selectedVendor) {
      api.get(`/vendors/${selectedVendor}`).then((r) => setVendor(r.data));
      api.get(`/billing/${selectedVendor}/wizard-state`, { params: { month, year } }).then((r) => setWizardState(r.data));
    }
  }, [selectedVendor]);

  if (step === 1 && !vendorId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Tax Invoice Generator</h1>
        <div className="bg-white rounded-xl p-6 shadow-sm max-w-2xl">
          <h3 className="font-semibold mb-4">Step 1: Select Vendor & Period</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg">
                <option value="">Select vendor...</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.service_type})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">Month</label>
                <input type="number" value={month} readOnly className="w-full px-3 py-2 border rounded-lg bg-gray-50" /></div>
              <div><label className="block text-sm font-medium mb-1">Year</label>
                <input type="number" value={year} readOnly className="w-full px-3 py-2 border rounded-lg bg-gray-50" /></div>
            </div>
            <button onClick={() => { if (selectedVendor) setStep(2); }}
              disabled={!selectedVendor}
              className="bg-[#4fc3f7] text-[#1a1a2e] px-6 py-2 rounded-lg font-semibold disabled:opacity-50">
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!vendor) return <div className="text-center py-10">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Billing — {vendor.name}</h1>
          <p className="text-gray-500">{vendor.service_type} • Period: {month}/{year}</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex gap-2 mb-6">
        {['Log Sheet', 'Invoice', 'WCR'].map((s, i) => {
          const stepKey = ['log_sheet', 'invoice', 'wcr'][i];
          const completed = wizardState?.completedSteps?.includes(stepKey);
          return (
            <div key={s} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {completed ? '✓' : `${i + 1}.`} {s}
            </div>
          );
        })}
      </div>

      {message && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4">{message}</div>}

      {/* Log Sheet */}
      {!wizardState?.completedSteps?.includes('log_sheet') && (
        <LogSheetForm vendorId={selectedVendor || vendorId!} vendor={vendor} month={month} year={year}
          onComplete={() => { setMessage('Log sheet saved!'); api.get(`/billing/${selectedVendor || vendorId}/wizard-state`, { params: { month, year } }).then((r) => setWizardState(r.data)); }} />
      )}

      {wizardState?.completedSteps?.includes('log_sheet') && !wizardState?.completedSteps?.includes('invoice') && (
        <InvoiceForm vendorId={selectedVendor || vendorId!} vendor={vendor} month={month} year={year}
          onComplete={() => { setMessage('Invoice saved!'); api.get(`/billing/${selectedVendor || vendorId}/wizard-state`, { params: { month, year } }).then((r) => setWizardState(r.data)); }} />
      )}

      {wizardState?.completedSteps?.includes('invoice') && !wizardState?.completedSteps?.includes('wcr') && (
        <WCRForm vendorId={selectedVendor || vendorId!} month={month} year={year}
          onComplete={() => { setMessage('WCR generated! Billing complete.'); api.get(`/billing/${selectedVendor || vendorId}/wizard-state`, { params: { month, year } }).then((r) => setWizardState(r.data)); }} />
      )}

      {wizardState?.currentStep === 'completed' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h3 className="text-lg font-semibold text-green-800">Billing Complete!</h3>
          <p className="text-green-600 mt-1">All steps completed for {month}/{year}</p>
          <div className="flex gap-3 justify-center mt-4">
            <a href={`/api/reports/invoice-pdf/${wizardState.billingRecordId}`} target="_blank"
              className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">Download Invoice PDF</a>
            <a href={`/api/reports/wcr-pdf/${wizardState.billingRecordId}`} target="_blank"
              className="bg-purple-500 text-white px-4 py-2 rounded-lg text-sm">Download WCR PDF</a>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Log Sheet Form ---
function LogSheetForm({ vendorId, vendor, month, year, onComplete }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [scanning, setScanning] = useState(false);
  const [entries, setEntries] = useState<any[]>([{ entryDate: '', deviceName: '', routeDescription: '', startingKm: '', endingKm: '', totalKm: '', remark: '' }]);
  const [meta, setMeta] = useState({ vehicleNumber: vendor.vehicle_number || '', vehicleModel: vendor.vehicle_model || '', agreedKm: '' });
  const [error, setError] = useState('');

  const handleScan = async () => {
    if (!file) return;
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('month', String(month));
      fd.append('year', String(year));
      const res = await api.post('/ocr/scan-logsheet', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.extractedEntries?.length) setEntries(res.data.extractedEntries);
      if (res.data.extractedMeta?.vehicleNumber) setMeta((m) => ({ ...m, vehicleNumber: res.data.extractedMeta.vehicleNumber }));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Scan failed');
    } finally { setScanning(false); }
  };

  const handleFinalize = async () => {
    setError('');
    const validEntries = entries.filter((e) => e.entryDate);
    if (!validEntries.length) { setError('Add at least one entry'); return; }
    try {
      await api.post(`/billing/${vendorId}/log-sheet`, {
        month, year,
        periodStart: `${year}-${String(month).padStart(2, '0')}-01`,
        periodEnd: `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`,
        vehicleNumber: meta.vehicleNumber, vehicleModel: meta.vehicleModel, agreedKm: meta.agreedKm ? parseFloat(meta.agreedKm) : undefined,
        purchaseOrderId: vendor.purchaseOrders?.[0]?.id || 1, sectionId: vendor.sections?.[0]?.id || 1,
        entries: validEntries.map((e: any) => ({ ...e, startingKm: parseFloat(e.startingKm) || undefined, endingKm: parseFloat(e.endingKm) || undefined, totalKm: parseFloat(e.totalKm) || undefined })),
      });
      onComplete();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to save'); }
  };

  const updateEntry = (i: number, field: string, value: string) => {
    const updated = [...entries];
    (updated[i] as any)[field] = value;
    if (field === 'startingKm' || field === 'endingKm') {
      const s = parseFloat(updated[i].startingKm) || 0;
      const e = parseFloat(updated[i].endingKm) || 0;
      updated[i].totalKm = e > s ? String(e - s) : '';
    }
    setEntries(updated);
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Step 1: Log Sheet</h3>
      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}

      {/* Upload */}
      <div className="mb-4 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Upload Log Sheet Image</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); const r = new FileReader(); r.onload = (ev) => setPreview(ev.target?.result as string); r.readAsDataURL(f); } }}
            className="w-full text-sm border rounded-lg p-2" />
        </div>
        <button onClick={handleScan} disabled={!file || scanning}
          className="bg-[#4fc3f7] text-[#1a1a2e] px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50">
          {scanning ? 'Scanning...' : '🔍 Scan'}
        </button>
      </div>

      {preview && <img src={preview} alt="preview" className="max-h-48 rounded-lg mb-4 border" />}

      {/* Meta */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><label className="block text-xs font-medium mb-1">Vehicle Number</label>
          <input value={meta.vehicleNumber} onChange={(e) => setMeta({ ...meta, vehicleNumber: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">Vehicle Model</label>
          <input value={meta.vehicleModel} onChange={(e) => setMeta({ ...meta, vehicleModel: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">Agreed KM</label>
          <input type="number" value={meta.agreedKm} onChange={(e) => setMeta({ ...meta, agreedKm: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
      </div>

      {/* Entries Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2 border">#</th>
              <th className="px-2 py-2 border">Date</th>
              <th className="px-2 py-2 border">Device</th>
              <th className="px-2 py-2 border">Route</th>
              <th className="px-2 py-2 border">Start KM</th>
              <th className="px-2 py-2 border">End KM</th>
              <th className="px-2 py-2 border">Total KM</th>
              <th className="px-2 py-2 border">Remark</th>
              <th className="px-2 py-2 border"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i}>
                <td className="px-2 py-1 border text-center">{i + 1}</td>
                <td className="border"><input type="date" value={entry.entryDate} onChange={(e) => updateEntry(i, 'entryDate', e.target.value)} className="w-full px-1 py-1 text-xs" /></td>
                <td className="border"><input value={entry.deviceName} onChange={(e) => updateEntry(i, 'deviceName', e.target.value)} className="w-full px-1 py-1 text-xs" /></td>
                <td className="border"><input value={entry.routeDescription} onChange={(e) => updateEntry(i, 'routeDescription', e.target.value)} className="w-full px-1 py-1 text-xs" /></td>
                <td className="border"><input type="number" value={entry.startingKm} onChange={(e) => updateEntry(i, 'startingKm', e.target.value)} className="w-full px-1 py-1 text-xs" /></td>
                <td className="border"><input type="number" value={entry.endingKm} onChange={(e) => updateEntry(i, 'endingKm', e.target.value)} className="w-full px-1 py-1 text-xs" /></td>
                <td className="border"><input type="number" value={entry.totalKm} readOnly className="w-full px-1 py-1 text-xs bg-gray-50" /></td>
                <td className="border"><input value={entry.remark} onChange={(e) => updateEntry(i, 'remark', e.target.value)} className="w-full px-1 py-1 text-xs" /></td>
                <td className="border text-center"><button onClick={() => setEntries(entries.filter((_, j) => j !== i))} className="text-red-500">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={() => setEntries([...entries, { entryDate: '', deviceName: '', routeDescription: '', startingKm: '', endingKm: '', totalKm: '', remark: '' }])}
          className="text-sm text-[#4fc3f7] hover:underline">+ Add Row</button>
        <div className="flex-1" />
        <span className="text-sm text-gray-500">Total: {entries.reduce((s, e) => s + (parseFloat(e.totalKm) || 0), 0).toFixed(1)} km</span>
        <button onClick={handleFinalize} className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold text-sm">
          ✓ Finalize Log Sheet
        </button>
      </div>
    </div>
  );
}

// --- Invoice Form ---
function InvoiceForm({ vendorId, vendor, month, year, onComplete }: any) {
  const [form, setForm] = useState({ invoiceNumber: '', invoiceDate: '', gstPercentage: '18', lineItems: [{ srNo: 1, description: vendor.service_type + ' charges', quantity: '1', unit: 'Month', unitPrice: '', amount: '', isDiesel: false }] });
  const [error, setError] = useState('');

  const updateLI = (i: number, field: string, value: any) => {
    const items = [...form.lineItems];
    (items[i] as any)[field] = value;
    if (field === 'quantity' || field === 'unitPrice') {
      const q = parseFloat(items[i].quantity) || 0;
      const p = parseFloat(items[i].unitPrice) || 0;
      items[i].amount = String(q * p);
    }
    setForm({ ...form, lineItems: items });
  };

  const basicValue = form.lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
  const gst = basicValue * (parseFloat(form.gstPercentage) || 18) / 100;

  const handleSubmit = async () => {
    setError('');
    if (!form.invoiceNumber || !form.invoiceDate) { setError('Invoice number and date required'); return; }
    try {
      await api.post(`/billing/${vendorId}/invoice`, {
        month, year, invoiceNumber: form.invoiceNumber, invoiceDate: form.invoiceDate,
        gstPercentage: parseFloat(form.gstPercentage),
        lineItems: form.lineItems.filter((li) => li.description).map((li) => ({
          srNo: li.srNo, description: li.description, quantity: parseFloat(li.quantity) || 1,
          unit: li.unit, unitPrice: parseFloat(li.unitPrice) || 0, amount: parseFloat(li.amount) || 0, isDiesel: li.isDiesel,
        })),
      });
      onComplete();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Step 2: Invoice</h3>
      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><label className="block text-xs font-medium mb-1">Invoice Number *</label>
          <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">Invoice Date *</label>
          <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">GST %</label>
          <input type="number" value={form.gstPercentage} onChange={(e) => setForm({ ...form, gstPercentage: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
      </div>

      <h4 className="text-sm font-medium mb-2">Line Items</h4>
      {form.lineItems.map((li, i) => (
        <div key={i} className="grid grid-cols-5 gap-2 mb-2">
          <input placeholder="Description" value={li.description} onChange={(e) => updateLI(i, 'description', e.target.value)} className="col-span-2 px-2 py-1.5 border rounded text-sm" />
          <input type="number" placeholder="Qty" value={li.quantity} onChange={(e) => updateLI(i, 'quantity', e.target.value)} className="px-2 py-1.5 border rounded text-sm" />
          <input type="number" placeholder="Unit Price" value={li.unitPrice} onChange={(e) => updateLI(i, 'unitPrice', e.target.value)} className="px-2 py-1.5 border rounded text-sm" />
          <input type="number" placeholder="Amount" value={li.amount} onChange={(e) => updateLI(i, 'amount', e.target.value)} className="px-2 py-1.5 border rounded text-sm bg-gray-50" />
        </div>
      ))}
      <button onClick={() => setForm({ ...form, lineItems: [...form.lineItems, { srNo: form.lineItems.length + 1, description: '', quantity: '1', unit: '', unitPrice: '', amount: '', isDiesel: false }] })}
        className="text-sm text-[#4fc3f7] hover:underline mb-4">+ Add Line Item</button>

      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex justify-between text-sm"><span>Basic Value:</span><span>₹{basicValue.toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between text-sm"><span>GST ({form.gstPercentage}%):</span><span>₹{gst.toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2"><span>Total:</span><span>₹{(basicValue + gst).toLocaleString('en-IN')}</span></div>
      </div>

      <button onClick={handleSubmit} className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold text-sm">Save Invoice & Continue</button>
    </div>
  );
}

// --- WCR Form ---
function WCRForm({ vendorId, month, year, onComplete }: any) {
  const [form, setForm] = useState({ reportDate: new Date().toISOString().split('T')[0], siteName: 'UAIL Refinery', location: 'Doraguda, Rayagada', clientName: 'Bluspring Enterprises Limited', workSummary: '' });
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      await api.post(`/billing/${vendorId}/wcr`, { month, year, ...form });
      onComplete();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">Step 3: Work Completion Report</h3>
      {error && <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><label className="block text-xs font-medium mb-1">Report Date</label>
          <input type="date" value={form.reportDate} onChange={(e) => setForm({ ...form, reportDate: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">Site Name</label>
          <input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">Location</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
        <div><label className="block text-xs font-medium mb-1">Client</label>
          <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
      </div>
      <div className="mb-4"><label className="block text-xs font-medium mb-1">Work Summary (leave blank to auto-generate)</label>
        <textarea value={form.workSummary} onChange={(e) => setForm({ ...form, workSummary: e.target.value })} rows={3} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
      <button onClick={handleSubmit} className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold text-sm">Generate WCR</button>
    </div>
  );
}
