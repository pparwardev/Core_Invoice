import { useState, useEffect } from 'react';
import api from '../api/client';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    const params: any = {};
    if (filter) params.fileType = filter;
    const res = await api.get('/documents', { params });
    setDocuments(res.data);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err) {
      console.error(err);
    } finally { setUploading(false); }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this document?')) { await api.delete(`/documents/${id}`); load(); }
  };

  const typeColors: Record<string, string> = {
    logsheet: 'bg-blue-100 text-blue-700',
    po: 'bg-green-100 text-green-700',
    invoice: 'bg-purple-100 text-purple-700',
    wcr: 'bg-orange-100 text-orange-700',
    eway: 'bg-yellow-100 text-yellow-700',
    other: 'bg-gray-100 text-gray-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Document Database</h1>
        <div className="flex gap-3 items-center">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">All Types</option>
            <option value="logsheet">Log Sheet</option>
            <option value="po">Purchase Order</option>
            <option value="invoice">Invoice</option>
            <option value="wcr">WCR</option>
            <option value="eway">E-Way Bill</option>
            <option value="other">Other</option>
          </select>
          <label className="bg-[#4fc3f7] text-[#1a1a2e] px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:bg-[#39b0e4]">
            {uploading ? 'Uploading...' : '📁 Upload File'}
            <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png" />
          </label>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">Upload documents (PDF, Excel, Images). AI will auto-classify and map to vendors.</p>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">File Name</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Vendor</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Summary</th>
              <th className="text-left px-4 py-3">Uploaded</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{doc.file_name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${typeColors[doc.file_type] || typeColors.other}`}>
                    {doc.file_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{doc.vendor_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${doc.status === 'mapped' ? 'bg-green-100 text-green-700' : doc.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {doc.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{doc.summary || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{new Date(doc.uploaded_at).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(doc.id)} className="text-red-500 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No documents uploaded yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
