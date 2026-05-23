import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

// Service category definitions with icons and grouping logic
const SERVICE_CATEGORIES = [
  { key: 'all', label: 'All', icon: '📋', color: 'bg-blue-50 border-blue-200 text-blue-700', activeColor: 'bg-blue-500 text-white border-blue-500' },
  { key: 'hk', label: 'HK', icon: '🧹', color: 'bg-amber-50 border-amber-200 text-amber-700', activeColor: 'bg-amber-500 text-white border-amber-500', match: ['House Keeping'] },
  { key: 'camper', label: 'Camper', icon: '🚐', color: 'bg-green-50 border-green-200 text-green-700', activeColor: 'bg-green-500 text-white border-green-500', match: ['Transport - Camper'] },
  { key: 'bus', label: 'Bus', icon: '🚌', color: 'bg-purple-50 border-purple-200 text-purple-700', activeColor: 'bg-purple-500 text-white border-purple-500', match: ['Transport - Bus'] },
  { key: 'vehicle', label: 'Vehicle', icon: '🚗', color: 'bg-teal-50 border-teal-200 text-teal-700', activeColor: 'bg-teal-500 text-white border-teal-500', match: ['Transport - Bolero', 'Bob Cat Service', 'Dozzer Service', 'Tipper Service'] },
  { key: 'equip', label: 'Equip', icon: '🔧', color: 'bg-orange-50 border-orange-200 text-orange-700', activeColor: 'bg-orange-500 text-white border-orange-500', match: ['Hydra Service', 'Forklift Service', 'Trailor Service', 'Transport - Palfinger'] },
  { key: 'crane', label: 'Crane', icon: '🏗️', color: 'bg-red-50 border-red-200 text-red-700', activeColor: 'bg-red-500 text-white border-red-500', match: ['Crane Service'] },
  { key: 'rent', label: 'Rent', icon: '🏠', color: 'bg-indigo-50 border-indigo-200 text-indigo-700', activeColor: 'bg-indigo-500 text-white border-indigo-500', match: ['House Rent', 'Guest House Rent'] },
  { key: 'food', label: 'Food', icon: '🍽️', color: 'bg-pink-50 border-pink-200 text-pink-700', activeColor: 'bg-pink-500 text-white border-pink-500', match: ['Food Supply'] },
  { key: 'it', label: 'IT', icon: '💻', color: 'bg-cyan-50 border-cyan-200 text-cyan-700', activeColor: 'bg-cyan-500 text-white border-cyan-500', match: ['CMMS Service', 'IT / Computer Services'] },
  { key: 'consult', label: 'Consult', icon: '📐', color: 'bg-lime-50 border-lime-200 text-lime-700', activeColor: 'bg-lime-500 text-white border-lime-500', match: ['Scientific & Technical Services', 'Calibration / Lab Services', 'Engineering Services'] },
  { key: 'elec', label: 'Elec', icon: '⚡', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', activeColor: 'bg-yellow-500 text-white border-yellow-500', match: ['Guest House Electricity'] },
  { key: 'other', label: 'Other', icon: '📦', color: 'bg-gray-50 border-gray-200 text-gray-700', activeColor: 'bg-gray-500 text-white border-gray-500', match: ['Pipeline Service', 'Manpower Supply', 'Tools & Tackles', 'Printing / Supplies', 'Labour / Contractor', 'Other Services'] },
];

const DEPARTMENT_OPTIONS = [
  { value: 1, label: 'REFINERY' },
  { value: 2, label: 'POWER-ENGINEERING SERVICE' },
  { value: 3, label: 'POWER-MMD' },
];

function getCategoryForService(serviceType: string): string {
  for (const cat of SERVICE_CATEGORIES) {
    if (cat.match && cat.match.includes(serviceType)) return cat.key;
  }
  return 'other';
}

function getServiceBadgeColor(serviceType: string): string {
  const cat = getCategoryForService(serviceType);
  const colors: Record<string, string> = {
    hk: 'bg-amber-100 text-amber-700',
    camper: 'bg-green-100 text-green-700',
    bus: 'bg-purple-100 text-purple-700',
    vehicle: 'bg-teal-100 text-teal-700',
    equip: 'bg-orange-100 text-orange-700',
    crane: 'bg-red-100 text-red-700',
    rent: 'bg-indigo-100 text-indigo-700',
    food: 'bg-pink-100 text-pink-700',
    it: 'bg-cyan-100 text-cyan-700',
    consult: 'bg-lime-100 text-lime-700',
    elec: 'bg-yellow-100 text-yellow-700',
    other: 'bg-gray-100 text-gray-700',
  };
  return colors[cat] || 'bg-gray-100 text-gray-700';
}

function getDeptBadge(sections: any[]): { label: string; color: string } {
  if (!sections || sections.length === 0) return { label: 'N/A', color: 'bg-gray-100 text-gray-600' };
  const s = sections[0];
  if (s.code === 'REF') return { label: 'REFINERY', color: 'bg-blue-500 text-white' };
  if (s.code === 'PES') return { label: 'POWER-ENG', color: 'bg-red-500 text-white' };
  if (s.code === 'MMD') return { label: 'POWER-MMD', color: 'bg-purple-500 text-white' };
  return { label: s.code, color: 'bg-gray-500 text-white' };
}

interface ServiceEntry {
  serviceType: string;
  sectionId: string;
  poNumber: string;
  poStartDate: string;
  poEndDate: string;
}

const emptyForm = { name: '', vendorCode: '', gstin: '' };
const emptyServiceEntry: ServiceEntry = { serviceType: '', sectionId: '', poNumber: '', poStartDate: '', poEndDate: '' };

export default function VendorsPage() {
  const [searchParams] = useSearchParams();
  const [vendors, setVendors] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState(searchParams.get('dept') || '');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>([{ ...emptyServiceEntry }]);
  const [saving, setSaving] = useState(false);
  const [serviceTypesList, setServiceTypesList] = useState<string[]>([]);
  const [addingNewService, setAddingNewService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [showServicesPanel, setShowServicesPanel] = useState(false);
  const [newServiceInput, setNewServiceInput] = useState('');
  const [serviceFilterFromUrl] = useState(searchParams.get('service') || '');

  useEffect(() => { loadVendors(); }, [deptFilter]);

  // Apply service filter from URL on load
  useEffect(() => {
    if (serviceFilterFromUrl && vendors.length > 0) {
      // Find which category this service belongs to
      for (const cat of SERVICE_CATEGORIES) {
        if (cat.match && cat.match.includes(serviceFilterFromUrl)) {
          setActiveCategory(cat.key);
          return;
        }
      }
      // If not in predefined categories, set search term
      setSearchTerm(serviceFilterFromUrl);
    }
  }, [serviceFilterFromUrl, vendors]);

  useEffect(() => {
    const allServices = vendors.flatMap((v) => v.all_services || [v.service_type]).filter(Boolean);
    setServiceTypesList([...new Set(allServices)].sort());
  }, [vendors]);

  const loadVendors = async () => {
    const params: any = {};
    if (deptFilter) params.section = deptFilter;
    const res = await api.get('/vendors', { params });
    setVendors(res.data);
  };

  const handleSave = async () => {
    if (!form.name || serviceEntries.every(s => !s.serviceType)) return;
    setSaving(true);
    try {
      const validServices = serviceEntries.filter(s => s.serviceType);
      const payload = {
        name: form.name,
        vendorCode: form.vendorCode,
        gstin: form.gstin,
        serviceType: validServices.map(s => s.serviceType).join(', '),
        sectionIds: [...new Set(validServices.map(s => Number(s.sectionId)).filter(Boolean))],
        services: validServices.map(s => ({
          serviceType: s.serviceType,
          sectionId: Number(s.sectionId) || 1,
          poNumber: s.poNumber,
          poStartDate: s.poStartDate,
          poEndDate: s.poEndDate,
        })),
      };

      if (editingId) {
        await api.put(`/vendors/${editingId}`, payload);
      } else {
        await api.post('/vendors', payload);
      }
      setForm(emptyForm);
      setServiceEntries([{ ...emptyServiceEntry }]);
      setShowAddForm(false);
      setEditingId(null);
      await loadVendors();
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  };

  const handleEdit = (v: any) => {
    setEditingId(v.id);
    setForm({ name: v.name || '', vendorCode: v.vendor_code || '', gstin: v.gstin || '' });
    // Build service entries from vendor's all_services
    const services = v.all_services || [v.service_type];
    setServiceEntries(services.map((svc: string, i: number) => ({
      serviceType: svc,
      sectionId: v.sections?.[0]?.id?.toString() || '',
      poNumber: v.purchase_orders?.[i]?.po_number || '',
      poStartDate: v.purchase_orders?.[i]?.po_date || '',
      poEndDate: v.purchase_orders?.[i]?.validity_date || '',
    })));
    setShowAddForm(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete vendor "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/vendors/${id}`);
      await loadVendors();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setServiceEntries([{ ...emptyServiceEntry }]);
    setAddingNewService(false);
    setNewServiceName('');
  };

  const handleServiceTypeChange = (value: string) => {
    if (value === '__add_new__') {
      setAddingNewService(true);
      setNewServiceName('');
    } else {
      setAddingNewService(false);
    }
  };

  const handleAddNewService = () => {
    const trimmed = newServiceName.trim();
    if (!trimmed) return;
    if (!serviceTypesList.includes(trimmed)) {
      setServiceTypesList((prev) => [...prev, trimmed].sort());
    }
    setAddingNewService(false);
    setNewServiceName('');
  };

  // Toggle service in a service entry's checkbox
  const toggleServiceInEntry = (idx: number, svc: string) => {
    const updated = [...serviceEntries];
    if (updated[idx].serviceType === svc) {
      updated[idx].serviceType = '';
    } else {
      updated[idx].serviceType = svc;
    }
    setServiceEntries(updated);
  };

  const addServiceEntry = () => {
    setServiceEntries([...serviceEntries, { ...emptyServiceEntry }]);
  };

  const removeServiceEntry = (idx: number) => {
    if (serviceEntries.length <= 1) return;
    setServiceEntries(serviceEntries.filter((_, i) => i !== idx));
  };

  const updateServiceEntry = (idx: number, field: keyof ServiceEntry, value: string) => {
    const updated = [...serviceEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    setServiceEntries(updated);
  };

  // Services Panel: Add new service
  const handleAddServiceToList = () => {
    const trimmed = newServiceInput.trim();
    if (!trimmed) return;
    if (!serviceTypesList.includes(trimmed)) {
      setServiceTypesList((prev) => [...prev, trimmed].sort());
    }
    setNewServiceInput('');
  };

  // Services Panel: Delete service
  const handleDeleteService = (service: string) => {
    const vendorsUsingIt = vendors.filter((v) => (v.all_services || []).includes(service));
    if (vendorsUsingIt.length > 0) {
      alert(`Cannot delete "${service}" — ${vendorsUsingIt.length} vendor(s) are using this service.`);      return;
    }
    setServiceTypesList((prev) => prev.filter((s) => s !== service));
  };

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: vendors.length };
    for (const v of vendors) {
      const services = v.all_services || [v.service_type];
      for (const svc of services) {
        const cat = getCategoryForService(svc);
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [vendors]);

  // Filter vendors by active category and search
  const filteredVendors = useMemo(() => {
    let result = vendors;
    if (activeCategory !== 'all') {
      const cat = SERVICE_CATEGORIES.find((c) => c.key === activeCategory);
      if (cat?.match) {
        result = result.filter((v) => {
          const services = v.all_services || [v.service_type];
          return services.some((svc: string) => cat.match!.includes(svc));
        });
      }
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((v) =>
        v.name.toLowerCase().includes(term) ||
        (v.vendor_code || '').toLowerCase().includes(term) ||
        (v.service_type || '').toLowerCase().includes(term) ||
        (v.all_services || []).some((s: string) => s.toLowerCase().includes(term))
      );
    }
    // Also filter by URL service param if no category matched
    if (serviceFilterFromUrl && activeCategory === 'all' && !searchTerm) {
      result = result.filter((v) =>
        (v.all_services || [v.service_type]).some((s: string) => s === serviceFilterFromUrl)
      );
    }
    return result;
  }, [vendors, activeCategory, searchTerm, serviceFilterFromUrl]);

  const activeCatDef = SERVICE_CATEGORIES.find((c) => c.key === activeCategory);
  const activeCatLabel = activeCategory !== 'all' && activeCatDef
    ? `${activeCatDef.icon} Showing: ${activeCatDef.label} (${filteredVendors.length} vendors)`
    : null;

  return (
    <div>
      {/* Header Row */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Vendors ({vendors.length})
        </h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:ring-2 focus:ring-[#4fc3f7] focus:border-[#4fc3f7] outline-none"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#4fc3f7] outline-none"
          >
            <option value="">All Departments</option>
            <option value="REFINERY">Refinery</option>
            <option value="POWER-ENGINEERING SERVICE">Power-Engineering</option>
            <option value="POWER-MMD">Power-MMD</option>
          </select>
          <button
            onClick={() => { setShowServicesPanel(!showServicesPanel); setShowAddForm(false); }}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Services
          </button>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setEditingId(null); setForm(emptyForm); setShowServicesPanel(false); }}
            className="px-4 py-2 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#2a2a4e] transition-colors flex items-center gap-1"
          >
            + Add Vendor
          </button>
          {/* Bulk Upload Buttons */}
          <button
            onClick={async () => {
              try {
                const res = await api.get('/vendors/bulk/template', { responseType: 'blob' });
                const url = URL.createObjectURL(new Blob([res.data]));
                const a = document.createElement('a'); a.href = url; a.download = 'Vendor_Bulk_Upload_Template.csv'; a.click(); URL.revokeObjectURL(url);
              } catch (err: any) { alert('Download failed: ' + (err.response?.data?.error || err.message)); }
            }}
            className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors flex items-center gap-1"
          >
            📥 Download Template
          </button>
          <label className="px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors flex items-center gap-1 cursor-pointer">
            📤 Bulk Upload
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length < 2) { alert('File is empty or has no data rows'); return; }
                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                const rows = lines.slice(1).map(line => {
                  const values = line.match(/(".*?"|[^,]*)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || [];
                  const row: any = {};
                  headers.forEach((h, i) => { row[h] = values[i] || ''; });
                  return row;
                }).filter(r => r['Name*'] || r['Name']);
                if (rows.length === 0) { alert('No valid rows found. Make sure "Name*" column has values.'); return; }
                if (!confirm(`Found ${rows.length} vendors in file. Upload and create them?`)) return;
                const res = await api.post('/vendors/bulk/upload', { rows });
                alert(`✅ ${res.data.message}`);
                loadVendors();
              } catch (err: any) {
                alert('❌ Upload failed: ' + (err.response?.data?.error || err.message));
              }
              e.target.value = '';
            }} />
          </label>
        </div>
      </div>

      {/* Services Management Panel */}
      {showServicesPanel && (
        <div className="mb-6 border-2 border-dashed border-purple-300 rounded-xl p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage Services ({serviceTypesList.length})
            </h2>
            <button
              onClick={() => setShowServicesPanel(false)}
              className="text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              ✕
            </button>
          </div>

          {/* Add New Service Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Enter new service name..."
              value={newServiceInput}
              onChange={(e) => setNewServiceInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddServiceToList(); }}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none"
            />
            <button
              onClick={handleAddServiceToList}
              disabled={!newServiceInput.trim()}
              className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>

          {/* Services List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {serviceTypesList.map((service) => {
              const count = vendors.filter((v) => v.service_type === service).length;
              return (
                <div
                  key={service}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 group hover:border-gray-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full ${getServiceBadgeColor(service).split(' ')[0]}`} />
                    <span className="text-sm text-gray-700 truncate">{service}</span>
                    <span className="text-xs text-gray-400 shrink-0">({count})</span>
                  </div>
                  <button
                    onClick={() => handleDeleteService(service)}
                    className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                    title={count > 0 ? `Cannot delete — ${count} vendor(s) using this` : 'Delete service'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {serviceTypesList.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">No services added yet. Add your first service above.</p>
          )}
        </div>
      )}

      {/* Add/Edit Vendor Form Box */}
      {showAddForm && (
        <div className="mb-6 border-2 border-dashed border-[#4fc3f7] rounded-xl p-6 bg-white">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingId ? 'Edit Vendor' : 'Add New Vendor'}
          </h2>

          {/* Vendor basic info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <input type="text" placeholder="Vendor Name *" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
            <input type="text" placeholder="Vendor Code" value={form.vendorCode}
              onChange={(e) => setForm({ ...form, vendorCode: e.target.value })}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
            <input type="text" placeholder="GSTIN (optional)" value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
          </div>

          {/* Services section */}
          <div className="border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Services ({serviceEntries.filter(s => s.serviceType).length})</h3>
              <button onClick={addServiceEntry} className="text-xs text-[#4fc3f7] hover:underline font-medium">+ Add Another Service</button>
            </div>

            <div className="space-y-3">
              {serviceEntries.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center p-3 bg-gray-50 rounded-lg">
                  {/* Service Type - dropdown with checkbox feel */}
                  <div className="md:col-span-2 relative">
                    <select
                      value={entry.serviceType}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          handleServiceTypeChange('__add_new__');
                        } else {
                          updateServiceEntry(idx, 'serviceType', e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none bg-white"
                    >
                      <option value="">Select Service *</option>
                      {serviceTypesList.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                      <option value="__add_new__">➕ Add New...</option>
                    </select>
                  </div>
                  {/* Department */}
                  <select value={entry.sectionId} onChange={(e) => updateServiceEntry(idx, 'sectionId', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none bg-white">
                    <option value="">Department *</option>
                    {DEPARTMENT_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  {/* PO Number */}
                  <input type="text" placeholder="PO Number" value={entry.poNumber}
                    onChange={(e) => updateServiceEntry(idx, 'poNumber', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
                  {/* PO Start Date */}
                  <input type="date" title="PO Start Date" value={entry.poStartDate}
                    onChange={(e) => updateServiceEntry(idx, 'poStartDate', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
                  {/* PO End Date + Remove */}
                  <div className="flex gap-1">
                    <input type="date" title="PO End Date" value={entry.poEndDate}
                      onChange={(e) => updateServiceEntry(idx, 'poEndDate', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#4fc3f7] outline-none" />
                    {serviceEntries.length > 1 && (
                      <button onClick={() => removeServiceEntry(idx)} className="px-2 text-red-400 hover:text-red-600" title="Remove">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add new service inline */}
            {addingNewService && (
              <div className="flex gap-2 mt-3">
                <input type="text" placeholder="New service name..." value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewService(); }}
                  autoFocus
                  className="flex-1 px-3 py-2 border border-[#4fc3f7] rounded text-sm bg-blue-50 outline-none" />
                <button onClick={handleAddNewService} className="px-3 py-2 bg-[#4fc3f7] text-white rounded text-sm">✓</button>
                <button onClick={() => { setAddingNewService(false); setNewServiceName(''); }} className="px-3 py-2 bg-gray-100 text-gray-600 rounded text-sm">✕</button>
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave}
              disabled={saving || !form.name || serviceEntries.every(s => !s.serviceType)}
              className="px-5 py-2 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium hover:bg-[#3bb5e8] disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving...' : 'Save Vendor'}
            </button>
            <button onClick={handleCancel} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {SERVICE_CATEGORIES.map((cat) => {
          const count = categoryCounts[cat.key] || 0;
          if (cat.key !== 'all' && count === 0) return null;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex flex-col items-center justify-center px-4 py-2 rounded-xl border-2 min-w-[70px] transition-all duration-200 cursor-pointer ${
                isActive ? cat.activeColor + ' border-transparent shadow-md scale-105' : cat.color + ' hover:shadow-sm hover:scale-102'
              }`}
            >
              <span className="text-xl font-bold leading-tight">{count}</span>
              <span className="flex items-center gap-1 text-xs font-medium mt-0.5">
                <span>{cat.icon}</span>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Filter Indicator */}
      {activeCatLabel && (
        <div className="flex items-center justify-between mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-sm font-medium text-green-700">{activeCatLabel}</span>
          <button
            onClick={() => setActiveCategory('all')}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
          >
            ✕ Show All
          </button>
        </div>
      )}

      {/* Vendor Table — Grouped by category when "All" selected */}
      {activeCategory === 'all' ? (
        // GROUPED VIEW
        <div className="space-y-6">
          {SERVICE_CATEGORIES.filter(cat => cat.key !== 'all' && (categoryCounts[cat.key] || 0) > 0).map(cat => {
            const catVendors = filteredVendors.filter(v => {
              const services = v.all_services || [v.service_type];
              return services.some((svc: string) => cat.match?.includes(svc));
            });
            if (catVendors.length === 0) return null;
            return (
              <div key={cat.key} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-800">
                    {cat.icon} <span className="text-[#4fc3f7]">{cat.label}</span>
                    <span className="text-gray-400 font-normal text-sm ml-2">({catVendors.length} entries)</span>
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Vendor Name</th>
                      <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Service(s)</th>
                      <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Department</th>
                      <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Vendor Code</th>
                      <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">PO Number</th>
                      <th className="text-center px-5 py-2 font-medium text-gray-600 text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {catVendors.map((v) => {
                      const dept = getDeptBadge(v.sections);
                      return (
                        <tr key={v.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-5 py-2.5 font-medium text-gray-800"><Link to={`/vendors/${v.id}`} className="hover:text-[#4fc3f7]">{v.name}</Link></td>
                          <td className="px-5 py-2.5"><div className="flex flex-wrap gap-1">{(v.all_services||[]).filter((s:string) => cat.match?.includes(s)).map((svc:string,i:number) => <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${getServiceBadgeColor(svc)}`}>{svc}</span>)}</div></td>
                          <td className="px-5 py-2.5"><span className={`text-xs px-2.5 py-1 rounded font-semibold ${dept.color}`}>{dept.label}</span></td>
                          <td className="px-5 py-2.5 text-gray-500 font-mono text-xs">{v.vendor_code || '—'}</td>
                          <td className="px-5 py-2.5 text-gray-600 text-xs font-mono">{v.purchase_orders?.filter((po:any) => { if (po.is_expired) return false; if (!po.validity_date) return true; const p = po.validity_date.split('/'); const d = p.length===3 ? new Date(Number(p[2]),Number(p[1])-1,Number(p[0])) : new Date(po.validity_date); return isNaN(d.getTime()) || d.getTime() >= Date.now(); }).slice(0,2).map((po:any)=>po.po_number).join(', ') || '—'}</td>
                          <td className="px-5 py-2.5 text-center"><div className="flex items-center justify-center gap-2">
                            <button onClick={()=>handleEdit(v)} className="w-7 h-7 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center text-white shadow-sm" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            <button onClick={()=>handleDelete(v.id,v.name)} className="w-7 h-7 rounded-full bg-red-400 hover:bg-red-500 flex items-center justify-center text-white shadow-sm" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          {filteredVendors.length === 0 && <div className="text-center py-12 text-gray-400"><span className="text-4xl block mb-2">🔍</span>No vendors found.</div>}
        </div>
      ) : (
        // SINGLE CATEGORY VIEW
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          {activeCatDef && (
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-800">{activeCatDef.icon} <span className="text-[#4fc3f7]">{activeCatDef.label}</span> <span className="text-gray-400 font-normal text-sm ml-2">({filteredVendors.length} entries)</span></h2>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Vendor Name</th>
                <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Service(s)</th>
                <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Department</th>
                <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">Vendor Code</th>
                <th className="text-left px-5 py-2 font-medium text-gray-600 text-xs">PO Number</th>
                <th className="text-center px-5 py-2 font-medium text-gray-600 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredVendors.map((v) => {
                const dept = getDeptBadge(v.sections);
                return (
                  <tr key={v.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-gray-800"><Link to={`/vendors/${v.id}`} className="hover:text-[#4fc3f7]">{v.name}</Link></td>
                    <td className="px-5 py-2.5"><div className="flex flex-wrap gap-1">{(v.all_services||[v.service_type]).slice(0,3).map((svc:string,i:number) => <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${getServiceBadgeColor(svc)}`}>{svc}</span>)}{v.service_count>3 && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">+{v.service_count-3}</span>}</div></td>
                    <td className="px-5 py-2.5"><span className={`text-xs px-2.5 py-1 rounded font-semibold ${dept.color}`}>{dept.label}</span></td>
                    <td className="px-5 py-2.5 text-gray-500 font-mono text-xs">{v.vendor_code || '—'}</td>
                    <td className="px-5 py-2.5 text-gray-600 text-xs font-mono">{v.purchase_orders?.filter((po:any) => { if (po.is_expired) return false; if (!po.validity_date) return true; const p = po.validity_date.split('/'); const d = p.length===3 ? new Date(Number(p[2]),Number(p[1])-1,Number(p[0])) : new Date(po.validity_date); return isNaN(d.getTime()) || d.getTime() >= Date.now(); }).slice(0,2).map((po:any)=>po.po_number).join(', ') || '—'}</td>
                    <td className="px-5 py-2.5 text-center"><div className="flex items-center justify-center gap-2">
                      <button onClick={()=>handleEdit(v)} className="w-7 h-7 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center text-white shadow-sm" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                      <button onClick={()=>handleDelete(v.id,v.name)} className="w-7 h-7 rounded-full bg-red-400 hover:bg-red-500 flex items-center justify-center text-white shadow-sm" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredVendors.length === 0 && <div className="text-center py-12 text-gray-400"><span className="text-4xl block mb-2">🔍</span>No vendors found.</div>}
        </div>
      )}
    </div>
  );
}
