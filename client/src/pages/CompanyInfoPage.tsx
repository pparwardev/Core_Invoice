import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function CompanyInfoPage() {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [form, setForm] = useState({
    name: '', formerly: '', gstin: '', pan: '', state: '', stateCode: '',
    address: '', pincode: '', phone: '', email: '',
    siteAddress: '', siteLocation: '', documentRef: '',
    hsnVehicle: '', hsnFood: '', hsnService: '',
  });

  useEffect(() => {
    api.get('/company').then((res) => {
      const d = res.data;
      if (d.id) setForm({
        name: d.name || '', formerly: d.formerly || 'Quess / Hofincons',
        gstin: d.gstin || '', pan: d.pan || '',
        state: d.state || 'ODISHA', stateCode: d.state_code || '21',
        address: d.address || '', pincode: d.pincode || '751010',
        phone: d.phone || '', email: d.email || '',
        siteAddress: d.site_address || 'C/O-UAIL, AT-DORAGUDA, PO-KUCHEIPADAR, DIST-RAYAGADA, 765015, ODISHA, INDIA',
        siteLocation: d.site_location || 'TIKIRI, RAYAGADA, ODISHA',
        documentRef: d.document_ref || 'QHSE-AC-F-0002-5 (Rev: 4)',
        hsnVehicle: d.hsn_vehicle || '996601/840999', hsnFood: d.hsn_food || '996331',
        hsnService: d.hsn_service || '996412/840999',
      });
    });
    api.get('/vendors').then(r => setVendors(r.data));
  }, []);

  const handleSave = async () => {
    await api.put('/company', form);
    setSaved(true); setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const gstRegistered = vendors.filter(v => v.gstin && v.gstin.length > 10);
  const gstUnregistered = vendors.filter(v => !v.gstin || v.gstin.length <= 10);
  const filteredVendors = vendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    (v.vendor_code || '').includes(vendorSearch)
  );

  return (
    <div>
      {saved && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">✅ Saved successfully!</div>}

      {/* Company Details Card */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-200 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <span className="w-7 h-7 bg-blue-500 rounded flex items-center justify-center text-white text-sm">🏢</span>
            Company Details (Bill To / Receiver)
          </h2>
          <button onClick={() => editing ? handleSave() : setEditing(true)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${editing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
            {editing ? '💾 Save' : '✏️ Edit'}
          </button>
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <div><span className="font-semibold text-gray-700">Name:</span> <span className="text-gray-600">{form.name || 'Bluspring Enterprises Limited'}</span></div>
            <div><span className="font-semibold text-gray-700">Formerly:</span> <span className="text-gray-600">{form.formerly}</span></div>
            <div><span className="font-semibold text-gray-700">GSTIN:</span> <span className="text-blue-600 font-mono">{form.gstin || '21AAMCB3236E1Z5'}</span></div>
            <div><span className="font-semibold text-gray-700">PAN:</span> <span className="font-mono text-gray-600">{form.pan || 'AAMCB3236E'}</span></div>
            <div className="col-span-2"><span className="font-semibold text-gray-700">Regd. Address:</span> <span className="text-gray-600">{form.address || 'Third Floor, Block E, Plot 67P, Venus Plaza, Bhubaneswar, Khordha, Odisha'}</span></div>
            <div><span className="font-semibold text-gray-700">State:</span> <span className="text-gray-600">{form.state} (Code: {form.stateCode})</span></div>
            <div><span className="font-semibold text-gray-700">Pincode:</span> <span className="text-gray-600">{form.pincode}</span></div>
            <div className="col-span-2"><span className="font-semibold text-gray-700">Site (Consignee):</span> <span className="text-gray-600">{form.siteAddress}</span></div>
            <div><span className="font-semibold text-gray-700">Site Location:</span> <span className="text-gray-600">{form.siteLocation}</span></div>
            <div><span className="font-semibold text-gray-700">Document Ref:</span> <span className="text-gray-600">{form.documentRef}</span></div>
            <div><span className="font-semibold text-gray-700">HSN/SAC (Vehicle):</span> <span className="font-mono text-gray-600">{form.hsnVehicle}</span></div>
            <div><span className="font-semibold text-gray-700">HSN/SAC (Food):</span> <span className="font-mono text-gray-600">{form.hsnFood}</span></div>
            <div><span className="font-semibold text-gray-700">HSN/SAC (Service):</span> <span className="font-mono text-gray-600">{form.hsnService}</span></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-gray-500">Company Name</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">Formerly</label><input value={form.formerly} onChange={e => setForm({...form, formerly: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">GSTIN</label><input value={form.gstin} onChange={e => setForm({...form, gstin: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm font-mono" /></div>
            <div><label className="text-[10px] text-gray-500">PAN</label><input value={form.pan} onChange={e => setForm({...form, pan: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm font-mono" /></div>
            <div className="col-span-2"><label className="text-[10px] text-gray-500">Regd. Address</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">State</label><input value={form.state} onChange={e => setForm({...form, state: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">State Code</label><input value={form.stateCode} onChange={e => setForm({...form, stateCode: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div className="col-span-2"><label className="text-[10px] text-gray-500">Site (Consignee) Address</label><input value={form.siteAddress} onChange={e => setForm({...form, siteAddress: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">Site Location</label><input value={form.siteLocation} onChange={e => setForm({...form, siteLocation: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">Document Ref</label><input value={form.documentRef} onChange={e => setForm({...form, documentRef: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">Pincode</label><input value={form.pincode} onChange={e => setForm({...form, pincode: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">HSN Vehicle</label><input value={form.hsnVehicle} onChange={e => setForm({...form, hsnVehicle: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">HSN Food</label><input value={form.hsnFood} onChange={e => setForm({...form, hsnFood: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
            <div><label className="text-[10px] text-gray-500">HSN Service</label><input value={form.hsnService} onChange={e => setForm({...form, hsnService: e.target.value})} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
          </div>
        )}
      </div>

      {/* Vendor Profiles Section */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <span className="text-lg">👥</span>
            Vendor Profiles ({vendors.length} vendors)
          </h2>
          <input type="text" placeholder="🔍 Search vendor profiles..." value={vendorSearch}
            onChange={e => setVendorSearch(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
        </div>
        <p className="text-xs text-gray-400 mb-4">GSTIN, PAN, Address, Bank details — used for bill generation. Click any vendor to edit.</p>

        {/* GST Stats */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{gstRegistered.length}</div>
            <div className="text-xs text-green-600">GST Registered</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{gstUnregistered.length}</div>
            <div className="text-xs text-orange-500">Unregistered / Exempt</div>
          </div>
        </div>

        {/* Vendor Tiles — 4 per row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
          {filteredVendors.map((v: any) => {
            const hasGst = v.gstin && v.gstin.length > 10;
            const services = v.all_services || [];
            return (
              <div key={v.id} onClick={() => navigate(`/vendors/${v.id}`)}
                className="border border-gray-100 rounded-xl p-3 hover:border-[#4fc3f7] hover:shadow-md cursor-pointer transition-all bg-white group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4fc3f7] to-[#1a1a2e] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(v.name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 text-sm truncate">{v.name}</div>
                    {v.vendor_code && <div className="text-[10px] font-mono text-gray-400">{v.vendor_code}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {hasGst ? (
                    <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">GST ✓</span>
                  ) : (
                    <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">No GST</span>
                  )}
                  {(v.sections || []).slice(0, 2).map((s: any, i: number) => (
                    <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      (s.name || s) === 'REFINERY' ? 'bg-blue-500 text-white' :
                      (s.name || s) === 'POWER-ENGINEERING SERVICE' ? 'bg-red-500 text-white' : 'bg-purple-500 text-white'
                    }`}>{(s.name || s) === 'POWER-ENGINEERING SERVICE' ? 'P-ENG' : (s.name || s) === 'POWER-MMD' ? 'MMD' : (s.name || s) === 'REFINERY' ? 'REF' : (s.name || s)}</span>
                  ))}
                </div>
                {services.length > 0 && (
                  <div className="text-[10px] text-gray-500 truncate">{services.slice(0, 2).join(', ')}</div>
                )}
              </div>
            );
          })}
          {filteredVendors.length === 0 && (
            <div className="col-span-4 text-center py-8 text-gray-400 text-sm">No vendors found</div>
          )}
        </div>
      </div>
    </div>
  );
}
