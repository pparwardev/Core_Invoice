import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [stats, setStats] = useState<any>(null);
  const navigate = useNavigate();
  const [bills, setBills] = useState<any[]>([]);
  const [billSearch, setBillSearch] = useState('');
  const [allVendors, setAllVendors] = useState<any[]>([]);
  const [dlVendors, setDlVendors] = useState<string[]>(['all']);
  const [dlFromMonth, setDlFromMonth] = useState(1);
  const [dlToMonth, setDlToMonth] = useState(new Date().getMonth() + 1);
  const [dlYear, setDlYear] = useState(new Date().getFullYear());
  const [downloading, setDownloading] = useState(false);
  const [dlDropdownOpen, setDlDropdownOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'none' | 'billed' | 'pending' | 'monthTotal' | 'billsGenerated'>('none');

  useEffect(() => { loadData(); }, [month, year]);
  useEffect(() => { api.get('/vendors').then(r => setAllVendors(r.data)).catch(() => {}); }, []);

  const loadData = async () => {
    try {
      const [dashRes, billsRes] = await Promise.all([
        api.get('/dashboard', { params: { month, year } }),
        api.get('/billing', { params: { month, year } }),
      ]);
      setStats(dashRes.data);
      setBills(billsRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!stats) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <img src="/PO_Invoicing_App_Icon.ico" alt="" className="w-12 h-12 rounded mx-auto mb-3 animate-pulse" />
        <p className="text-gray-400">Loading dashboard...</p>
      </div>
    </div>
  );

  const monthLabel = `${MONTHS[month - 1]}'${year}`;

  // Download handler
  const handleDownload = async (format: 'excel' | 'pdf') => {
    setDownloading(true);
    try {
      // Fetch bills for selected vendors and month range
      const vendorIds = dlVendors.includes('all') ? allVendors.map((v: any) => v.id) : dlVendors.map(Number);
      const allBillsForDownload: any[] = [];
      for (let m = dlFromMonth; m <= dlToMonth; m++) {
        const res = await api.get('/billing', { params: { month: m, year: dlYear } });
        const filtered = res.data.filter((b: any) => vendorIds.includes(b.vendor_id));
        allBillsForDownload.push(...filtered);
      }

      if (allBillsForDownload.length === 0) { alert('No bills found for selected criteria.'); setDownloading(false); return; }

      if (format === 'excel') {
        // Generate CSV
        const headers = ['Vendor Name','Service Type','Invoice Number','Invoice Date','Basic Value','GST','Invoice Value','Payment Status','Paid Amount','UTR Details','Payment Date','Month','Year'];
        const rows = allBillsForDownload.map((b: any) => [
          b.vendor_name || '', b.service_type || '', b.invoice_number || '', b.invoice_date || '',
          b.basic_value || 0, b.gst_amount || 0, b.invoice_value || 0,
          b.payment_status || '', b.paid_amount || '', b.utr_details || '', b.payment_date || '',
          MONTHS[(b.billing_period_month || 1) - 1], b.billing_period_year || ''
        ]);
        const csv = [headers.join(','), ...rows.map((r: any[]) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Bills_${MONTHS[dlFromMonth-1]}-${MONTHS[dlToMonth-1]}_${dlYear}.csv`;
        a.click(); URL.revokeObjectURL(url);
      } else {
        // Generate PDF (printable HTML)
        const vendorGroups: Record<string, any[]> = {};
        allBillsForDownload.forEach((b: any) => {
          const name = b.vendor_name || 'Unknown';
          if (!vendorGroups[name]) vendorGroups[name] = [];
          vendorGroups[name].push(b);
        });

        let html = `<html><head><title>Bills Report ${MONTHS[dlFromMonth-1]}-${MONTHS[dlToMonth-1]} ${dlYear}</title>
          <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
          .page{page-break-after:always;padding:20px}
          .page:last-child{page-break-after:auto}
          h2{color:#1a1a2e;border-bottom:2px solid #4fc3f7;padding-bottom:8px}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
          th{background:#f5f5f5;font-size:11px}
          .total{font-weight:bold;background:#e8f5e9}
          .header{text-align:center;margin-bottom:20px}
          .header h1{color:#1a1a2e;margin:0}
          .header p{color:#666;margin:4px 0}
          </style></head><body>`;

        Object.entries(vendorGroups).forEach(([vendorName, vBills]) => {
          const total = vBills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);
          const paid = vBills.filter((b: any) => b.payment_status === 'paid').length;
          html += `<div class="page">
            <div class="header"><h1>Bluspring Enterprises Limited</h1><p>Vendor Bill Report — ${MONTHS[dlFromMonth-1]} to ${MONTHS[dlToMonth-1]} ${dlYear}</p></div>
            <h2>${vendorName}</h2>
            <p><strong>Total Bills:</strong> ${vBills.length} | <strong>Paid:</strong> ${paid} | <strong>Pending:</strong> ${vBills.length - paid} | <strong>Total Value:</strong> ₹${total.toLocaleString('en-IN')}</p>
            <table><thead><tr><th>#</th><th>Invoice No</th><th>Date</th><th>Service</th><th>Month</th><th>Basic Value</th><th>GST</th><th>Invoice Value</th><th>Status</th><th>UTR</th></tr></thead><tbody>`;
          vBills.forEach((b: any, i: number) => {
            html += `<tr><td>${i+1}</td><td>${b.invoice_number||'—'}</td><td>${b.invoice_date||'—'}</td><td>${b.service_type||'—'}</td><td>${MONTHS[(b.billing_period_month||1)-1]}'${b.billing_period_year||''}</td><td>₹${Number(b.basic_value||0).toLocaleString('en-IN')}</td><td>₹${Number(b.gst_amount||0).toLocaleString('en-IN')}</td><td>₹${Number(b.invoice_value||0).toLocaleString('en-IN')}</td><td>${b.payment_status==='paid'?'✓ Paid':'Pending'}</td><td>${b.utr_details||'—'}</td></tr>`;
          });
          html += `<tr class="total"><td colspan="5">TOTAL</td><td>₹${vBills.reduce((s:number,b:any)=>s+Number(b.basic_value||0),0).toLocaleString('en-IN')}</td><td>₹${vBills.reduce((s:number,b:any)=>s+Number(b.gst_amount||0),0).toLocaleString('en-IN')}</td><td>₹${total.toLocaleString('en-IN')}</td><td colspan="2"></td></tr>`;
          html += `</tbody></table></div>`;
        });
        html += '</body></html>';

        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
        }
      }
    } catch (err: any) {
      alert('Download failed: ' + (err.message || ''));
    }
    setDownloading(false);
  };

  const totalVendors = stats.totalVendors || 0;
  const totalBilled = bills.filter((b: any) => b.payment_status === 'paid').length;
  const pendingCount = bills.filter((b: any) => b.payment_status !== 'paid').length;
  const monthTotal = bills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);
  const basicTotal = bills.reduce((s: number, b: any) => s + Number(b.basic_value || 0), 0);
  const gstTotal = monthTotal - basicTotal;
  const progressPct = totalVendors > 0 ? (bills.length / totalVendors) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <img src="/PO_Invoicing_App_Icon.ico" alt="" className="w-7 h-7 rounded" /> Dashboard
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Month:</span>
          <select
            value={`${month}-${year}`}
            onChange={(e) => {
              const [m, y] = e.target.value.split('-');
              setMonth(Number(m));
              setYear(Number(y));
            }}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-[#4fc3f7] outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              return <option key={m} value={`${m}-${year}`}>{MONTHS[i]}'{year}</option>;
            })}
          </select>
        </div>
      </div>

      {/* KPI Cards - Clickable */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div onClick={() => navigate('/vendors')}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center cursor-pointer hover:shadow-md hover:border-blue-200 transition-all">
          <div className="text-3xl font-bold text-blue-600">{totalVendors}</div>
          <div className="text-xs text-gray-500 mt-1">Total Vendors</div>
          <div className="text-[10px] text-blue-400 mt-1">Click to view →</div>
        </div>
        <div onClick={() => setActiveFilter(activeFilter === 'billed' ? 'none' : 'billed')}
          className={`bg-white rounded-xl p-4 shadow-sm border text-center cursor-pointer hover:shadow-md transition-all ${activeFilter === 'billed' ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-100 hover:border-green-200'}`}>
          <div className="text-3xl font-bold text-green-600">{totalBilled}</div>
          <div className="text-xs text-gray-500 mt-1">Billed ({monthLabel.toLowerCase()})</div>
          <div className="text-[10px] text-green-400 mt-1">{activeFilter === 'billed' ? '✓ Showing below' : 'Click to filter ↓'}</div>
        </div>
        <div onClick={() => setActiveFilter(activeFilter === 'pending' ? 'none' : 'pending')}
          className={`bg-white rounded-xl p-4 shadow-sm border text-center cursor-pointer hover:shadow-md transition-all ${activeFilter === 'pending' ? 'border-orange-400 ring-2 ring-orange-100' : 'border-gray-100 hover:border-orange-200'}`}>
          <div className="text-3xl font-bold text-orange-500">{pendingCount}</div>
          <div className="text-xs text-gray-500 mt-1">Pending ({monthLabel.toLowerCase()})</div>
          <div className="text-[10px] text-orange-400 mt-1">{activeFilter === 'pending' ? '✓ Showing below' : 'Click to filter ↓'}</div>
        </div>
        <div onClick={() => setActiveFilter(activeFilter === 'monthTotal' ? 'none' : 'monthTotal')}
          className={`bg-white rounded-xl p-4 shadow-sm border text-center cursor-pointer hover:shadow-md transition-all ${activeFilter === 'monthTotal' ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-100 hover:border-purple-200'}`}>
          <div className="text-3xl font-bold text-purple-600">₹{formatLakh(monthTotal)}</div>
          <div className="text-xs text-gray-500 mt-1">Month Total</div>
          <div className="text-[10px] text-purple-400 mt-1">{activeFilter === 'monthTotal' ? '✓ Showing below' : 'Click to filter ↓'}</div>
        </div>
        <div onClick={() => setActiveFilter(activeFilter === 'billsGenerated' ? 'none' : 'billsGenerated')}
          className={`bg-white rounded-xl p-4 shadow-sm border text-center cursor-pointer hover:shadow-md transition-all ${activeFilter === 'billsGenerated' ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-indigo-200'}`}>
          <div className="text-3xl font-bold text-indigo-600">{bills.length}</div>
          <div className="text-xs text-gray-500 mt-1">Bills Generated</div>
          <div className="text-[10px] text-indigo-400 mt-1">{activeFilter === 'billsGenerated' ? '✓ Showing below' : 'Click to filter ↓'}</div>
        </div>
      </div>

      {/* Filtered View based on active tile */}
      {activeFilter !== 'none' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              {activeFilter === 'billed' && <><span className="w-2 h-2 bg-green-500 rounded-full"></span> Paid Vendors — {monthLabel}</>}
              {activeFilter === 'pending' && <><span className="w-2 h-2 bg-orange-500 rounded-full"></span> Pending Payment — {monthLabel}</>}
              {activeFilter === 'monthTotal' && <><span className="w-2 h-2 bg-purple-500 rounded-full"></span> All Billed — {monthLabel} (₹{formatLakh(monthTotal)})</>}
              {activeFilter === 'billsGenerated' && <><span className="w-2 h-2 bg-indigo-500 rounded-full"></span> Paid Bills — {monthLabel}</>}
            </h3>
            <button onClick={() => setActiveFilter('none')} className="text-xs text-gray-400 hover:text-red-500 transition">✕ Close</button>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            {/* Billed vendors - only PAID */}
            {activeFilter === 'billed' && (
              <table className="w-full text-sm">
                <thead className="bg-green-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Vendor</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Service</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Amount (₹)</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Payment Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bills.filter((b: any) => b.payment_status === 'paid').map((b: any, i: number) => (
                    <tr key={b.id} className="hover:bg-green-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">
                        <Link to={`/bill/${b.id}`} className="hover:text-green-600">{b.vendor_name}</Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{b.service_type || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">₹{Number(b.invoice_value || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{b.payment_date || '—'}</td>
                    </tr>
                  ))}
                  {bills.filter((b: any) => b.payment_status === 'paid').length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-xs">No paid bills this month</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Pending vendors - only PENDING payment */}
            {activeFilter === 'pending' && (
              <table className="w-full text-sm">
                <thead className="bg-orange-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Vendor</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Service</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Amount (₹)</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bills.filter((b: any) => b.payment_status !== 'paid').map((b: any, i: number) => (
                    <tr key={b.id} className="hover:bg-orange-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">
                        <Link to={`/bill/${b.id}`} className="hover:text-orange-600">{b.vendor_name}</Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{b.service_type || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">₹{Number(b.invoice_value || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-center">
                        <Link to={`/bill/${b.id}`} className="text-[10px] bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600">
                          View Bill →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {bills.filter((b: any) => b.payment_status !== 'paid').length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-xs">All bills paid! 🎉</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Month Total - same as billed but sorted by amount */}
            {activeFilter === 'monthTotal' && (
              <table className="w-full text-sm">
                <thead className="bg-purple-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Vendor</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Basic (₹)</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">GST (₹)</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...bills].sort((a: any, b: any) => Number(b.invoice_value || 0) - Number(a.invoice_value || 0)).map((b: any, i: number) => (
                    <tr key={b.id} className="hover:bg-purple-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">
                        <Link to={`/bill/${b.id}`} className="hover:text-purple-600">{b.vendor_name}</Link>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-gray-600">₹{Number(b.basic_value || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-gray-600">₹{Number(b.gst_amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">₹{Number(b.invoice_value || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  <tr className="bg-purple-50 font-semibold">
                    <td colSpan={2} className="px-4 py-2 text-xs text-gray-700">TOTAL</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">₹{basicTotal.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">₹{gstTotal.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-mono">₹{monthTotal.toLocaleString('en-IN')}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Bills Generated - paid bills with links */}
            {activeFilter === 'billsGenerated' && (
              <table className="w-full text-sm">
                <thead className="bg-indigo-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Vendor</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Invoice No</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">Amount (₹)</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">Payment Date</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">UTR</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-600">Bill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bills.filter((b: any) => b.payment_status === 'paid').map((b: any, i: number) => (
                    <tr key={b.id} className="hover:bg-indigo-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">{b.vendor_name}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{b.invoice_number || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">₹{Number(b.invoice_value || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{b.payment_date || '—'}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{b.utr_details || '—'}</td>
                      <td className="px-4 py-2 text-center">
                        <Link to={`/bill/${b.id}`} className="text-[10px] bg-indigo-500 text-white px-2 py-1 rounded hover:bg-indigo-600">
                          View Bill →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {bills.filter((b: any) => b.payment_status === 'paid').length === 0 && (
                    <tr><td colSpan={7} className="text-center py-6 text-gray-400 text-xs">No paid bills this month</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Billing Progress Bar */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-700">Billing Progress — {MONTHS[month - 1]} {year}</h3>
          <span className="text-sm text-gray-500">{totalBilled}/{totalVendors} vendors ({progressPct.toFixed(0)}%)</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Basic: ₹{formatLakh(basicTotal)} | GST: ₹{formatLakh(gstTotal)}</span>
          <span>Total: ₹{formatLakh(monthTotal)}</span>
        </div>
      </div>

      {/* 4-Column Section: Download | Department | Category | Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Download Window */}
        <div className="bg-gradient-to-b from-purple-50 to-white rounded-xl p-4 shadow-sm border border-purple-100">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
            <span className="w-5 h-5 bg-purple-200 rounded flex items-center justify-center text-[10px]">📥</span>
            Download Bills
          </h3>
          <div className="space-y-2.5">
            {/* Vendor Dropdown with Checkboxes */}
            <div className="relative">
              <label className="text-[10px] text-gray-500 block mb-1">Select Vendors</label>
              <button onClick={() => setDlDropdownOpen(!dlDropdownOpen)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white text-left flex items-center justify-between">
                <span className="truncate">{dlVendors.includes('all') ? 'All Vendors' : `${dlVendors.length} selected`}</span>
                <span className="text-gray-400">▾</span>
              </button>
              {dlDropdownOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-purple-50 cursor-pointer border-b border-gray-100">
                    <input type="checkbox" checked={dlVendors.includes('all')} onChange={() => setDlVendors(['all'])} className="w-3 h-3 rounded" />
                    <span className="text-xs font-medium">All Vendors</span>
                  </label>
                  {allVendors.map((v: any) => (
                    <label key={v.id} className="flex items-center gap-2 px-3 py-1 hover:bg-purple-50 cursor-pointer">
                      <input type="checkbox" checked={dlVendors.includes(String(v.id))} onChange={(e) => {
                        if (e.target.checked) setDlVendors(prev => prev.filter(x => x !== 'all').concat(String(v.id)));
                        else setDlVendors(prev => prev.filter(x => x !== String(v.id)));
                      }} className="w-3 h-3 rounded" />
                      <span className="text-[11px] text-gray-700 truncate">{v.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* Month Range */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">From</label>
                <select value={dlFromMonth} onChange={(e) => setDlFromMonth(Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 rounded text-[11px]">
                  {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-0.5">To</label>
                <select value={dlToMonth} onChange={(e) => setDlToMonth(Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 rounded text-[11px]">
                  {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Year</label>
              <select value={dlYear} onChange={(e) => setDlYear(Number(e.target.value))} className="w-full px-1.5 py-1 border border-gray-200 rounded text-[11px]">
                <option value={2026}>2026</option><option value={2025}>2025</option><option value={2024}>2024</option>
              </select>
            </div>
            <div className="flex gap-1.5 pt-1">
              <button onClick={() => handleDownload('excel')} disabled={downloading}
                className="flex-1 px-2 py-1.5 bg-green-600 text-white rounded text-[11px] font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1">
                📊 Excel
              </button>
              <button onClick={() => handleDownload('pdf')} disabled={downloading}
                className="flex-1 px-2 py-1.5 bg-red-500 text-white rounded text-[11px] font-medium hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1">
                📄 PDF
              </button>
            </div>
          </div>
        </div>

        {/* Department Breakdown */}
        <div className="bg-gradient-to-b from-blue-50 to-white rounded-xl p-4 shadow-sm border border-blue-100">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
            <span className="w-5 h-5 bg-blue-200 rounded flex items-center justify-center text-[10px]">🏢</span>
            Department
          </h3>
          <div className="space-y-2.5">
            {(stats.departmentBreakdown || []).map((dept: any) => {
              const deptBills = bills.filter((b: any) => b.section_id === dept.sectionId);
              const deptTotal = deptBills.reduce((s: number, b: any) => s + Number(b.invoice_value || 0), 0);
              const deptName = dept.section === 'POWER-ENGINEERING SERVICE' ? 'POWER-ENG' : dept.section;
              const badgeColor = dept.section === 'REFINERY' ? 'bg-green-500 text-white' : dept.section === 'POWER-ENGINEERING SERVICE' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white';
              const barPct = Number(dept.vendorCount) > 0 ? (deptBills.length / Number(dept.vendorCount)) * 100 : 0;
              return (
                <div key={dept.section} onClick={() => navigate(`/vendors?dept=${encodeURIComponent(dept.section)}`)} className="cursor-pointer hover:bg-blue-50 rounded-lg p-1.5 -mx-1 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeColor}`}>{deptName}</span>
                    <span className="text-[10px] text-gray-500">{deptBills.length}/{dept.vendorCount} | ₹{formatLakh(deptTotal)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${dept.section === 'REFINERY' ? 'bg-green-400' : dept.section === 'POWER-ENGINEERING SERVICE' ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${barPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-gradient-to-b from-amber-50 to-white rounded-xl p-4 shadow-sm border border-amber-100">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
            <span className="w-5 h-5 bg-amber-200 rounded flex items-center justify-center text-[10px]">📁</span>
            Categories
          </h3>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {(stats.serviceTypeBreakdown || []).map((st: any) => (
              <div key={st.serviceType} onClick={() => navigate(`/vendors?service=${encodeURIComponent(st.serviceType)}`)}
                className="flex items-center justify-between cursor-pointer hover:bg-amber-50 rounded px-1.5 py-1 -mx-1 transition-colors">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{getCategoryIcon(st.serviceType)}</span>
                  <span className="text-[11px] text-gray-700 truncate max-w-[100px]">{st.serviceType.toLowerCase()}</span>
                </div>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{st.done}/{st.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gradient-to-b from-green-50 to-white rounded-xl p-4 shadow-sm border border-green-100">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
            <span className="w-5 h-5 bg-green-200 rounded flex items-center justify-center text-[10px]">🔔</span>
            Recent Activity
          </h3>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {(stats.recentActivity || []).length > 0 ? (
              stats.recentActivity.slice(0, 6).map((activity: any, i: number) => (
                <div key={i} className="border-l-2 border-green-300 pl-2 py-0.5">
                  <div className="text-[11px] font-medium text-gray-800 truncate">{activity.vendorName}</div>
                  <div className="text-[10px] text-gray-400">
                    {activity.poNumber && <span>PO: {activity.poNumber}</span>}
                    {activity.serviceType && <span className="text-blue-500 ml-1">{activity.serviceType.toLowerCase()}</span>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-gray-400 text-center py-4">No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* Bills Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <span>📋</span> Bills — {monthLabel}
          </h3>
          <input
            type="text"
            placeholder="🔍 Search vendor..."
            value={billSearch}
            onChange={(e) => setBillSearch(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-[#4fc3f7] outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Vendor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Inv Date</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Total (₹)</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Payment Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bills.filter((b: any) => !billSearch || (b.vendor_name || '').toLowerCase().includes(billSearch.toLowerCase())).map((bill: any) => {
                const isPaid = bill.payment_status === 'paid';
                return (
                  <tr key={bill.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-gray-800 font-medium">
                      <Link to={`/bill/${bill.id}`} className="hover:text-blue-600 transition-colors">
                        {bill.vendor_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{bill.service_type || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{bill.invoice_date || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">
                      ₹{Number(bill.invoice_value || bill.basic_value || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1 font-medium ${
                        isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {isPaid ? '✓ Paid' : '○ Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{bill.payment_date || '—'}</td>
                  </tr>
                );
              })}
              {bills.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <span className="text-3xl block mb-2">📋</span>
                    No bills generated for {monthLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatLakh(amount: number): string {
  if (amount >= 10000000) return (amount / 10000000).toFixed(1) + 'Cr';
  if (amount >= 100000) return (amount / 100000).toFixed(1) + 'L';
  if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
  return amount.toLocaleString('en-IN');
}

function getCategoryIcon(serviceType: string): string {
  const s = serviceType.toLowerCase();
  if (s.includes('bus')) return '🚌';
  if (s.includes('bolero') || s.includes('scorpio')) return '🚗';
  if (s.includes('camper')) return '🚐';
  if (s.includes('crane')) return '🏗️';
  if (s.includes('hydra') || s.includes('palfinger')) return '⚙️';
  if (s.includes('food') || s.includes('hotel') || s.includes('catering')) return '🍽️';
  if (s.includes('house keeping')) return '🧹';
  if (s.includes('rent') || s.includes('guest house')) return '🏠';
  if (s.includes('cmms') || s.includes('it') || s.includes('computer')) return '💻';
  if (s.includes('pipeline')) return '🔧';
  if (s.includes('tipper') || s.includes('dozz') || s.includes('bob cat')) return '🚜';
  if (s.includes('forklift') || s.includes('trailor')) return '🔩';
  if (s.includes('manpower') || s.includes('labour')) return '👷';
  if (s.includes('tools')) return '🛠️';
  if (s.includes('printing') || s.includes('supplies')) return '🖨️';
  if (s.includes('scientific') || s.includes('calibration') || s.includes('engineering')) return '📐';
  if (s.includes('electricity')) return '⚡';
  return '📦';
}
