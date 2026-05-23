import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

interface POEntry {
  id: number;
  fileName: string;
  status: 'extracting' | 'extracted' | 'saved' | 'error';
  extracted: any;
  filePath: string;
  vendorId: string;
  autoVendorId: number | null;
  error?: string;
  fileUrl?: string; // blob URL for PDF viewer
}

export default function POReaderPage() {
  const [poList, setPoList] = useState<POEntry[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedPoIdx, setSelectedPoIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [alerts, setAlerts] = useState<any>(null);
  const [vendorServices, setVendorServices] = useState<Record<string, any[]>>({});
  const [serviceMappings, setServiceMappings] = useState<Record<number, Record<number, number>>>({}); // poIdx -> lineItemIdx -> serviceId
  const navigate = useNavigate();
  let idCounter = 0;

  useEffect(() => {
    api.get('/vendors').then(r => setVendors(r.data));
    api.get('/po-reader/alerts').then(r => setAlerts(r.data)).catch(() => {});
  }, []);

  const handleMultiUpload = async (files: FileList) => {
    const newEntries: POEntry[] = [];
    const fileBlobs: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const fileUrl = URL.createObjectURL(files[i]);
      fileBlobs.push(fileUrl);
      newEntries.push({
        id: Date.now() + i,
        fileName: files[i].name,
        status: 'extracting',
        extracted: null,
        filePath: '',
        vendorId: '',
        autoVendorId: null,
        fileUrl,
      });
    }
    setPoList(prev => [...prev, ...newEntries]);
    // Auto-select first uploaded
    if (selectedPoIdx === null) setSelectedPoIdx(poList.length);

    // Extract each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const entryId = newEntries[i].id;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/po-reader/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setPoList(prev => prev.map(p => p.id === entryId ? {
          ...p,
          status: 'extracted',
          extracted: res.data.extracted,
          filePath: res.data.filePath,
          autoVendorId: res.data.vendorId,
          vendorId: res.data.vendorId ? String(res.data.vendorId) : '',
        } : p));
      } catch (err: any) {
        setPoList(prev => prev.map(p => p.id === entryId ? {
          ...p, status: 'error', error: err.response?.data?.error || err.message
        } : p));
      }
    }
  };

  const handleSave = async (idx: number) => {
    const po = poList[idx];
    if (!po || !po.vendorId || !po.extracted) return;
    setSaving(true);
    try {
      // Save PO
      const saveRes = await api.post('/po-reader/save', { vendorId: Number(po.vendorId), extracted: po.extracted, filePath: po.filePath });
      const poId = saveRes.data.poId;

      // Map line items to services if mappings exist
      const poMappings = serviceMappings[idx];
      if (poMappings && Object.keys(poMappings).length > 0) {
        const mappingPayload = Object.entries(poMappings).map(([lineIdx, serviceId]) => {
          const lineItem = po.extracted.lineItems?.[Number(lineIdx)];
          return {
            serviceId,
            itemCode: lineItem?.itemCode || lineItem?.item_code || '',
            hsnSac: lineItem?.hsnSac || lineItem?.hsn_sac || '',
          };
        });
        await api.post('/po-reader/map-services', {
          poId,
          vendorId: Number(po.vendorId),
          poNumber: po.extracted.purchaseOrderNumber,
          poValidity: po.extracted.serviceEndDate || po.extracted.expectedDelivery,
          mappings: mappingPayload,
        });
      }

      setPoList(prev => prev.map((p, i) => i === idx ? { ...p, status: 'saved' } : p));
    } catch (err: any) {
      if (err.response?.data?.duplicate) {
        alert(`⚠️ Duplicate PO: ${err.response.data.error}`);
        // Remove duplicate PO from the list
        setPoList(prev => prev.filter((_, i) => i !== idx));
        if (selectedPoIdx === idx) setSelectedPoIdx(null);
        else if (selectedPoIdx !== null && selectedPoIdx > idx) setSelectedPoIdx(selectedPoIdx - 1);
      } else {
        alert('Save failed: ' + (err.response?.data?.error || err.message));
      }
    }
    setSaving(false);
  };

  const loadVendorServices = async (vendorId: string) => {
    if (!vendorId || vendorServices[vendorId]) return;
    try {
      const res = await api.get(`/vendors/${vendorId}`);
      setVendorServices(prev => ({ ...prev, [vendorId]: res.data.serviceLines || [] }));
    } catch {}
  };

  const handleSaveAll = async () => {
    for (let i = 0; i < poList.length; i++) {
      if (poList[i].status === 'extracted' && poList[i].vendorId) {
        await handleSave(i);
      }
    }
  };

  const selectedPO = selectedPoIdx !== null ? poList[selectedPoIdx] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">📄 PO Reader</h1>
        <div className="flex gap-3">
          {poList.some(p => p.status === 'extracted' && p.vendorId) && (
            <button onClick={handleSaveAll} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              ✓ Save All Mapped
            </button>
          )}
          <label className="px-4 py-2 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium hover:bg-[#3bb5e8] cursor-pointer flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload POs
            <input type="file" className="hidden" accept=".pdf" multiple onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleMultiUpload(e.target.files);
              e.target.value = '';
            }} />
          </label>
        </div>
      </div>

      {/* Alerts */}
      {alerts && (alerts.expiringPOs?.length > 0 || alerts.budgetAlerts?.length > 0) && (
        <div className="mb-5 space-y-2">
          {alerts.expiringPOs?.slice(0, 3).map((po: any) => (
            <div key={po.id} className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs">
              <span>⚠️</span>
              <span className="font-medium text-orange-800">PO Expiring: {po.po_number} ({po.vendor_name})</span>
            </div>
          ))}
          {alerts.budgetAlerts?.slice(0, 3).map((po: any) => (
            <div key={po.id} className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs">
              <span>🔴</span>
              <span className="font-medium text-red-800">Budget: {po.po_number} — {po.utilizationPct?.toFixed(0)}% used</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {poList.length === 0 && (
        <div className="bg-white rounded-xl p-12 shadow-sm border-2 border-dashed border-gray-200 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Upload Multiple Purchase Orders</h2>
          <p className="text-sm text-gray-400 mb-6">Select one or more PO PDFs. They'll be extracted and listed below for vendor mapping.</p>
          <label className="px-6 py-3 bg-[#4fc3f7] text-white rounded-lg font-medium cursor-pointer hover:bg-[#3bb5e8] inline-flex items-center gap-2">
            📁 Choose PDF Files
            <input type="file" className="hidden" accept=".pdf" multiple onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleMultiUpload(e.target.files);
              e.target.value = '';
            }} />
          </label>
        </div>
      )}

      {/* PO List + PDF Viewer + Detail View */}
      {poList.length > 0 && (
        <div className="flex gap-3 h-[calc(100vh-280px)] min-h-[500px]">
          {/* Left: PO List */}
          <div className="w-1/4 space-y-2 overflow-y-auto pr-1">
            {poList.map((po, idx) => (
              <div
                key={po.id}
                onClick={() => setSelectedPoIdx(idx)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedPoIdx === idx ? 'border-[#4fc3f7] bg-blue-50 shadow-md' : 'border-gray-100 bg-white hover:border-gray-200 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{po.extracted?.purchaseOrderNumber || po.fileName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{po.extracted?.supplierName || 'Extracting...'}</div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${
                    po.status === 'saved' ? 'bg-green-100 text-green-700' :
                    po.status === 'extracted' ? 'bg-blue-100 text-blue-700' :
                    po.status === 'error' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {po.status === 'saved' ? '✓' : po.status === 'extracted' ? '●' : po.status === 'error' ? '✕' : '⏳'}
                  </span>
                </div>

                {/* Vendor mapping dropdown */}
                {po.status === 'extracted' && (
                  <select
                    value={po.vendorId}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const vid = e.target.value;
                      setPoList(prev => prev.map((p, i) => i === idx ? { ...p, vendorId: vid } : p));
                      if (vid) loadVendorServices(vid);
                    }}
                    className="w-full px-2 py-1 border border-gray-200 rounded text-[10px] mt-1 bg-white"
                  >
                    <option value="">Map to Vendor...</option>
                    {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}

                {/* Save button */}
                {po.status === 'extracted' && po.vendorId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSave(idx); }}
                    disabled={saving}
                    className="mt-1.5 w-full px-2 py-1 bg-green-600 text-white rounded text-[10px] font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    ✓ Save
                  </button>
                )}

                {po.status === 'saved' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/vendors/${po.vendorId}`); }}
                    className="mt-1.5 w-full px-2 py-1 bg-gray-100 text-gray-700 rounded text-[10px] font-medium hover:bg-gray-200"
                  >
                    → View Vendor
                  </button>
                )}

                {po.status === 'error' && (
                  <div className="text-[10px] text-red-500 mt-1 truncate">{po.error}</div>
                )}
              </div>
            ))}
          </div>

          {/* Middle: PDF Viewer */}
          <div className="w-2/5 bg-gray-900 rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-gray-800 text-xs text-gray-300 flex items-center justify-between">
              <span className="truncate">📄 {selectedPO?.fileName || 'No file selected'}</span>
              {selectedPO?.fileUrl && (
                <a href={selectedPO.fileUrl} download={selectedPO.fileName} className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0 ml-2">
                  ⬇ Download
                </a>
              )}
            </div>
            <div className="flex-1">
              {selectedPO?.fileUrl ? (
                <iframe
                  src={selectedPO.fileUrl}
                  className="w-full h-full border-0"
                  title="PDF Viewer"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <span className="text-4xl mb-2">📋</span>
                  <p className="text-xs">Select a PO to view PDF</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Extracted Data */}
          <div className="w-[35%] bg-white rounded-xl border border-gray-100 shadow-sm overflow-y-auto p-4">
            {selectedPO?.extracted ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-800 text-sm">PO: {selectedPO.extracted.purchaseOrderNumber}</h2>
                  <span className="text-[10px] text-gray-400">Extracted Data</span>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 text-xs">
                    <Field label="Order Date" value={selectedPO.extracted.orderDate} />
                    <Field label="Supplier" value={selectedPO.extracted.supplierName} />
                    <Field label="GSTIN" value={selectedPO.extracted.vendorGstin} />
                    <Field label="PAN" value={selectedPO.extracted.vendorPan} />
                    <Field label="MSME" value={selectedPO.extracted.msmeNumber} />
                    <Field label="Service Start" value={selectedPO.extracted.serviceStartDate} />
                    <Field label="Service End" value={selectedPO.extracted.serviceEndDate} />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <Field label="ERP PR" value={selectedPO.extracted.erpPrNumber} />
                    <Field label="ERP PO" value={selectedPO.extracted.erpPoNumber} />
                    <Field label="WBS ID" value={selectedPO.extracted.wbsId} />
                    <Field label="Payment Terms" value={selectedPO.extracted.paymentTerms} />
                    <Field label="Bill To" value={selectedPO.extracted.billToName} />
                    <Field label="Total" value={`₹${Number(selectedPO.extracted.totalAmount || 0).toLocaleString('en-IN')}`} highlight />
                  </div>
                </div>

                {/* Line Items */}
                {selectedPO.extracted.lineItems?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-xs mb-1.5">Line Items</h3>
                    <table className="w-full text-[10px] border border-gray-100 rounded">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-1.5 py-1 text-left">#</th>
                          <th className="px-1.5 py-1 text-left">HSN</th>
                          <th className="px-1.5 py-1 text-left">Description</th>
                          <th className="px-1.5 py-1 text-right">Qty</th>
                          <th className="px-1.5 py-1 text-right">Rate</th>
                          <th className="px-1.5 py-1 text-right">Amt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedPO.extracted.lineItems.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="px-1.5 py-1">{item.sn || i + 1}</td>
                            <td className="px-1.5 py-1 font-mono">{item.hsnSac || '—'}</td>
                            <td className="px-1.5 py-1 truncate max-w-[100px]" title={item.itemDescription}>{item.itemDescription || '—'}</td>
                            <td className="px-1.5 py-1 text-right">{item.quantity}</td>
                            <td className="px-1.5 py-1 text-right">₹{Number(item.unitRate || 0).toLocaleString('en-IN')}</td>
                            <td className="px-1.5 py-1 text-right font-medium">₹{Number(item.amount || item.basicAmount || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totals */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-500">Base</div>
                    <div className="font-bold text-xs">₹{Number(selectedPO.extracted.baseValue || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-[10px] text-gray-500">GST</div>
                    <div className="font-bold text-xs">₹{Number((selectedPO.extracted.cgstTotal || 0) + (selectedPO.extracted.sgstTotal || 0)).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <div className="text-[10px] text-green-600">Total</div>
                    <div className="font-bold text-xs text-green-700">₹{Number(selectedPO.extracted.totalAmount || 0).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                {selectedPO.extracted.amountInWords && (
                  <div className="text-[10px] text-gray-500 italic">{selectedPO.extracted.amountInWords}</div>
                )}
              </div>
            ) : selectedPO?.status === 'error' ? (
              <div className="flex flex-col items-center justify-center h-full text-red-400">
                <span className="text-4xl mb-2">❌</span>
                <p className="text-xs">{selectedPO.error}</p>
              </div>
            ) : selectedPO?.status === 'extracting' ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <span className="text-4xl mb-2 animate-pulse">⏳</span>
                <p className="text-xs">Extracting PO data...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <span className="text-4xl mb-2">👈</span>
                <p className="text-xs">Select a PO to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value?: string | number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-gray-500 shrink-0 text-xs">{label}</span>
      <span className={`text-right text-xs ${highlight ? 'text-green-700 font-bold' : 'text-gray-800'}`}>{value || '—'}</span>
    </div>
  );
}
