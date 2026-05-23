import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function BillDetailPage() {
  const { billingRecordId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    api.get(`/billing/bill/${billingRecordId}`).then((r) => {
      setData(r.data);
      setEditForm({
        paymentStatus: r.data.record?.payment_status || 'pending',
        utrDetails: r.data.record?.utr_details || '',
        paymentDate: r.data.record?.payment_date || '',
        paidAmount: r.data.record?.paid_amount || '',
        deductionAmount: r.data.record?.deduction_amount || 0,
        remarks: r.data.record?.remarks || '',
      });
    }).catch(console.error);
  }, [billingRecordId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/billing/update-bill/${billingRecordId}`, editForm);
      const res = await api.get(`/billing/bill/${billingRecordId}`);
      setData(res.data);
      setEditing(false);
      alert('✅ Bill updated successfully!');
    } catch (err: any) {
      alert('❌ Update failed: ' + (err.response?.data?.error || err.message));
    }
    setSaving(false);
  };

  const generateWCR = () => {
    const wcrHtml = `<html><head><title>WCR - ${vendor?.name}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px;max-width:800px;margin:30px auto}
      .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
      .title{text-align:center;font-size:14px;font-weight:bold;border:1px solid #000;padding:8px;margin-bottom:15px}
      table{width:100%;border-collapse:collapse}
      td,th{border:1px solid #000;padding:6px 8px}
      .info-table td{border:none;padding:4px 0}
      .sig-table td{text-align:center;padding:15px 5px;vertical-align:bottom}
      .field{border-bottom:1px solid #000;min-width:200px;display:inline-block}
      </style></head><body>
      <div class="header"><div><strong>Hofincons</strong></div><div><strong>Bluspring</strong><br/><small>QHSE-AC-F-0002-5 Rev=4</small></div></div>
      <div class="title">SUPPLY AND SERVICE - WORK COMPLETION REPORT & INVOICE CERTIFICATION</div>
      <table class="info-table" style="margin-bottom:15px">
        <tr><td><strong>Date of Report:</strong> ${new Date().toLocaleDateString('en-IN')}</td></tr>
        <tr><td><strong>Site Name:</strong> UAIL, REFINERY</td></tr>
        <tr><td><strong>Location:</strong> TIKIRI, RAYAGADA, ODISHA</td></tr>
        <tr><td><strong>Client Name:</strong> UAIL</td></tr>
      </table>
      <table style="margin-bottom:15px">
        <tr><td><strong>Vendor Name:</strong> ${vendor?.name || ''}</td><td><strong>PO Number:</strong> ${po?.po_number || ''}</td><td><strong>PO Date:</strong> ${po?.order_date || po?.po_date || ''}</td></tr>
        <tr><td colspan="3"><strong>Invoice Reference & Date:</strong> ${invoice?.invoice_number || ''} & ${invoice?.invoice_date || ''}</td></tr>
        <tr><td><strong>Invoice value incl GST:</strong> ₹${Number(invoice?.invoice_value || 0).toLocaleString('en-IN')}</td><td colspan="2">(Rupees: ${numToWordsSimple(Number(invoice?.invoice_value || 0))})</td></tr>
      </table>
      <table style="margin-bottom:15px">
        <tr><td><strong>Delivery / Work completion summary:</strong><br/>Hired Charges Over Time ${invoice?.service_type || vendor?.service_type || ''} Service Of Refinery/Power Site for the month of ${period}</td></tr>
      </table>
      <table style="margin-bottom:15px">
        <tr><td><strong>Documents Enclosed:</strong><br/>1- Work Completion Report<br/>2- Invoice<br/>3- Log Sheet / Supporting Documents</td></tr>
      </table>
      <table style="margin-bottom:20px">
        <tr><td><strong>Mode of delivery:</strong></td><td>Direct Delivery ☐</td><td>Service at site ☑</td><td>Courier / Transport ☐</td></tr>
      </table>
      <table class="sig-table">
        <tr><th>Signature</th><th></th><th></th><th></th><th></th><th></th></tr>
        <tr><td>___________</td><td>___________</td><td>___________</td><td>___________</td><td>___________</td><td>___________</td></tr>
        <tr><td><strong>Name</strong></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td><strong>Designation</strong></td><td><strong>Initiator</strong></td><td><strong>Verified By</strong></td><td><strong>User- Dept Head</strong></td><td><strong>Stores Incharge</strong></td><td><strong>Site Manager</strong></td></tr>
      </table>
      </body></html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(wcrHtml); printWindow.document.close(); setTimeout(() => printWindow.print(), 500); }
  };

  if (!data) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-4xl animate-pulse">🧾</div>
    </div>
  );

  const { record, vendor, po, logSheet, invoice, wcr } = data;
  const period = `${MONTHS[(record?.billing_period_month || 1) - 1]}'${record?.billing_period_year}`;
  const isPaid = (editing ? editForm.paymentStatus : record?.payment_status) === 'paid';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/vendors/${vendor?.id}?tab=bills`)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            ← Back to Bills
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{invoice?.invoice_number || `Bill #${record?.id}`}</h1>
            <p className="text-sm text-gray-500">{vendor?.name} • {invoice?.service_type || vendor?.service_type} • {period}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!editing ? (<>
            <button onClick={() => setEditing(true)} className="px-4 py-2 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium hover:bg-[#3bb5e8]">
              ✏️ Edit Bill
            </button>
            <button onClick={() => generateWCR()} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
              📋 Generate WCR
            </button>
          </>) : (
            <>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? '⏳ Saving...' : '💾 Save Changes'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div className={`rounded-xl p-4 mb-6 flex items-center justify-between ${isPaid ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200' : 'bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200'}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{isPaid ? '✅' : '⏳'}</span>
          <div>
            <span className={`text-lg font-bold ${isPaid ? 'text-green-700' : 'text-orange-700'}`}>
              {isPaid ? 'Payment Done' : 'Payment Pending'}
            </span>
            {record?.utr_details && <p className="text-xs text-gray-500 mt-0.5">UTR: {record.utr_details}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-800">₹{Number(invoice?.invoice_value || record?.paid_amount || 0).toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-500">Invoice Value</div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Invoice Details Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">🧾 Invoice Details</h3>
          <div className="space-y-3 text-sm">
            <InfoRow label="Invoice #" value={invoice?.invoice_number || '—'} />
            <InfoRow label="Invoice Date" value={invoice?.invoice_date || '—'} />
            <InfoRow label="Receipt Date" value={invoice?.invoice_receipt_date || '—'} />
            <InfoRow label="Service" value={invoice?.service_type || '—'} />
            <InfoRow label="Period" value={period} />
            <div className="border-t pt-3 mt-3 space-y-2">
              <InfoRow label="Basic Value" value={`₹${Number(invoice?.basic_value || 0).toLocaleString('en-IN')}`} bold />
              <InfoRow label={`GST (${Number(invoice?.gst_percentage || 0).toFixed(0)}%)`} value={`₹${Number(invoice?.gst_amount || 0).toLocaleString('en-IN')}`} />
              <div className="flex justify-between items-center bg-blue-50 rounded-lg px-3 py-2">
                <span className="font-bold text-blue-800">Total</span>
                <span className="font-bold text-blue-800 text-lg">₹{Number(invoice?.invoice_value || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment & Status Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">💰 Payment Info</h3>
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payment Status</label>
                <select value={editForm.paymentStatus} onChange={(e) => setEditForm({...editForm, paymentStatus: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm">
                  <option value="pending">⏳ Pending</option>
                  <option value="paid">✅ Paid</option>
                  <option value="partial">🔄 Partial</option>
                  <option value="hold">⛔ On Hold</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">UTR / Transaction Details</label>
                <input type="text" value={editForm.utrDetails} onChange={(e) => setEditForm({...editForm, utrDetails: e.target.value})}
                  placeholder="e.g. YESIG60920348152" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Payment Date</label>
                <input type="date" value={editForm.paymentDate} onChange={(e) => setEditForm({...editForm, paymentDate: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Paid Amount (₹)</label>
                <input type="number" value={editForm.paidAmount} onChange={(e) => setEditForm({...editForm, paidAmount: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Deduction (₹)</label>
                <input type="number" value={editForm.deductionAmount} onChange={(e) => setEditForm({...editForm, deductionAmount: e.target.value})}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Remarks</label>
                <textarea value={editForm.remarks} onChange={(e) => setEditForm({...editForm, remarks: e.target.value})}
                  rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <InfoRow label="Status" value={record?.payment_status === 'paid' ? '✅ Paid' : record?.payment_status === 'partial' ? '🔄 Partial' : '⏳ Pending'} />
              <InfoRow label="UTR" value={record?.utr_details || '—'} mono />
              <InfoRow label="Payment Date" value={record?.payment_date || '—'} />
              <InfoRow label="Paid Amount" value={record?.paid_amount ? `₹${Number(record.paid_amount).toLocaleString('en-IN')}` : '—'} bold />
              <InfoRow label="Deduction" value={record?.deduction_amount > 0 ? `₹${Number(record.deduction_amount).toLocaleString('en-IN')}` : '₹0'} />
              <InfoRow label="Remarks" value={record?.remarks || '—'} />
            </div>
          )}
        </div>

        {/* PO & Vendor Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">📋 PO & Vendor</h3>
          <div className="space-y-3 text-sm">
            <InfoRow label="Vendor" value={vendor?.name || '—'} bold />
            <InfoRow label="Vendor Code" value={vendor?.vendor_code || '—'} mono />
            <InfoRow label="GSTIN" value={vendor?.gstin || '—'} mono />
            {po && (<>
              <div className="border-t pt-3 mt-3"></div>
              <InfoRow label="PO Number" value={po.po_number || '—'} mono />
              <InfoRow label="PO Value" value={`₹${Number(po.po_value || 0).toLocaleString('en-IN')}`} />
              <InfoRow label="PO Date" value={po.order_date || po.po_date || '—'} />
              <InfoRow label="Validity" value={po.validity_date || po.service_end_date || '—'} />
            </>)}
            {vendor?.id && (
              <button onClick={() => navigate(`/vendors/${vendor.id}`)} className="mt-3 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-[#4fc3f7] font-medium hover:bg-blue-50">
                View Vendor Account →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Line Items */}
      {invoice?.lineItems?.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mt-5">
          <h3 className="font-semibold text-gray-700 mb-4">📊 Invoice Line Items</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Description</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">HSN/SAC</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Qty</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Unit</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Rate (₹)</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.lineItems.map((li: any) => (
                <tr key={li.id} className="hover:bg-blue-50/30">
                  <td className="px-4 py-2.5 text-gray-400">{li.sr_no}</td>
                  <td className="px-4 py-2.5 text-gray-800">{li.description}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500">{li.hsn_sac || '—'}</td>
                  <td className="px-4 py-2.5 text-center">{li.quantity || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-xs text-gray-500">{li.unit || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{li.unit_price ? Number(li.unit_price).toLocaleString('en-IN') : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium">₹{Number(li.amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Sheet */}
      {logSheet && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mt-5">
          <h3 className="font-semibold text-gray-700 mb-4">📊 Log Sheet</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <MiniCard label="Period" value={`${logSheet.period_start} → ${logSheet.period_end}`} />
            <MiniCard label="Vehicle" value={logSheet.vehicle_number || '—'} />
            <MiniCard label="Total KM" value={`${logSheet.total_mileage_km || 0} KM`} />
            <MiniCard label="Days" value={String(logSheet.total_days || 0)} />
          </div>
        </div>
      )}

      {/* Payment Timeline */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mt-5">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">⏱️ Payment Timeline</h3>
        <div className="flex items-center gap-0">
          {[
            { label: 'Invoice Raised', date: invoice?.invoice_date, done: !!invoice?.invoice_date, icon: '🧾' },
            { label: 'Invoice Received', date: invoice?.invoice_receipt_date, done: !!invoice?.invoice_receipt_date, icon: '📥' },
            { label: 'WCR Created', date: record?.status === 'wcr_done' || record?.status === 'completed' || record?.status === 'finalized' ? '✓' : '', done: record?.status === 'wcr_done' || record?.status === 'completed' || record?.status === 'finalized', icon: '📋' },
            { label: 'Payment Done', date: record?.payment_date, done: record?.payment_status === 'paid', icon: '💰' },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${step.done ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100 border-2 border-gray-300'}`}>
                  {step.icon}
                </div>
                <span className={`text-[10px] mt-1 font-medium ${step.done ? 'text-green-700' : 'text-gray-400'}`}>{step.label}</span>
                <span className="text-[9px] text-gray-400">{step.date || '—'}</span>
              </div>
              {i < arr.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${step.done ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        {record?.payment_status === 'paid' && record?.utr_details && (
          <div className="mt-3 bg-green-50 rounded-lg px-3 py-2 text-xs text-green-700">
            ✅ Paid via <span className="font-mono font-medium">{record.utr_details}</span> on {record.payment_date || '—'}
          </div>
        )}
        {record?.payment_status !== 'paid' && invoice?.invoice_date && (
          <div className="mt-3 bg-orange-50 rounded-lg px-3 py-2 text-xs text-orange-700">
            ⏳ Pending — Invoice raised {Math.ceil((Date.now() - new Date(invoice.invoice_date).getTime()) / 86400000)} days ago
          </div>
        )}
      </div>
    </div>
  );
}

function numToWordsSimple(n: number): string {
  if (n === 0) return 'Zero Only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const rupees = Math.floor(n);
  const parts: string[] = [];
  let r = rupees;
  if (r >= 10000000) { parts.push(ones[Math.floor(r/10000000)] + ' Crore'); r %= 10000000; }
  if (r >= 100000) { const l = Math.floor(r/100000); parts.push((l < 20 ? ones[l] : tens[Math.floor(l/10)] + ' ' + ones[l%10]).trim() + ' Lakh'); r %= 100000; }
  if (r >= 1000) { const t = Math.floor(r/1000); parts.push((t < 20 ? ones[t] : tens[Math.floor(t/10)] + ' ' + ones[t%10]).trim() + ' Thousand'); r %= 1000; }
  if (r >= 100) { parts.push(ones[Math.floor(r/100)] + ' Hundred'); r %= 100; }
  if (r > 0) { parts.push(r < 20 ? ones[r] : (tens[Math.floor(r/10)] + ' ' + ones[r%10]).trim()); }
  return 'Rupees ' + parts.join(' ') + ' Only';
}

function InfoRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-800 ${bold ? 'font-bold' : ''} ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-sm font-medium text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}
