import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function VendorDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [vendor, setVendor] = useState<any>(null);
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [billsServiceFilter, setBillsServiceFilter] = useState('all');
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [uploadingPO, setUploadingPO] = useState(false);
  const [poSubTab, setPoSubTab] = useState<'current' | 'expired'>('current');
  const [poServiceMappings, setPoServiceMappings] = useState<Record<string, Record<number, number>>>({}); // poId -> lineItemIdx -> serviceId
  const [savingMapping, setSavingMapping] = useState(false);
  const [addingService, setAddingService] = useState(false);
  const [newService, setNewService] = useState({ serviceType: '', sectionId: '' });
  const [importingBills, setImportingBills] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedBills, setSelectedBills] = useState<Set<number>>(new Set());
  const [deletingBills, setDeletingBills] = useState(false);
  const [selectedPoForBalance, setSelectedPoForBalance] = useState<string>('all');

  const handleUploadPO = async (file: File) => {
    if (!file || !id) return;
    setUploadingPO(true);
    try {
      // Step 1: Extract PO data
      const fd = new FormData();
      fd.append('file', file);
      const extractRes = await api.post('/po-reader/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const { extracted, filePath } = extractRes.data;

      // Step 2: Auto-save to this vendor (no manual mapping needed)
      await api.post('/po-reader/save', { vendorId: Number(id), extracted, filePath });

      // Step 3: Reload vendor data
      const res = await api.get(`/vendors/${id}`);
      setVendor(res.data);
      alert('✅ PO uploaded and saved successfully!');
    } catch (err: any) {
      if (err.response?.data?.duplicate) {
        alert(`⚠️ Duplicate PO: "${err.response.data.error}"`);
      } else {
        alert('❌ PO upload failed: ' + (err.response?.data?.error || err.message));
      }
    }
    setUploadingPO(false);
  };

  const handleSaveServiceMapping = async (poId: number, po: any) => {
    const mappings = poServiceMappings[poId];
    if (!mappings || !id) return;
    setSavingMapping(true);
    try {
      let lineItems: any[] = [];
      if (po.extracted_raw_json) {
        try { lineItems = JSON.parse(po.extracted_raw_json).lineItems || []; } catch {}
      }
      const payload = Object.entries(mappings)
        .filter(([_, serviceId]) => serviceId > 0)
        .map(([lineIdx, serviceId]) => {
          const item = lineItems[Number(lineIdx)];
          return {
            serviceId: Number(serviceId),
            itemCode: item?.itemCode || item?.item_code || po.item_code || '',
            hsnSac: item?.hsnSac || item?.hsn_sac || po.hsn_sac_code || '',
          };
        });
      if (payload.length === 0) { setSavingMapping(false); return; }
      await api.post('/po-reader/map-services', {
        poId,
        vendorId: Number(id),
        poNumber: po.po_number,
        poValidity: po.validity_date,
        mappings: payload,
      });
      const res = await api.get(`/vendors/${id}`);
      setVendor(res.data);
      setPoServiceMappings(prev => { const n = { ...prev }; delete n[poId]; return n; });
    } catch (err: any) {
      alert('Mapping failed: ' + (err.response?.data?.error || err.message));
    }
    setSavingMapping(false);
  };

  useEffect(() => {
    if (id) api.get(`/vendors/${id}`).then((res) => setVendor(res.data)).catch(console.error);
  }, [id]);

  const handleImportBills = async (file: File) => {
    if (!file || !id) return;
    setImportingBills(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('vendorId', id);
      const res = await api.post('/billing/import-bills', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const vendorRes = await api.get(`/vendors/${id}`);
      setVendor(vendorRes.data);
      setShowImportModal(false);
      setPreviewData(null);
      alert(`✅ ${res.data.imported} bill(s) imported successfully!`);
    } catch (err: any) {
      alert('❌ Import failed: ' + (err.response?.data?.error || err.message));
    }
    setImportingBills(false);
  };

  // Confirm import from previewed data (no re-upload needed)
  const handleConfirmImport = async () => {
    if (!previewData || !id) return;
    setImportingBills(true);
    try {
      const res = await api.post('/billing/import-bills-data', {
        vendorId: Number(id),
        records: previewData.records,
      });
      const vendorRes = await api.get(`/vendors/${id}`);
      setVendor(vendorRes.data);
      setShowImportModal(false);
      setPreviewData(null);
      alert(`✅ ${res.data.imported} bill(s) imported successfully!`);
    } catch (err: any) {
      alert('❌ Import failed: ' + (err.response?.data?.error || err.message));
    }
    setImportingBills(false);
  };

  const handlePreviewBills = async (file: File) => {
    if (!file || !vendor) return;
    setPreviewLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('vendorName', vendor.name);
      const res = await api.post('/billing/preview-bills', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreviewData(res.data);
    } catch (err: any) {
      alert('❌ Failed to read file: ' + (err.response?.data?.error || err.message));
    }
    setPreviewLoading(false);
  };

  if (!vendor) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-4xl animate-pulse">👤</div>
    </div>
  );

  const serviceLines: any[] = vendor.serviceLines || [];
  const tabs = ['overview', 'services', 'po_tracker', 'bills'];
  // Deduplicate POs by po_number (keep latest by id)
  const uniquePOs = (vendor.purchaseOrders || []).reduce((acc: any[], po: any) => {
    const existing = acc.find((p: any) => p.po_number === po.po_number);
    if (existing) {
      if (po.id > existing.id) return acc.map((p: any) => p.po_number === po.po_number ? po : p);
      return acc;
    }
    acc.push(po);
    return acc;
  }, []);
  const totalPOs = uniquePOs.length;
  const totalPOValue = vendor.purchaseOrders?.reduce((s: number, po: any) => s + Number(po.po_value || 0), 0) || 0;
  const totalBilled = vendor.bills?.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0) || 0;
  const poBalance = totalPOValue - totalBilled;
  const poUtilizationPct = totalPOValue > 0 ? (totalBilled / totalPOValue) * 100 : 0;
  // Check per-PO: any PO nearing limit?
  const poStatuses = (vendor.purchaseOrders || []).map((po: any) => {
    const poVal = Number(po.po_value || 0);
    const billed = Number(po.totalBilled || 0);
    return { poNumber: po.po_number, poVal, billed, pct: poVal > 0 ? (billed / poVal) * 100 : 0 };
  });
  const worstPO = poStatuses.reduce((worst: any, po: any) => po.pct > (worst?.pct || 0) ? po : worst, null);
  const poNearingLimit = worstPO && worstPO.pct >= 80;

  // Unique service types for bills sub-tab filter (from actual bills data)
  const billServiceTypes = [...new Set((vendor.bills || []).map((b: any) => b.service_type).filter(Boolean))].sort();
  // Fallback to vendor's registered services if no bills have service_type
  const uniqueServiceTypes = billServiceTypes.length > 0 ? billServiceTypes : [...new Set(serviceLines.map((s: any) => s.serviceType))];

  // Filter bills by selected service and sort by latest date first
  const filteredBills = (billsServiceFilter === 'all'
    ? (vendor.bills || [])
    : (vendor.bills || []).filter((b: any) => b.service_type === billsServiceFilter)
  ).sort((a: any, b: any) => {
    // Sort by year desc, then month desc
    if (b.billing_period_year !== a.billing_period_year) return b.billing_period_year - a.billing_period_year;
    if (b.billing_period_month !== a.billing_period_month) return b.billing_period_month - a.billing_period_month;
    // Fallback: sort by id desc (newer records have higher ids)
    return (b.id || 0) - (a.id || 0);
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#1a1a2e] flex items-center justify-center text-white text-xl font-bold shadow-md">
            {vendor.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{vendor.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-semibold">
                {serviceLines.length} Service{serviceLines.length !== 1 ? 's' : ''}
              </span>
              {vendor.gstin && (
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-mono border border-green-200">
                  {vendor.gstin}
                </span>
              )}
              {vendor.vendor_type && vendor.vendor_type !== 'Individual' && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{vendor.vendor_type}</span>
              )}
              {totalPOs > 0 && (
                <select value={selectedPoForBalance} onChange={(e) => setSelectedPoForBalance(e.target.value)}
                  className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-3 py-1 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer">
                  <option value="all">📋 All Active POs</option>
                  {(vendor.purchaseOrders || []).map((po: any) => {
                    const isExpired = (() => { if (!po.validity_date) return false; const parts = po.validity_date.split('/'); const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])) : new Date(po.validity_date); return !isNaN(d.getTime()) && d.getTime() < Date.now(); })();
                    return <option key={po.id} value={po.po_number}>PO: {po.po_number}{isExpired ? ' ⚠️ Expired' : ''}</option>;
                  })}
                </select>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/vendors" className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
          <Link to={`/billing/${vendor.id}`} className="relative bg-gradient-to-r from-[#4fc3f7] to-[#0288d1] text-white px-6 py-3 rounded-xl font-bold text-sm hover:from-[#3bb5e8] hover:to-[#0277bd] shadow-lg shadow-[#4fc3f7]/30 hover:shadow-xl hover:shadow-[#4fc3f7]/40 transition-all hover:scale-105 flex items-center gap-2">
            <span className="text-lg">🧾</span>
            Submit Bill
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full animate-ping"></span>
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full"></span>
          </Link>
        </div>
      </div>

      {/* KPI Tiles — Clickable */}
      {(() => {
        // Filter active (non-expired) POs
        const activePOs = (vendor.purchaseOrders || []).filter((po: any) => {
          if (!po.validity_date) return true; // no validity = assume active
          const parts = po.validity_date.split('/');
          const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])) : new Date(po.validity_date);
          return !isNaN(d.getTime()) && d.getTime() >= Date.now();
        });

        // Calculate balance for selected PO
        const selectedPo = selectedPoForBalance !== 'all' 
          ? vendor.purchaseOrders?.find((p: any) => p.po_number === selectedPoForBalance)
          : null;
        
        // "All Combined" = only active POs (exclude expired)
        const activePOValue = activePOs.reduce((s: number, po: any) => s + Number(po.po_value || 0), 0);
        const activeBilled = activePOs.reduce((s: number, po: any) => s + Number(po.totalBilled || 0), 0);
        
        const displayPOValue = selectedPo ? Number(selectedPo.po_value || 0) : activePOValue;
        const displayBilled = selectedPo ? Number(selectedPo.totalBilled || 0) : activeBilled;
        const displayBalance = displayPOValue - displayBilled;

        // Check for expired POs
        const expiredPOs = (vendor.purchaseOrders || []).filter((po: any) => {
          if (!po.validity_date) return false;
          const parts = po.validity_date.split('/');
          const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])) : new Date(po.validity_date);
          return !isNaN(d.getTime()) && d.getTime() < Date.now();
        });

        return (<>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div onClick={() => setTab('services')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center cursor-pointer hover:border-purple-300 hover:shadow-md transition-all">
              <div className="text-2xl font-bold text-purple-600">{serviceLines.length}</div>
              <div className="text-xs text-gray-500 mt-1">Service Lines</div>
            </div>
            <div onClick={() => setTab('po_tracker')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center cursor-pointer hover:border-blue-300 hover:shadow-md transition-all">
              <div className="text-2xl font-bold text-blue-600">{totalPOs}</div>
              <div className="text-xs text-gray-500 mt-1">Purchase Orders</div>
            </div>
            <div onClick={() => setTab('po_tracker')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center cursor-pointer hover:border-green-300 hover:shadow-md transition-all">
              <div className="text-2xl font-bold text-green-600">₹{formatLakh(displayPOValue)}</div>
              <div className="text-xs text-gray-500 mt-1">{selectedPo ? 'PO Value' : `Active PO Value (${activePOs.length})`}</div>
            </div>
            <div onClick={() => setTab('bills')} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all">
              <div className="text-2xl font-bold text-indigo-600">₹{formatLakh(displayBilled)}</div>
              <div className="text-xs text-gray-500 mt-1">Billed (Active POs)</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
              <div className={`text-2xl font-bold ${displayBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>₹{formatLakh(displayBalance)}</div>
              <div className="text-xs text-gray-500 mt-1">PO Balance</div>
            </div>
          </div>

          {/* Expired PO Alert - only show when ALL POs are expired (no active PO exists) */}
          <div className="flex items-center gap-3 mb-5">
            {expiredPOs.length > 0 && activePOs.length === 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-700 font-medium">⚠️ {expiredPOs.length} PO expired — No active PO available</span>
                <button onClick={() => { setTab('po_tracker'); }}
                  className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-medium hover:bg-red-700">
                  Upload New PO →
                </button>
              </div>
            )}
          </div>
        </>);
      })()}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-[#4fc3f7] text-[#4fc3f7]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'po_tracker' ? 'PO Tracker' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ===== 1. OVERVIEW ===== */}
      {tab === 'overview' && (() => {
        // Extract vendor info from PO data if available
        let poVendorInfo: any = {};
        if (vendor.purchaseOrders?.length > 0) {
          for (const po of vendor.purchaseOrders) {
            if (po.extracted_raw_json) {
              try {
                const raw = JSON.parse(po.extracted_raw_json);
                if (raw.vendorGstin && !poVendorInfo.gstin) poVendorInfo.gstin = raw.vendorGstin;
                if (raw.vendorPan && !poVendorInfo.pan) poVendorInfo.pan = raw.vendorPan;
                if (raw.msmeNumber && !poVendorInfo.msme) poVendorInfo.msme = raw.msmeNumber;
                if (raw.contactNumber && !poVendorInfo.phone) poVendorInfo.phone = raw.contactNumber;
                if (raw.emailId && !poVendorInfo.email) poVendorInfo.email = raw.emailId;
                if (raw.supplierAddress && !poVendorInfo.address) poVendorInfo.address = raw.supplierAddress;
                if (raw.supplierCode && !poVendorInfo.supplierCode) poVendorInfo.supplierCode = raw.supplierCode;
                if (raw.supplierName && !poVendorInfo.supplierName) poVendorInfo.supplierName = raw.supplierName;
              } catch {}
            }
            // Also check direct PO fields
            if (po.supplier_name && !poVendorInfo.supplierName) poVendorInfo.supplierName = po.supplier_name;
          }
        }

        return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold mb-4">👤 Profile</h3>
            <div className="space-y-3 text-sm">
              <Row label="GSTIN" value={vendor.gstin || poVendorInfo.gstin || 'Not registered'} highlight={!!(vendor.gstin || poVendorInfo.gstin)} />
              <Row label="PAN" value={vendor.pan || poVendorInfo.pan || '—'} highlight={!!(poVendorInfo.pan && !vendor.pan)} />
              <Row label="MSME" value={poVendorInfo.msme || '—'} highlight={!!poVendorInfo.msme} />
              <Row label="Supplier Code" value={poVendorInfo.supplierCode || vendor.vendor_code || '—'} />
              <Row label="State" value={`${vendor.state || 'Odisha'} (${vendor.state_code || '21'})`} />
              <Row label="Type" value={vendor.vendor_type || 'Individual'} />
              <Row label="GST" value={vendor.state_code === '21' ? 'CGST+SGST' : 'IGST'} />
              <Row label="Contact" value={vendor.contact_person || poVendorInfo.supplierName || '—'} />
              <Row label="Phone" value={vendor.phone || poVendorInfo.phone || '—'} />
              <Row label="Email" value={vendor.email || poVendorInfo.email || '—'} />
              {poVendorInfo.address && <Row label="Address" value={poVendorInfo.address} />}
            </div>
            {poVendorInfo.gstin && !vendor.gstin && (
              <div className="mt-3 text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded">
                ℹ️ Info auto-filled from uploaded PO
              </div>
            )}
          </div>

          {/* Departments & Services (clickable) */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold mb-4">🏢 Departments & Services</h3>
            {vendor.sections?.length > 0 ? (
              <div className="space-y-4">
                {vendor.sections.map((sec: any) => {
                  const deptServices = serviceLines.filter((s: any) => s.sectionCode === sec.code);
                  return (
                    <div key={sec.id}>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded ${
                        sec.code === 'REF' ? 'bg-blue-500 text-white' :
                        sec.code === 'PES' ? 'bg-red-500 text-white' : 'bg-purple-500 text-white'
                      }`}>{sec.name}</span>
                      <div className="mt-2 space-y-1 ml-1">
                        {deptServices.map((s: any) => (
                          <button
                            key={s.id}
                            onClick={() => { setTab('bills'); setBillsServiceFilter(s.serviceType); }}
                            className="block text-sm text-[#4fc3f7] hover:underline cursor-pointer"
                          >
                            → {s.serviceType}{s.serviceSubtype ? ` (${s.serviceSubtype})` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No departments assigned</p>
            )}
          </div>

          {/* Bank */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold mb-4">🏦 Bank Details</h3>
            <div className="space-y-3 text-sm">
              <Row label="Bank" value={vendor.bank_name || '—'} />
              <Row label="Account" value={vendor.bank_account_no || '—'} />
              <Row label="IFSC" value={vendor.bank_ifsc || '—'} />
              <Row label="Branch" value={vendor.bank_branch || '—'} />
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== 2. SERVICES ===== */}
      {tab === 'services' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-700">All Services ({serviceLines.length})</h3>
              <p className="text-xs text-gray-400 mt-0.5">Each service-department combination is a separate billing line</p>
            </div>
            <button onClick={() => setAddingService(!addingService)}
              className="px-3 py-1.5 bg-[#4fc3f7] text-white rounded-lg text-xs font-medium hover:bg-[#3bb5e8]">
              + Add Service
            </button>
          </div>

          {/* Add Service Form */}
          {addingService && (
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex gap-2 items-center">
              <input type="text" placeholder="Service Type" value={newService.serviceType}
                onChange={(e) => setNewService({ ...newService, serviceType: e.target.value })}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs flex-1 bg-white" />
              <select value={newService.sectionId} onChange={(e) => setNewService({ ...newService, sectionId: e.target.value })}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs bg-white">
                <option value="">Department</option>
                <option value="1">REFINERY</option>
                <option value="2">POWER-ENGINEERING</option>
                <option value="3">POWER-MMD</option>
              </select>
              <button onClick={async () => {
                if (!newService.serviceType || !newService.sectionId || !id) return;
                try {
                  await api.post(`/vendors/${id}/services`, { serviceType: newService.serviceType, sectionId: Number(newService.sectionId) });
                  const res = await api.get(`/vendors/${id}`);
                  setVendor(res.data);
                  setNewService({ serviceType: '', sectionId: '' });
                  setAddingService(false);
                } catch (err: any) { alert(err.response?.data?.error || 'Failed'); }
              }} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">Save</button>
              <button onClick={() => setAddingService(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Service</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">PO Number</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Item Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">HSN/SAC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">PO Validity</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">PO Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Bills</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {serviceLines.map((sl: any, idx: number) => (
                <tr key={sl.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setTab('bills'); setBillsServiceFilter(sl.serviceType); }}
                      className="text-sm font-medium text-[#4fc3f7] hover:underline text-left"
                    >
                      {sl.serviceType}
                    </button>
                    {sl.serviceSubtype && <span className="ml-1 text-xs text-gray-400">({sl.serviceSubtype})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      sl.sectionCode === 'REF' ? 'bg-blue-500 text-white' :
                      sl.sectionCode === 'PES' ? 'bg-red-500 text-white' : 'bg-purple-500 text-white'
                    }`}>{sl.sectionName}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">{sl.poNumber || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">{sl.itemCode || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">{sl.hsnSac || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs">
                    {sl.poValidity ? (
                      <span className={`px-2 py-0.5 rounded-full ${
                        (() => {
                          const parts = sl.poValidity.split('/');
                          const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])) : new Date(sl.poValidity);
                          const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
                          return days < 0 ? 'bg-red-100 text-red-700' : days < 30 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
                        })()
                      }`}>{sl.poValidity}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      if (!sl.poNumber) return <span className="text-gray-300 text-xs">—</span>;
                      const matchedPo = vendor.purchaseOrders?.find((p: any) => p.po_number === sl.poNumber);
                      if (!matchedPo) return <span className="text-gray-300 text-xs">—</span>;
                      const poVal = Number(matchedPo.po_value || 0);
                      if (poVal === 0) return <span className="text-gray-300 text-xs">—</span>;
                      
                      // Parse PO issuing date and validity date
                      const parseDate = (d: string) => {
                        if (!d) return null;
                        const parts = d.split('/');
                        if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0]));
                        return new Date(d);
                      };
                      const poStart = parseDate(matchedPo.order_date || matchedPo.service_start_date || '');
                      const poEnd = parseDate(matchedPo.validity_date || matchedPo.service_end_date || '');
                      
                      // Count bills for this service ONLY within PO valid dates
                      const svcName = (sl.serviceType || '').toLowerCase();
                      const serviceBills = (vendor.bills || []).filter((b: any) => {
                        const billSvc = (b.service_type || '').toLowerCase();
                        const svcMatch = billSvc === svcName || billSvc.includes(svcName) || svcName.includes(billSvc);
                        if (!svcMatch) return false;
                        // Check if bill falls within PO dates
                        if (poStart || poEnd) {
                          const billMonth = b.billing_period_month;
                          const billYear = b.billing_period_year;
                          const billDate = new Date(billYear, billMonth - 1, 15); // mid-month
                          if (poStart && billDate < poStart) return false;
                          if (poEnd && billDate > new Date(poEnd.getTime() + 30*86400000)) return false; // +30 days grace
                        }
                        return true;
                      });
                      const serviceBilled = serviceBills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);
                      const billed = Math.max(Number(matchedPo.totalBilled || 0), serviceBilled);
                      const poPct = Math.min((billed / poVal) * 100, 150);
                      const remaining = poVal - billed;
                      const barColor = poPct >= 95 ? 'bg-red-500' : poPct >= 80 ? 'bg-orange-400' : 'bg-green-400';
                      
                      return (
                        <div className="min-w-[120px]">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-[10px] font-bold ${poPct >= 95 ? 'text-red-600' : poPct >= 80 ? 'text-orange-600' : 'text-green-600'}`}>{poPct.toFixed(0)}%</span>
                            <span className="text-[9px] text-gray-400">₹{formatLakh(remaining < 0 ? 0 : remaining)} left</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${Math.min(poPct, 100)}%` }} />
                          </div>
                          {poPct >= 95 && <span className="text-[9px] text-red-600 font-medium animate-pulse">⚠️ Raise PR</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {(vendor.bills || []).filter((b: any) => b.service_type === sl.serviceType).length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => {
                      if (!confirm(`Remove service "${sl.serviceType}" from this vendor?`)) return;
                      api.delete(`/vendors/${id}/services/${sl.id}`).then(() => {
                        api.get(`/vendors/${id}`).then((res) => setVendor(res.data));
                      }).catch((err: any) => alert(err.response?.data?.error || 'Failed'));
                    }} className="text-red-400 hover:text-red-600 text-xs" title="Remove Service">
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {serviceLines.length === 0 && (
            <div className="text-center py-12 text-gray-400">No services found</div>
          )}
        </div>
      )}

      {/* ===== 3. PO TRACKER with PDF Viewer ===== */}
      {tab === 'po_tracker' && (
        <div className="flex gap-0 h-[calc(100vh-320px)] min-h-[500px]">
          {/* Left: PO List — resizable */}
          <div className="w-2/5 min-w-[300px] max-w-[60%] space-y-3 overflow-y-auto pr-2 resize-x overflow-x-hidden border-r border-gray-200 mr-2" style={{ resize: 'horizontal' }}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Purchase Orders ({uniquePOs.length})</h3>
              <label className={`px-3 py-1.5 bg-[#4fc3f7] text-white rounded-lg text-xs font-medium hover:bg-[#3bb5e8] flex items-center gap-1 cursor-pointer ${uploadingPO ? 'opacity-50 pointer-events-none' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploadingPO ? 'Extracting...' : 'Upload PO'}
                <input type="file" className="hidden" accept=".pdf" disabled={uploadingPO} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadPO(file);
                  e.target.value = '';
                }} />
              </label>
            </div>

            {/* Current / Expired sub-tabs with counts */}
            {(() => {
              const currentYear = new Date().getFullYear();
              const currentCount = uniquePOs.filter((po: any) => {
                if (po.is_expired) return false;
                if (!po.validity_date) {
                  const startDate = po.service_start_date || po.po_date;
                  if (startDate) {
                    const parts = startDate.split('/');
                    const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])) : new Date(startDate);
                    if (!isNaN(d.getTime()) && d.getFullYear() < currentYear) return false;
                  }
                  return true;
                }
                const parts = po.validity_date.split('/');
                const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])) : new Date(po.validity_date);
                return isNaN(d.getTime()) || d.getTime() >= Date.now();
              }).length;
              const expiredCount = uniquePOs.length - currentCount;
              return (
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={() => setPoSubTab('current')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      poSubTab === 'current' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    ✅ Current POs ({currentCount})
                  </button>
                  <button
                    onClick={() => setPoSubTab('expired')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      poSubTab === 'expired' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    ⚠️ Expired POs ({expiredCount})
                  </button>
                </div>
              );
            })()}

            {(() => {
              // Remove duplicate POs (keep the latest one by id)
              const allPOs: any[] = vendor.purchaseOrders || [];
              const uniquePOs = allPOs.reduce((acc: any[], po: any) => {
                const existing = acc.find((p: any) => p.po_number === po.po_number);
                if (existing) {
                  // Keep the one with higher id (latest)
                  if (po.id > existing.id) {
                    return acc.map((p: any) => p.po_number === po.po_number ? po : p);
                  }
                  return acc;
                }
                acc.push(po);
                return acc;
              }, []);

              // Determine expired status for each PO
              const currentYear = new Date().getFullYear();
              const hasNewerPO = (po: any) => uniquePOs.some((other: any) =>
                other.id !== po.id && other.po_number !== po.po_number &&
                (other.po_date || other.service_start_date) &&
                new Date(other.po_date || other.service_start_date).getFullYear() >= currentYear
              );

              const posWithExpiry = uniquePOs.map((po: any) => {
                let isExpired = false;

                // Rule 1: Explicitly marked expired
                if (po.is_expired) { isExpired = true; }

                // Rule 2: End date has passed
                if (!isExpired && po.validity_date) {
                  const parts = po.validity_date.split('/');
                  const d = parts.length === 3
                    ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
                    : new Date(po.validity_date);
                  if (!isNaN(d.getTime()) && d.getTime() < Date.now()) {
                    isExpired = true;
                  }
                }

                // Rule 3: No end date, start date is last year, and newer PO exists
                if (!isExpired && !po.validity_date) {
                  const startDate = po.service_start_date || po.po_date;
                  if (startDate) {
                    const parts = startDate.split('/');
                    const d = parts.length === 3
                      ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
                      : new Date(startDate);
                    if (!isNaN(d.getTime()) && d.getFullYear() < currentYear && hasNewerPO(po)) {
                      isExpired = true;
                    }
                  }
                }

                return { ...po, _isExpired: isExpired };
              });

              return posWithExpiry.filter((po: any) =>
                poSubTab === 'expired' ? po._isExpired : !po._isExpired
              );
            })().map((po: any) => {
              const pct = po.utilizationPct || 0;
              const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500';
              // Fix date parsing — handle DD/MM/YYYY and YYYY-MM-DD formats
              let daysLeft: number | null = null;
              if (po.validity_date) {
                let endDate: Date | null = null;
                const parts = po.validity_date.split('/');
                if (parts.length === 3) {
                  // DD/MM/YYYY
                  endDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                } else {
                  endDate = new Date(po.validity_date);
                }
                if (endDate && !isNaN(endDate.getTime())) {
                  daysLeft = Math.ceil((endDate.getTime() - Date.now()) / 86400000);
                }
              }
              const isSelected = selectedPoId === po.id;
              // Extract all line items from extracted_raw_json
              let lineItems: any[] = [];
              if (po.extracted_raw_json) {
                try {
                  const raw = JSON.parse(po.extracted_raw_json);
                  lineItems = raw.lineItems || [];
                } catch {}
              }
              // Fallback: single item from PO fields
              if (lineItems.length === 0 && (po.hsn_sac_code || po.item_description)) {
                lineItems = [{ hsnSac: po.hsn_sac_code, itemCode: po.item_code, itemDescription: po.item_description || po.service_description }];
              }

              return (
                <div
                  key={po.id}
                  onClick={() => setSelectedPoId(isSelected ? null : po.id)}
                  className={`rounded-xl border overflow-hidden cursor-pointer transition-all ${
                    isSelected ? 'border-[#4fc3f7] shadow-md' : 'border-gray-200 bg-white hover:shadow-md'
                  }`}
                >
                  {/* Top color bar */}
                  <div className={`h-1 ${(po._isExpired || po.is_expired || (daysLeft !== null && daysLeft < 0)) ? 'bg-gradient-to-r from-red-500 to-red-400' : daysLeft !== null && daysLeft <= 30 ? 'bg-gradient-to-r from-orange-400 to-yellow-400' : 'bg-gradient-to-r from-green-400 to-blue-400'}`} />

                  <div className="p-4">
                    {/* Row 1: PO Number + Status badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-lg font-bold text-gray-900">{po.po_number}</span>
                      {(po._isExpired || po.is_expired || (daysLeft !== null && daysLeft < 0)) ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-medium border border-red-200">⚠️ Expired</span>
                      ) : daysLeft !== null && daysLeft <= 30 ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 font-medium border border-orange-200">⏰ {daysLeft}d left</span>
                      ) : (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-50 text-green-600 font-medium border border-green-200">✓ Active</span>
                      )}
                    </div>

                    {/* Row 2: Period + Amount side by side */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Period</div>
                        <div className="text-sm text-green-700 font-medium">
                          📅 {po.service_start_date || po.po_date || '—'} → {po.validity_date || po.service_end_date || '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">PO Amount</div>
                        <div className="text-lg font-bold text-blue-600">₹{Number(po.po_value || 0).toLocaleString('en-IN')}</div>
                      </div>
                    </div>

                    {/* Row 3: Items as tags */}
                    {lineItems.length > 0 && (
                      <div className="mb-3 bg-gray-50 rounded-lg p-2.5">
                        <div className="text-[10px] text-gray-400 uppercase font-medium mb-1.5">Items</div>
                        <div className="flex flex-wrap gap-1.5">
                          {lineItems.slice(0, 4).map((item: any, i: number) => (
                            <span key={i} className="text-[11px] bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded-md">
                              {item.itemDescription || item.description || item.hsnSac || '—'}
                            </span>
                          ))}
                          {lineItems.length > 4 && (
                            <span className="text-[10px] text-gray-400 self-center">+{lineItems.length - 4} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Row 4: Utilization bar + PDF */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-xs text-gray-500">Billed: <span className="font-medium text-gray-700">₹{Number(po.totalBilled || 0).toLocaleString('en-IN')}</span></span>
                        <div className="flex-1 max-w-[100px] bg-gray-200 rounded-full h-1.5">
                          <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400">{pct.toFixed(0)}%</span>
                      </div>
                      {po.file_path && (
                        <span className="text-xs bg-gray-100 border border-gray-200 px-2 py-1 rounded flex items-center gap-1 text-gray-600">
                          📄 PDF
                        </span>
                      )}
                    </div>

                    {pct >= 80 && (
                      <div className={`mt-2 text-[10px] font-medium px-2 py-1 rounded text-center ${pct >= 95 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}>
                        {pct >= 95 ? '⚠️ PO Limit Exceeded — Raise New PR' : '⚠️ Nearing PO Limit (' + pct.toFixed(0) + '%)'}
                      </div>
                    )}
                  </div>
                  {/* Utilization bar */}
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                    <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Billed: ₹{Number(po.totalBilled || 0).toLocaleString('en-IN')}</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  {pct >= 80 && (
                    <div className={`mt-2 text-[10px] font-medium px-2 py-1 rounded ${pct >= 95 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-orange-100 text-orange-700'}`}>
                      {pct >= 95 ? '⚠️ PO Limit Exceeded — Raise PR' : '⚠️ Nearing PO Limit (' + pct.toFixed(0) + '%)'}
                    </div>
                  )}
                  {po.file_path && (
                    <div className="mt-1 text-xs text-[#4fc3f7] flex items-center gap-1">📄 PDF attached</div>
                  )}

                  {/* Service Mapping for this PO */}
                  {isSelected && lineItems.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <div className="text-xs font-semibold text-gray-600 mb-2">Map items to services:</div>
                      <div className="space-y-2">
                        {lineItems.map((item: any, liIdx: number) => {
                          // Check if this specific line item's service mapping exists
                          // A service is "mapped to this line item" if it has this PO's number AND this item's code
                          const itemCode = item.itemCode || item.item_code || '';
                          const mappedServices = serviceLines.filter((s: any) => s.poNumber === po.po_number && s.itemCode === itemCode);
                          // Count how many line items with same code exist before this one
                          const sameCodeBefore = lineItems.slice(0, liIdx).filter((li: any) => (li.itemCode || li.item_code || '') === itemCode).length;
                          const alreadyMapped = mappedServices[sameCodeBefore] || null;

                          // Check if user already selected a mapping in state
                          const selectedInState = poServiceMappings[po.id]?.[liIdx];

                          return (
                            <div key={liIdx} className="p-2 bg-gray-50 rounded border border-gray-100">
                              <div className="text-xs text-gray-700 font-medium mb-1">
                                <span className="font-mono bg-gray-200 px-1 rounded">{itemCode || '?'}</span>
                                <span className="ml-1">{item.itemDescription || item.description || '—'}</span>
                              </div>
                              {alreadyMapped ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded inline-block">
                                  ✓ {alreadyMapped.serviceType}{alreadyMapped.serviceSubtype ? ` (${alreadyMapped.serviceSubtype})` : ''} [{alreadyMapped.sectionName}]
                                </span>
                              ) : selectedInState ? (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded inline-block">
                                  ● {serviceLines.find((s: any) => s.id === selectedInState)?.serviceType || 'Selected'} (pending save)
                                </span>
                              ) : (
                                <select
                                  value={poServiceMappings[po.id]?.[liIdx] || ''}
                                  onChange={(e) => {
                                    setPoServiceMappings(prev => ({
                                      ...prev,
                                      [po.id]: { ...(prev[po.id] || {}), [liIdx]: Number(e.target.value) }
                                    }));
                                  }}
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white"
                                >
                                  <option value="">→ Select service...</option>
                                  {serviceLines.map((svc: any) => (
                                    <option key={svc.id} value={svc.id}>{svc.serviceType}{svc.serviceSubtype ? ` - ${svc.serviceSubtype}` : ''} [{svc.sectionName}]</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {poServiceMappings[po.id] && Object.values(poServiceMappings[po.id]).some(v => v > 0) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSaveServiceMapping(po.id, po); }}
                          disabled={savingMapping}
                          className="mt-2 w-full px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {savingMapping ? 'Saving all...' : `✓ Save All Mappings (${Object.values(poServiceMappings[po.id]).filter(v => v > 0).length})`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Delete PO & Mark Expired buttons */}
                  {isSelected && (
                    <div className="mt-2 flex gap-2">
                      {!po.is_expired && !(daysLeft !== null && daysLeft < 0) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Mark PO "${po.po_number}" as expired?`)) {
                              api.put(`/po-reader/${po.id}/expire`).then(() => {
                                api.get(`/vendors/${id}`).then((res) => setVendor(res.data));
                              }).catch((err: any) => alert('Failed: ' + (err.response?.data?.error || err.message)));
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded text-xs font-medium hover:bg-orange-100"
                        >
                          ⏰ Mark Expired
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete PO "${po.po_number}"? This will also remove service mappings.`)) {
                            api.delete(`/po-reader/${po.id}`).then(() => {
                              api.get(`/vendors/${id}`).then((res) => setVendor(res.data));
                            }).catch((err: any) => alert('Delete failed: ' + (err.response?.data?.error || err.message)));
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-medium hover:bg-red-100"
                      >
                        🗑️ Delete PO
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {(!vendor.purchaseOrders || vendor.purchaseOrders.length === 0) && (
              <div className="text-center py-8 text-gray-400 text-sm">No POs yet</div>
            )}
            {vendor.purchaseOrders?.length > 0 && (vendor.purchaseOrders || []).filter((po: any) => {
              const isExpired = (() => {
                if (po.is_expired) return true;
                if (!po.validity_date) return false;
                const parts = po.validity_date.split('/');
                const d = parts.length === 3 ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])) : new Date(po.validity_date);
                return !isNaN(d.getTime()) && d.getTime() < Date.now();
              })();
              return poSubTab === 'expired' ? isExpired : !isExpired;
            }).length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                {poSubTab === 'expired' ? 'No expired POs' : 'No current POs'}
              </div>
            )}
          </div>

          {/* Right: PDF Viewer */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            {selectedPoId ? (
              (() => {
                const po = vendor.purchaseOrders?.find((p: any) => p.id === selectedPoId);
                if (!po) return <div className="flex-1 flex items-center justify-center text-gray-400">PO not found</div>;
                const pdfUrl = po.file_path ? `/uploads/${po.file_path}` : null;
                return (
                  <>
                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm text-gray-800">{po.po_number}</span>
                        <span className="text-xs text-gray-400 ml-2">{po.service_description}</span>
                      </div>
                      {pdfUrl && (
                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#4fc3f7] hover:underline flex items-center gap-1">
                          ↗ Open in new tab
                        </a>
                      )}
                    </div>
                    {pdfUrl ? (
                      <object
                        data={pdfUrl}
                        type="application/pdf"
                        className="flex-1 w-full"
                        aria-label={`PO ${po.po_number}`}
                      >
                        {/* Fallback for browsers that can't render PDF inline */}
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 h-full">
                          <span className="text-5xl mb-3">📄</span>
                          <p className="text-sm font-medium text-gray-600">PDF preview not available in this browser</p>
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 px-4 py-2 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium hover:bg-[#3bb5e8] transition-colors"
                          >
                            ↗ Open PDF in new tab
                          </a>
                        </div>
                      </object>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                        <span className="text-5xl mb-3">📄</span>
                        <p className="text-sm font-medium">No PDF attached to this PO</p>
                        <p className="text-xs mt-1">Upload via PO Reader to attach the PDF</p>
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                <span className="text-5xl mb-3">👈</span>
                <p className="text-sm font-medium">Select a PO to view its PDF</p>
                <p className="text-xs mt-1">Click on any PO from the list</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 4. BILLS (with service-wise sub-tabs) ===== */}
      {tab === 'bills' && (
        <div>
          {/* Header with Import button */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setBillsServiceFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  billsServiceFilter === 'all' ? 'bg-[#1a1a2e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >All ({vendor.bills?.length || 0})</button>
              {uniqueServiceTypes.map((svc) => {
                const count = (vendor.bills || []).filter((b: any) => b.service_type === svc).length;
                return (
                  <button
                    key={svc}
                    onClick={() => setBillsServiceFilter(svc)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      billsServiceFilter === svc ? 'bg-[#4fc3f7] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >{svc} ({count})</button>
                );
              })}
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 flex items-center gap-1"
            >
              📥 Import Previous Bills
            </button>
          </div>

          {/* Import Modal */}
          {showImportModal && (
            <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">📥 Import Previous Bills from Excel</h3>
                <button onClick={() => { setShowImportModal(false); setPreviewData(null); }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              </div>

              {/* Step 1: Upload file */}
              {!previewData && (
                <div>
                  <p className="text-xs text-gray-500 mb-3">
                    Upload an Excel/CSV file with previous bill data. The system will read, analyze, and match vendor "{vendor.name}" automatically.
                  </p>
                  <div className="flex items-center gap-3">
                    <label className={`px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-purple-700 flex items-center gap-2 ${previewLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                      {previewLoading ? '⏳ Reading & Analyzing...' : '📁 Choose Excel File'}
                      <input type="file" className="hidden" accept=".xlsx,.xls,.csv" disabled={previewLoading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePreviewBills(file);
                          e.target.value = '';
                        }} />
                    </label>
                    <span className="text-xs text-gray-400">Supports .xlsx, .xls, .csv</span>
                  </div>
                </div>
              )}

              {/* Step 2: Preview extracted data with service tabs */}
              {previewData && (() => {
                // Group records by service type
                const serviceGroups: Record<string, any[]> = {};
                (previewData.records || []).forEach((r: any) => {
                  const svc = r.serviceType || 'Other';
                  if (!serviceGroups[svc]) serviceGroups[svc] = [];
                  serviceGroups[svc].push(r);
                });
                const serviceNames = Object.keys(serviceGroups);
                const activePreviewService = (window as any).__previewServiceTab || 'all';
                const setActivePreviewService = (s: string) => { (window as any).__previewServiceTab = s; setPreviewData({...previewData}); };
                const displayRecords = activePreviewService === 'all' ? previewData.records : (serviceGroups[activePreviewService] || []);

                return (
                <div>
                  {/* Summary */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-semibold text-green-800">✅ File analyzed & matched</span>
                      <span className="text-green-700">📄 {previewData.fileName}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-green-700">
                      <span>📊 <strong>{previewData.totalRows}</strong> bills for "{vendor.name}"</span>
                      <span>📋 {previewData.summary?.uniquePOs?.length || 0} POs</span>
                      <span>🔧 {serviceNames.length} service type(s)</span>
                    </div>
                  </div>

                  {/* Service Type Tabs */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      onClick={() => setActivePreviewService('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activePreviewService === 'all' ? 'bg-[#1a1a2e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >All ({previewData.records.length})</button>
                    {serviceNames.map((svc) => (
                      <button
                        key={svc}
                        onClick={() => setActivePreviewService(svc)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          activePreviewService === svc ? 'bg-[#4fc3f7] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >{svc} ({serviceGroups[svc].length})</button>
                    ))}
                  </div>

                  {/* Data Table */}
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg mb-4">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">#</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Service</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">PO Number</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Invoice No</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Invoice Date</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Receipt Date</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600 border-b">Basic Value</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600 border-b">GST</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600 border-b">Invoice Value</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Month</th>
                          <th className="px-2 py-2 text-center font-semibold text-gray-600 border-b">Status</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600 border-b">Deduction</th>
                          <th className="px-2 py-2 text-right font-semibold text-gray-600 border-b">Paid Amt</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">UTR</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Payment Date</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-600 border-b">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {displayRecords.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-blue-50/30">
                            <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-medium">{r.serviceType || '—'}</span>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-gray-700 text-[11px]">{r.poNumber || '—'}</td>
                            <td className="px-2 py-1.5 font-medium text-gray-800">{r.invoiceNumber || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{r.invoiceDate || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{r.receiptDate || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.basicValue || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.gst || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium text-green-700">{r.invoiceValue || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{r.month || '—'}</td>
                            <td className="px-2 py-1.5 text-center">
                              {r.paymentStatus ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  r.paymentStatus.toLowerCase().includes('done') || r.paymentStatus.toLowerCase().includes('paid') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                }`}>{r.paymentStatus}</span>
                              ) : '—'}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-red-600">{r.deduction || '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.paidAmount || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500 max-w-[150px] truncate text-[10px]">{r.utr || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500">{r.paymentDate || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-400 max-w-[100px] truncate">{r.remarks || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Service breakdown summary */}
                  {serviceNames.length > 1 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                      <h4 className="text-xs font-semibold text-purple-800 mb-2">📊 Service-wise Distribution:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {serviceNames.map(svc => (
                          <div key={svc} className="flex items-center justify-between bg-white rounded px-3 py-1.5 border border-purple-100">
                            <span className="text-xs text-gray-700">{svc}</span>
                            <span className="text-xs font-bold text-purple-700">{serviceGroups[svc].length} bills</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleConfirmImport}
                      disabled={importingBills}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {importingBills ? '⏳ Importing...' : `✓ Confirm Import (${previewData.totalRows} bills)`}
                    </button>
                    <button onClick={() => setPreviewData(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">
                      ← Upload Different File
                    </button>
                    <button onClick={() => { setShowImportModal(false); setPreviewData(null); }} className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700">
                      Cancel
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          )}

          {/* Bills table */}
          {/* Action bar when bills are selected */}
          {selectedBills.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">
                {selectedBills.size} bill{selectedBills.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    // Download selected bills as CSV
                    const selected = filteredBills.filter((b: any) => selectedBills.has(b.id));
                    const csvHeaders = ['Invoice #', 'Period', 'Service', 'Amount', 'Status', 'UTR', 'Payment Date'];
                    const csvRows = selected.map((b: any) => [
                      b.invoice_number || '', `${MONTHS[b.billing_period_month - 1]}'${b.billing_period_year}`,
                      b.service_type || '', b.invoice_value || '', b.payment_status || '', b.utr_details || '', b.payment_date || ''
                    ]);
                    const csv = [csvHeaders.join(','), ...csvRows.map((r: any[]) => r.map((c: any) => `"${c}"`).join(','))].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `${vendor.name}_bills_${selectedBills.size}.csv`;
                    a.click(); URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1"
                >
                  📥 Download
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${selectedBills.size} selected bill(s)? This cannot be undone.`)) return;
                    setDeletingBills(true);
                    try {
                      await api.post('/billing/delete-bills', { billIds: [...selectedBills] });
                      const res = await api.get(`/vendors/${id}`);
                      setVendor(res.data);
                      setSelectedBills(new Set());
                      alert(`✅ ${selectedBills.size} bill(s) deleted.`);
                    } catch (err: any) {
                      alert('❌ Delete failed: ' + (err.response?.data?.error || err.message));
                    }
                    setDeletingBills(false);
                  }}
                  disabled={deletingBills}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 flex items-center gap-1 disabled:opacity-50"
                >
                  {deletingBills ? '⏳' : '🗑️'} Delete
                </button>
                <button onClick={() => setSelectedBills(new Set())} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
                  ✕ Clear
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox"
                      checked={filteredBills.length > 0 && filteredBills.every((b: any) => selectedBills.has(b.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBills(new Set(filteredBills.map((b: any) => b.id)));
                        } else {
                          setSelectedBills(new Set());
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-[#4fc3f7] focus:ring-[#4fc3f7]"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Period</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Service</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Amount (₹)</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">UTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredBills.map((bill: any) => (
                  <tr key={bill.id} className={`hover:bg-blue-50/30 transition-colors ${selectedBills.has(bill.id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox"
                        checked={selectedBills.has(bill.id)}
                        onChange={(e) => {
                          const next = new Set(selectedBills);
                          if (e.target.checked) next.add(bill.id); else next.delete(bill.id);
                          setSelectedBills(next);
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-[#4fc3f7] focus:ring-[#4fc3f7]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/bill/${bill.id}`} className="text-[#4fc3f7] hover:underline font-medium">{bill.invoice_number || '—'}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{MONTHS[bill.billing_period_month - 1]}'{bill.billing_period_year}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{bill.service_type || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">₹{Number(bill.invoice_value).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        bill.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>{bill.payment_status === 'paid' ? '✓ Paid' : '○ Pending'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[150px] truncate">{bill.utr_details || '—'}</td>
                  </tr>
                ))}
                {filteredBills.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                    <span className="text-3xl block mb-2">📋</span>
                    {billsServiceFilter === 'all' ? 'No bills generated yet' : `No bills for "${billsServiceFilter}"`}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={highlight ? 'text-green-700 font-medium' : 'text-gray-800'}>{value}</span>
    </div>
  );
}

function formatLakh(amount: number): string {
  if (amount >= 10000000) return (amount / 10000000).toFixed(1) + 'Cr';
  if (amount >= 100000) return (amount / 100000).toFixed(1) + 'L';
  if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
  return amount.toLocaleString('en-IN');
}
