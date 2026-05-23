import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

// ============================================================
// SERVICE CATEGORIES
// ============================================================
type ServiceCategory = 'bus' | 'vehicle' | 'camper_fixed' | 'crane' | 'palfinger_hydra' | 'food' | 'housekeeping' | 'rent' | 'guest_electricity' | 'it_cmms' | 'manpower_shutdown' | 'consultancy' | 'other';

function classifyService(serviceType: string): ServiceCategory {
  const s = serviceType.toLowerCase();
  if (s.includes('bus')) return 'bus';
  if (s.includes('bolero') || s.includes('scorpio') || s.includes('bob cat') || s.includes('tipper') || s.includes('dozzer')) return 'vehicle';
  if (s.includes('camper')) return 'camper_fixed';
  if (s.includes('crane')) return 'crane';
  if (s.includes('hydra') || s.includes('palfinger') || s.includes('forklift') || s.includes('trailor')) return 'palfinger_hydra';
  if (s.includes('food') || s.includes('catering')) return 'food';
  if (s.includes('house keeping') || s.includes('housekeeping')) return 'housekeeping';
  if (s.includes('house rent') || s.includes('guest house rent')) return 'rent';
  if (s.includes('electricity')) return 'guest_electricity';
  if (s.includes('cmms') || s.includes('it') || s.includes('computer')) return 'it_cmms';
  if (s.includes('manpower') || s.includes('labour')) return 'manpower_shutdown';
  if (s.includes('consult') || s.includes('scientific') || s.includes('calibration')) return 'consultancy';
  return 'other';
}

function getCategoryFormula(cat: ServiceCategory): string {
  switch (cat) {
    case 'bus': case 'vehicle': return 'Monthly Fixed + [(Closing KM - Starting KM) ÷ Mileage × Diesel Rate] - Penalty';
    case 'camper_fixed': return 'Monthly Contract Value (All-inclusive) - Penalty';
    case 'crane': return 'Monthly Fixed + (Working Hours × Diesel/Hr × Diesel Rate) - Penalty';
    case 'palfinger_hydra': return 'Monthly Fixed + (Op Hours × Diesel/OpHr × Price) + (Movement KM ÷ Mileage × Price) - Penalty';
    case 'food': return '(Breakfast + Lunch + Snacks + Dinner) × Rate/meal - Penalty';
    case 'housekeeping': return '(Mandays × Rate) + (Supervisor × Rate) + Allowance - Penalty';
    case 'rent': return 'Fixed Monthly Rent - Penalty';
    case 'it_cmms': return 'Months × Rate/Month - Penalty';
    default: return 'Service Charges - Penalty';
  }
}

function getCategoryIcon(cat: ServiceCategory): string {
  const icons: Record<string, string> = { bus: '🚌', vehicle: '🚗', camper_fixed: '🚐', crane: '🏗️', palfinger_hydra: '⚙️', food: '🍽️', housekeeping: '🧹', rent: '🏠', guest_electricity: '⚡', it_cmms: '💻', manpower_shutdown: '👷', consultancy: '📐', other: '📦' };
  return icons[cat] || '📦';
}

function numToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scales = ['','Thousand','Lakh','Crore'];
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let words = '';
  if (rupees === 0) { words = 'Zero'; }
  else {
    const parts: number[] = [];
    let r = rupees;
    parts.push(r % 1000); r = Math.floor(r / 1000);
    while (r > 0) { parts.push(r % 100); r = Math.floor(r / 100); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p === 0) continue;
      let w = '';
      if (p >= 100) { w += ones[Math.floor(p / 100)] + ' Hundred '; const rem = p % 100; if (rem > 0) { if (rem < 20) w += ones[rem]; else w += tens[Math.floor(rem / 10)] + ' ' + ones[rem % 10]; } }
      else if (p < 20) { w = ones[p]; }
      else { w = tens[Math.floor(p / 10)] + ' ' + ones[p % 10]; }
      words += w.trim() + ' ' + scales[i] + ' ';
    }
  }
  let result = 'Rupees ' + words.trim();
  if (paise > 0) { result += ' and ' + (paise < 20 ? ones[paise] : tens[Math.floor(paise / 10)] + ' ' + ones[paise % 10]).trim() + ' Paise'; }
  return '(' + result + ' Only)';
}


// ============================================================
// CALCULATION ENGINE
// ============================================================
interface CalcResult {
  lineItems: { description: string; hsnSac: string; qty: number; uom: string; rate: number; amount: number }[];
  taxableValue: number; cgst: number; sgst: number; igst: number; grandTotal: number;
  dieselLiters: number; dieselCost: number;
  steps: string[];
}

function calculateBill(category: ServiceCategory, p: any): CalcResult {
  const gstPct = p.gstType === 'CGST_SGST_FOOD' ? 2.5 : p.gstType === 'NO_GST' ? 0 : 9;
  const isIGST = p.gstType === 'IGST';
  let lineItems: any[] = [];
  let taxableValue = 0, dieselLiters = 0, dieselCost = 0;
  const steps: string[] = [];

  switch (category) {
    case 'bus': case 'vehicle': {
      const mileage = p.mileage || (category === 'bus' ? 3.5 : 10);
      const totalKM = p.totalKM || 0;
      dieselLiters = mileage > 0 ? totalKM / mileage : 0;
      dieselCost = dieselLiters * (p.dieselPrice || 0);
      const hire = p.monthlyHire || 0;
      const penalty = p.penalty || 0;
      steps.push(`Step 1: Total KM = ${p.endKM || 0} - ${p.startKM || 0} = ${totalKM.toLocaleString('en-IN')} KM`);
      steps.push(`Step 2: Diesel Litres = ${totalKM.toLocaleString('en-IN')} ÷ ${mileage} = ${dieselLiters.toFixed(2)} Ltr`);
      steps.push(`Step 3: Diesel Cost = ${dieselLiters.toFixed(2)} × ₹${p.dieselPrice || 0} = ₹${dieselCost.toLocaleString('en-IN', {maximumFractionDigits:2})}`);
      steps.push(`Step 4: Monthly Fixed = ₹${hire.toLocaleString('en-IN')}`);
      taxableValue = hire + dieselCost - penalty;
      steps.push(`Step 5: Total = ₹${hire.toLocaleString('en-IN')} + ₹${dieselCost.toLocaleString('en-IN',{maximumFractionDigits:2})} = ₹${taxableValue.toLocaleString('en-IN',{maximumFractionDigits:2})}`);
      lineItems = [
        { description: `Monthly Hired Charges - ${category === 'bus' ? 'Bus' : 'Vehicle'} service (${p.seatingCapacity || ''})`, hsnSac: '996601', qty: 1, uom: 'Month', rate: hire, amount: hire },
        { description: `Diesel Cost — Starting ${(p.startKM||0).toLocaleString('en-IN')} → Closing ${(p.endKM||0).toLocaleString('en-IN')} = ${totalKM.toLocaleString('en-IN')} KM ÷ ${mileage} = ${dieselLiters.toFixed(2)} Ltr × ₹${p.dieselPrice||0}`, hsnSac: '840999', qty: Math.round(dieselLiters), uom: 'Ltr', rate: p.dieselPrice || 0, amount: dieselCost },
      ];
      if (penalty > 0) lineItems.push({ description: 'Less: Penalty/Deduction', hsnSac: '', qty: 1, uom: 'LS', rate: -penalty, amount: -penalty });
      break;
    }
    case 'camper_fixed': {
      const hire = p.monthlyHire || 0; const penalty = p.penalty || 0;
      taxableValue = hire - penalty;
      lineItems = [{ description: 'Monthly Contract Value (All-inclusive)', hsnSac: '996601', qty: 1, uom: 'Month', rate: hire, amount: hire }];
      if (penalty > 0) lineItems.push({ description: 'Less: Penalty', hsnSac: '', qty: 1, uom: 'LS', rate: -penalty, amount: -penalty });
      steps.push(`Total = ₹${hire.toLocaleString('en-IN')} - ₹${penalty.toLocaleString('en-IN')} = ₹${taxableValue.toLocaleString('en-IN')}`);
      break;
    }
    case 'crane': {
      const hire = p.monthlyHire || 0; const hours = p.totalHours || 0; const dph = p.dieselPerHour || 6;
      dieselLiters = hours * dph; dieselCost = dieselLiters * (p.dieselPrice || 0);
      const penalty = p.penalty || 0; taxableValue = hire + dieselCost - penalty;
      lineItems = [
        { description: 'Monthly Hire Charges', hsnSac: '997313', qty: 1, uom: 'Month', rate: hire, amount: hire },
        { description: `Diesel (${hours} hrs × ${dph} Ltr/hr)`, hsnSac: '840999', qty: Math.round(dieselLiters), uom: 'Ltr', rate: p.dieselPrice || 0, amount: dieselCost },
      ];
      if (penalty > 0) lineItems.push({ description: 'Less: Penalty', hsnSac: '', qty: 1, uom: 'LS', rate: -penalty, amount: -penalty });
      steps.push(`Diesel = ${hours} × ${dph} = ${dieselLiters} Ltr × ₹${p.dieselPrice||0} = ₹${dieselCost.toLocaleString('en-IN')}`);
      steps.push(`Total = ₹${hire.toLocaleString('en-IN')} + ₹${dieselCost.toLocaleString('en-IN')} = ₹${taxableValue.toLocaleString('en-IN')}`);
      break;
    }
    case 'palfinger_hydra': {
      const hire = p.monthlyHire || 0; const opH = p.operatingHours || 0; const dpo = p.dieselPerOpHour || 5;
      const opL = opH * dpo; const opC = opL * (p.dieselPrice || 0);
      const movKM = p.vehicleMovementKM || 0; const movM = p.vehicleMovementMileage || 3;
      const movL = movM > 0 ? movKM / movM : 0; const movC = movL * (p.dieselPrice || 0);
      dieselLiters = opL + movL; dieselCost = opC + movC;
      const penalty = p.penalty || 0; taxableValue = hire + dieselCost - penalty;
      lineItems = [
        { description: 'Monthly Hire', hsnSac: '997313', qty: 1, uom: 'Month', rate: hire, amount: hire },
        { description: `Operating Diesel (${opH}hrs × ${dpo}Ltr/hr)`, hsnSac: '840999', qty: Math.round(opL), uom: 'Ltr', rate: p.dieselPrice||0, amount: opC },
        { description: `Movement Diesel (${movKM}KM ÷ ${movM})`, hsnSac: '840999', qty: Math.round(movL), uom: 'Ltr', rate: p.dieselPrice||0, amount: movC },
      ];
      if (penalty > 0) lineItems.push({ description: 'Less: Penalty', hsnSac: '', qty: 1, uom: 'LS', rate: -penalty, amount: -penalty });
      steps.push(`Total = ₹${hire.toLocaleString('en-IN')} + ₹${dieselCost.toLocaleString('en-IN',{maximumFractionDigits:2})} = ₹${taxableValue.toLocaleString('en-IN',{maximumFractionDigits:2})}`);
      break;
    }
    case 'food': {
      const rate = p.mealRate || 65; const b = p.totalBreakfast||0; const l = p.totalLunch||0; const s2 = p.totalSnacks||0; const d = p.totalDinner||0;
      const penalty = p.penalty || 0; taxableValue = (b+l+s2+d)*rate - penalty;
      if (b>0) lineItems.push({ description:'Breakfast', hsnSac:'996339', qty:b, uom:'Plate', rate, amount:b*rate });
      if (l>0) lineItems.push({ description:'Lunch', hsnSac:'996339', qty:l, uom:'Plate', rate, amount:l*rate });
      if (s2>0) lineItems.push({ description:'Snacks', hsnSac:'996339', qty:s2, uom:'Plate', rate, amount:s2*rate });
      if (d>0) lineItems.push({ description:'Dinner', hsnSac:'996339', qty:d, uom:'Plate', rate, amount:d*rate });
      if (penalty>0) lineItems.push({ description:'Less: Penalty', hsnSac:'', qty:1, uom:'LS', rate:-penalty, amount:-penalty });
      steps.push(`Total meals = ${b+l+s2+d} × ₹${rate} = ₹${((b+l+s2+d)*rate).toLocaleString('en-IN')}`);
      break;
    }
    case 'housekeeping': {
      const md = p.totalMandays||0; const r2 = p.ratePerManday||880; const penalty = p.penalty||0;
      taxableValue = md*r2 - penalty;
      lineItems = [{ description:'Worker Mandays', hsnSac:'998511', qty:md, uom:'Days', rate:r2, amount:md*r2 }];
      if (penalty>0) lineItems.push({ description:'Less: Penalty', hsnSac:'', qty:1, uom:'LS', rate:-penalty, amount:-penalty });
      steps.push(`Total = ${md} × ₹${r2} = ₹${(md*r2).toLocaleString('en-IN')}`);
      break;
    }
    case 'rent': {
      const rent = p.monthlyRent||0; const penalty = p.penalty||0; taxableValue = rent - penalty;
      lineItems = [{ description:'Monthly House Rent', hsnSac:'997212', qty:1, uom:'Month', rate:rent, amount:rent }];
      if (penalty>0) lineItems.push({ description:'Less: Penalty', hsnSac:'', qty:1, uom:'LS', rate:-penalty, amount:-penalty });
      steps.push(`Total = ₹${rent.toLocaleString('en-IN')}`);
      break;
    }
    case 'it_cmms': {
      const m = p.serviceMonths||1; const r2 = p.ratePerMonth||27500; const penalty = p.penalty||0;
      taxableValue = m*r2 - penalty;
      lineItems = [{ description:'IT/CMMS Service', hsnSac:'998314', qty:m, uom:'Month', rate:r2, amount:m*r2 }];
      if (penalty>0) lineItems.push({ description:'Less: Penalty', hsnSac:'', qty:1, uom:'LS', rate:-penalty, amount:-penalty });
      steps.push(`Total = ${m} × ₹${r2.toLocaleString('en-IN')} = ₹${(m*r2).toLocaleString('en-IN')}`);
      break;
    }
    default: {
      const ch = p.serviceCharges||0; const penalty = p.penalty||0; taxableValue = ch - penalty;
      lineItems = [{ description:'Service Charges', hsnSac:'998511', qty:1, uom:'LS', rate:ch, amount:ch }];
      if (penalty>0) lineItems.push({ description:'Less: Penalty', hsnSac:'', qty:1, uom:'LS', rate:-penalty, amount:-penalty });
      steps.push(`Total = ₹${ch.toLocaleString('en-IN')}`);
      break;
    }
  }
  const cgst = isIGST ? 0 : taxableValue * gstPct / 100;
  const sgst = isIGST ? 0 : taxableValue * gstPct / 100;
  const igst = isIGST ? taxableValue * gstPct * 2 / 100 : 0;
  const grandTotal = taxableValue + cgst + sgst + igst;
  if (p.totalKM > (p.agreementKM || Infinity) && p.agreementKM) steps.push(`⚠️ Total KM (${p.totalKM.toLocaleString('en-IN')}) exceeds Agreement (${p.agreementKM.toLocaleString('en-IN')}) — No extra charges as per PO terms`);
  return { lineItems, taxableValue, cgst, sgst, igst, grandTotal, dieselLiters, dieselCost, steps };
}


// ============================================================
// MAIN COMPONENT
// ============================================================
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TaxInvoicePage() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(vendorId ? -1 : 0); // -1 = loading vendor from URL
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingBill, setSavingBill] = useState(false);
  const [params, setParams] = useState<any>({
    billingMonth: `${MONTHS[new Date().getMonth()]}'${new Date().getFullYear()}`,
    invoiceSerial: '', invoiceDate: new Date().toISOString().split('T')[0],
    gstType: 'CGST_SGST', vendorGstin: '', vendorAddress: '', vendorPan: '',
    monthlyHire: 0, mileage: 0, dieselPrice: 0, totalKM: 0, startKM: 0, endKM: 0,
    seatingCapacity: '', vehicleRegNo: '', agreementKM: 0, penalty: 0, poQuantity: 1, maxDieselQty: 0,
    totalHours: 0, dieselPerHour: 6, operatingHours: 0, dieselPerOpHour: 5,
    vehicleMovementKM: 0, vehicleMovementMileage: 3,
    mealRate: 65, totalBreakfast: 0, totalLunch: 0, totalSnacks: 0, totalDinner: 0,
    totalMandays: 0, ratePerManday: 880, workerCount: 0, supervisorMandays: 0, supervisorRate: 950,
    monthlyRent: 0, serviceMonths: 1, ratePerMonth: 27500, serviceCharges: 0,
  });

  useEffect(() => { api.get('/vendors').then(r => setVendors(r.data)); }, []);

  // Auto-load vendor from URL param (when coming from Vendor Detail page)
  useEffect(() => {
    if (vendorId) {
      loadVendorDetails(Number(vendorId)).then(() => {
        setStep(0); // Show service selection (Step 0 but vendor already selected)
      });
    }
  }, [vendorId]);

  const category = selectedService ? classifyService(selectedService.serviceType) : 'other';
  const calc = useMemo(() => calculateBill(category, params), [category, params]);

  // Auto-fill parameters when service selection changes
  useEffect(() => {
    if (selectedService && selectedVendor) {
      autoFillFromService(selectedService);
    }
  }, [selectedService?.id]);

  const loadVendorDetails = async (vendorId: number) => {
    const res = await api.get(`/vendors/${vendorId}`);
    setSelectedVendor(res.data);
    // Auto-fill from PO data — vendor identity
    let poInfo: any = {};
    if (res.data.purchaseOrders?.length > 0) {
      for (const po of res.data.purchaseOrders) {
        if (po.extracted_raw_json) {
          try { const raw = JSON.parse(po.extracted_raw_json);
            if (raw.vendorGstin) poInfo.vendorGstin = raw.vendorGstin;
            if (raw.vendorPan) poInfo.vendorPan = raw.vendorPan;
            if (raw.supplierAddress) poInfo.vendorAddress = raw.supplierAddress;
          } catch {}
        }
      }
    }
    setParams((prev: any) => ({
      ...prev,
      vendorGstin: poInfo.vendorGstin || res.data.gstin || '',
      vendorAddress: poInfo.vendorAddress || '',
      vendorPan: poInfo.vendorPan || res.data.pan || '',
      // Auto-detect GST type from state code
      gstType: (res.data.state_code && res.data.state_code !== '21') ? 'IGST' : 'CGST_SGST',
    }));
  };

  // Auto-fill parameters when a service is selected
  const autoFillFromService = (service: any) => {
    if (!selectedVendor || !service) return;

    const poNumber = service.poNumber;
    const itemCode = service.itemCode;
    let autoParams: any = {};

    // Find the PO mapped to this service
    const matchedPO = selectedVendor.purchaseOrders?.find((po: any) => po.po_number === poNumber);

    if (matchedPO) {
      let raw: any = null;
      try { raw = JSON.parse(matchedPO.extracted_raw_json || '{}'); } catch {}

      // === USE NEW STRUCTURED FIELDS (autoFetchable) ===
      if (raw?.autoFetchable) {
        const af = raw.autoFetchable;
        // Unit rate = monthly hire charge
        if (af.unitRate > 0) autoParams.monthlyHire = af.unitRate;
        // Diesel rate from PO (fixed ₹95/litre standard)
        if (af.dieselRate > 0) autoParams.dieselPrice = af.dieselRate;
        // GST type from PO
        if (af.gstType) autoParams.gstType = af.gstType;
        // Max PO qty for agreement tracking
        if (af.maxPoQty > 0) autoParams.agreementKM = af.maxPoQty;
      }

      // === USE dieselRate directly ===
      if (raw?.dieselRate > 0 && !autoParams.dieselPrice) {
        autoParams.dieselPrice = raw.dieselRate;
      }

      // === Extract diesel price and max qty from dieselItems ===
      if (raw?.dieselItems?.length > 0) {
        const dieselItem = raw.dieselItems[0];
        if (dieselItem.unitRate > 0 && !autoParams.dieselPrice) {
          autoParams.dieselPrice = dieselItem.unitRate;
        }
        if (dieselItem.quantity > 0) {
          autoParams.maxDieselQty = dieselItem.quantity;
        }
      }
      // Fallback: check all lineItems for diesel item codes
      if (!autoParams.dieselPrice && raw?.lineItems?.length > 0) {
        const dieselLI = raw.lineItems.find((li: any) => {
          const code = li.itemCode || li.item_code || '';
          return code === '9000448' || code === '9000054' || (li.itemDescription || '').toLowerCase().includes('diesel');
        });
        if (dieselLI) {
          if (dieselLI.unitRate > 0) autoParams.dieselPrice = dieselLI.unitRate;
          if (dieselLI.quantity > 0) autoParams.maxDieselQty = dieselLI.quantity;
        }
      }

      // === USE gstType directly ===
      if (raw?.gstType && !autoParams.gstType) {
        autoParams.gstType = raw.gstType;
      }

      // === USE hireItems for unit rate ===
      if (raw?.hireItems?.length > 0 && !autoParams.monthlyHire) {
        // Find the hire item matching this service's item code
        let hireItem = itemCode ? raw.hireItems.find((li: any) => li.itemCode === itemCode) : raw.hireItems[0];
        if (!hireItem) hireItem = raw.hireItems[0];
        if (hireItem?.unitRate > 0) autoParams.monthlyHire = hireItem.unitRate;
        if (hireItem?.quantity > 0) autoParams.poQuantity = hireItem.quantity;
      }

      // Find the specific line item for this service (by item code)
      let matchedLineItem: any = null;
      if (raw?.lineItems?.length > 0 && itemCode) {
        matchedLineItem = raw.lineItems.find((li: any) => (li.itemCode || li.item_code) === itemCode);
      }
      if (!matchedLineItem && raw?.hireItems?.length > 0) {
        matchedLineItem = raw.hireItems[0];
      }
      if (!matchedLineItem && raw?.lineItems?.length > 0) {
        matchedLineItem = raw.lineItems[0];
      }

      // Monthly Fixed Charges from PO line item unit rate (fallback)
      if (!autoParams.monthlyHire) {
        const unitRate = matchedLineItem?.unitRate || matchedLineItem?.unit_rate || Number(matchedPO.unit_rate) || 0;
        if (unitRate > 0) autoParams.monthlyHire = unitRate;
      }

      // If the matched item code is a diesel item (9000448/9000054), use the hire item instead
      if (itemCode && (itemCode === '9000448' || itemCode === '9000054' || (matchedLineItem?.itemDescription || '').toLowerCase().includes('diesel'))) {
        // This service is mapped to a diesel line item by mistake — use the hire item from same PO
        const hireItem = raw?.hireItems?.[0] || raw?.lineItems?.find((li: any) => {
          const code = li.itemCode || li.item_code || '';
          return code !== '9000448' && code !== '9000054' && !(li.itemDescription || '').toLowerCase().includes('diesel');
        });
        if (hireItem?.unitRate > 0) {
          autoParams.monthlyHire = hireItem.unitRate;
          if (hireItem.quantity > 0) autoParams.poQuantity = hireItem.quantity;
        }
      }

      // Set PO quantity if not already set
      if (!autoParams.poQuantity && matchedLineItem?.quantity > 0) {
        autoParams.poQuantity = matchedLineItem.quantity;
      }
      // Fallback: PO-level quantity
      if (!autoParams.poQuantity && Number(matchedPO.quantity) > 0) {
        autoParams.poQuantity = Number(matchedPO.quantity);
      }

      // For labour category: use unit rate as rate per manday
      if (raw?.serviceCategory === 'labour' || classifyService(service.serviceType) === 'housekeeping') {
        if (raw?.hireItems?.length > 0) {
          // First item = unskilled rate, second = supervisor rate
          const unskilledItem = raw.hireItems.find((li: any) => (li.itemDescription || '').toLowerCase().includes('unskilled') || (li.itemDescription || '').toLowerCase().includes('labour'));
          const supervisorItem = raw.hireItems.find((li: any) => (li.itemDescription || '').toLowerCase().includes('supervisor'));
          if (unskilledItem?.unitRate) autoParams.ratePerManday = unskilledItem.unitRate;
          if (supervisorItem?.unitRate) autoParams.supervisorRate = supervisorItem.unitRate;
        }
      }

      // For technology/subscription: use unit rate as rate per month
      if (raw?.serviceCategory === 'technology' || classifyService(service.serviceType) === 'it_cmms') {
        if (matchedLineItem?.unitRate > 0) autoParams.ratePerMonth = matchedLineItem.unitRate;
        if (matchedLineItem?.quantity > 0) autoParams.serviceMonths = matchedLineItem.quantity;
      }

      // Parse diesel terms and scope for vehicle-specific data
      const dieselTerms = (raw?.dieselTerms || '').toLowerCase();
      const scope = (raw?.scopeOfWork || '').toLowerCase();
      const fullText = dieselTerms + ' ' + scope + ' ' + (matchedLineItem?.itemDescription || '').toLowerCase();

      // Extract Diesel Mileage (KM/Ltr) from PO terms
      const mileageMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(?:km\s*\/\s*l(?:tr|iter)?|km\/l|kmpl|km per l)/i)
        || fullText.match(/mileage\s*[:\-]?\s*(\d+(?:\.\d+)?)/i)
        || fullText.match(/(\d+(?:\.\d+)?)\s*km\s*per\s*l/i);
      if (mileageMatch) {
        autoParams.mileage = parseFloat(mileageMatch[1]);
      }

      // Extract Agreement KM from PO
      const agrKmMatch = fullText.match(/(?:agreed|agreement|minimum|guaranteed)\s*(?:km|kilometer|kms?)\s*[:\-]?\s*(\d[\d,]*)/i)
        || fullText.match(/(\d[\d,]*)\s*(?:km|kms)\s*(?:per month|\/month|p\.m)/i);
      if (agrKmMatch) {
        autoParams.agreementKM = parseInt(agrKmMatch[1].replace(/,/g, ''));
      }

      // Extract Vehicle Reg No from PO description
      const regMatch = fullText.match(/([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4})/i)
        || (matchedLineItem?.itemDescription || '').match(/([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4})/i);
      if (regMatch) {
        autoParams.vehicleRegNo = regMatch[1].toUpperCase().replace(/\s+/g, ' ');
      }

      // Extract Seating Capacity from PO description
      const seatMatch = fullText.match(/(\d+\s*\+?\s*D?\s*\+?\s*\d*)\s*(?:seat|seater)/i)
        || fullText.match(/seating\s*(?:capacity)?\s*[:\-]?\s*(\d+\s*\+?\s*D?\s*\+?\s*\d*)/i)
        || (matchedLineItem?.itemDescription || '').match(/(\d+\s*\+?\s*D?\s*\+?\s*\d*)\s*(?:seat|seater)/i);
      if (seatMatch) {
        autoParams.seatingCapacity = seatMatch[1].trim();
      }

      // Extract Diesel Per Hour for crane/hydra
      const dphMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(?:ltr?|litre?s?)\s*(?:\/|per)\s*(?:hr|hour)/i)
        || fullText.match(/diesel\s*@?\s*(\d+(?:\.\d+)?)\s*(?:ltr?|l)\s*(?:\/|per)\s*(?:hr|hour)/i);
      if (dphMatch) {
        autoParams.dieselPerHour = parseFloat(dphMatch[1]);
      }

      // Extract Diesel Per Operating Hour for palfinger/hydra
      const dpoMatch = fullText.match(/operating\s*(?:hour)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:ltr?|l)/i);
      if (dpoMatch) {
        autoParams.dieselPerOpHour = parseFloat(dpoMatch[1]);
      }

      // Extract Meal Rate for food category
      const mealRateMatch = fullText.match(/(?:rate|per\s*(?:plate|meal|head))\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i)
        || fullText.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*(?:plate|meal|head))/i);
      if (mealRateMatch) {
        autoParams.mealRate = parseFloat(mealRateMatch[1]);
      }

      // Extract Monthly Rent
      const rentMatch = fullText.match(/(?:rent|monthly)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)/i);
      if (rentMatch && classifyService(service.serviceType) === 'rent') {
        autoParams.monthlyRent = parseFloat(rentMatch[1].replace(/,/g, ''));
      }
    }

    // Also check if PO-level unit_rate is available directly
    if (!autoParams.monthlyHire && matchedPO?.unit_rate) {
      autoParams.monthlyHire = Number(matchedPO.unit_rate);
    }

    // Apply auto-filled params (only override if we found values)
    if (Object.keys(autoParams).length > 0) {
      setParams((prev: any) => ({ ...prev, ...autoParams }));
    }
  };

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()) || (v.vendor_code||'').includes(searchTerm));

  const stepLabels = vendorId
    ? ['Select Service', 'Log Sheet', 'Parameters', 'Bill Calculation', 'Generated']
    : ['Vendor & Service', 'Log Sheet', 'Parameters', 'Bill Calculation', 'Generated'];

  // Save bill to database
  const handleSaveBill = async () => {
    if (!selectedVendor || !selectedService || !calc) return;
    setSavingBill(true);
    try {
      const monthMatch = params.billingMonth.match(/(\w+)'?(\d{4})/);
      const billingMonth = monthMatch ? MONTHS.indexOf(monthMatch[1]) + 1 : new Date().getMonth() + 1;
      const billingYear = monthMatch ? Number(monthMatch[2]) : new Date().getFullYear();

      await api.post('/billing/save-bill', {
        vendorId: selectedVendor.id,
        serviceId: selectedService.id,
        serviceType: selectedService.serviceType,
        sectionId: selectedService.sectionId,
        invoiceNumber: params.invoiceSerial || `INV-${Date.now()}`,
        invoiceDate: params.invoiceDate,
        billingMonth,
        billingYear,
        taxableValue: calc.taxableValue,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: calc.igst,
        grandTotal: calc.grandTotal,
        lineItems: calc.lineItems,
        category,
        poNumber: selectedService.poNumber || '',
      });
      setSavingBill(false);
      setStep(4);
    } catch (err: any) {
      setSavingBill(false);
      alert('Failed to save bill: ' + (err.response?.data?.error || err.message));
    }
  };

  // Loading state when auto-loading vendor from URL
  if (step === -1) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3">🧾</div>
          <p className="text-gray-500">Loading vendor details...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {vendorId && (
          <button onClick={() => navigate(`/vendors/${vendorId}`)} className="text-sm text-gray-500 hover:text-gray-700">← Back to Vendor</button>
        )}
        <h1 className="text-2xl font-bold text-gray-800">🧾 Tax Invoice</h1>
        <div className="flex gap-1 ml-4">
          {stepLabels.map((s, i) => (
            <span key={i} className={`px-3 py-1 rounded-full text-xs font-medium ${i === step ? 'bg-[#4fc3f7] text-white' : i < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>

      {/* ===== STEP 0: Vendor & Service ===== */}
      {step === 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          {/* When vendor is pre-selected from URL, show only service selection */}
          {vendorId && selectedVendor ? (
            <div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 flex items-center justify-between">
                <div><span className="text-xs text-gray-500">Vendor:</span><div className="font-bold text-gray-800">{selectedVendor.name}</div><div className="text-xs text-gray-400">Code: {selectedVendor.vendor_code || '—'} | GSTIN: {selectedVendor.gstin || params.vendorGstin || '—'}</div></div>
              </div>
              <h3 className="text-sm font-semibold text-[#4fc3f7] mb-3">Select Service for Bill Generation</h3>
              <p className="text-xs text-gray-400 mb-2">This vendor has {selectedVendor.serviceLines?.length || 0} service(s). Select one:</p>
              <div className="space-y-2">
                {(selectedVendor.serviceLines || []).map((sl: any) => (
                  <div key={sl.id} onClick={() => setSelectedService(sl)}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedService?.id === sl.id ? 'border-[#4fc3f7] bg-blue-50' : 'border-gray-100 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2">
                      <span>{getCategoryIcon(classifyService(sl.serviceType))}</span>
                      <div><div className="text-sm font-medium">{sl.serviceType}</div>{sl.poNumber && <div className="text-xs text-gray-400">PO: {sl.poNumber}</div>}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sl.sectionCode==='REF'?'bg-blue-500 text-white':sl.sectionCode==='PES'?'bg-red-500 text-white':'bg-purple-500 text-white'}`}>{sl.sectionCode}</span>
                      <span className="text-xs text-gray-400">{classifyService(sl.serviceType)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {selectedService && (
                <button onClick={() => setStep(1)} className="mt-4 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  Next → Upload Log Sheet
                </button>
              )}
            </div>
          ) : (
            /* Normal flow: select vendor first, then service */
            <div>
              <h2 className="text-lg font-bold mb-1">Select Vendor → Service → Department</h2>
              <p className="text-sm text-gray-400 mb-4">Choose the vendor, then select the specific service & department for bill generation.</p>
              <input type="text" placeholder="🔍 Search vendor by name, service, or code..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-[#4fc3f7] outline-none" />

              {!selectedVendor ? (
                <div>
                  <h3 className="text-sm font-semibold text-[#4fc3f7] mb-3">Step 1: Choose Vendor</h3>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {filteredVendors.map((v: any) => (
                      <div key={v.id} onClick={() => loadVendorDetails(v.id)}
                        className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-[#4fc3f7] cursor-pointer transition-all">
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{v.name}</div>
                          <div className="flex gap-1 mt-1">{(v.all_services||[]).slice(0,3).map((s:string,i:number) => <span key={i} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{s}</span>)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {v.vendor_code && <span className="text-xs font-mono bg-green-100 text-green-700 px-2 py-0.5 rounded">{v.vendor_code}</span>}
                          <span className="text-gray-300">›</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Selected vendor card */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 flex items-center justify-between">
                    <div><span className="text-xs text-gray-500">Selected Vendor:</span><div className="font-bold text-gray-800">{selectedVendor.name}</div><div className="text-xs text-gray-400">Code: {selectedVendor.vendor_code || '—'}</div></div>
                    <button onClick={() => { setSelectedVendor(null); setSelectedService(null); }} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded">Change</button>
                  </div>
                  {/* Service selection */}
                  <h3 className="text-sm font-semibold text-[#4fc3f7] mb-3">Step 2: Select Service & Department</h3>
                  <p className="text-xs text-gray-400 mb-2">This vendor offers {selectedVendor.serviceLines?.length || 0} service(s). Select one to generate bill for:</p>
                  <div className="space-y-2">
                    {(selectedVendor.serviceLines || []).map((sl: any) => (
                      <div key={sl.id} onClick={() => setSelectedService(sl)}
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${selectedService?.id === sl.id ? 'border-[#4fc3f7] bg-blue-50' : 'border-gray-100 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-2">
                          <span>{getCategoryIcon(classifyService(sl.serviceType))}</span>
                          <div><div className="text-sm font-medium">{sl.serviceType}</div>{sl.poNumber && <div className="text-xs text-gray-400">PO: {sl.poNumber}</div>}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sl.sectionCode==='REF'?'bg-blue-500 text-white':sl.sectionCode==='PES'?'bg-red-500 text-white':'bg-purple-500 text-white'}`}>{sl.sectionCode}</span>
                          <span className="text-xs text-gray-400">{classifyService(sl.serviceType)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedService && (
                    <button onClick={() => setStep(1)} className="mt-4 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                      Next → Upload Log Sheet
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== STEP 1: Log Sheet ===== */}
      {step === 1 && (
        <div className="bg-[#f0f7ff] rounded-xl p-6 shadow-sm border border-blue-100">
          <h2 className="text-lg font-bold mb-1">📊 Upload Log Sheet <span className="text-sm font-normal text-gray-400">(Optional)</span></h2>

          {/* Vendor/Service banner */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 mt-3 mb-4 text-sm">
            <span className="font-medium text-gray-800">Vendor: {selectedVendor?.name}</span>
            <span className="mx-2 text-gray-400">→</span>
            <span className="font-medium text-gray-800">{selectedService?.serviceType}</span>
            <span className="mx-2 text-gray-400">→</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedService?.sectionCode==='REF'?'bg-blue-500 text-white':selectedService?.sectionCode==='PES'?'bg-red-500 text-white':'bg-purple-500 text-white'}`}>{selectedService?.sectionName || selectedService?.sectionCode}</span>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            {(category==='bus'||category==='vehicle') && 'Upload the monthly log sheet (Excel/CSV) for this vehicle. Starting KM and Closing KM will be automatically extracted.'}
            {category==='crane' && 'Upload the monthly log sheet with working hours data.'}
            {category==='palfinger_hydra' && 'Upload the log sheet with operating hours and movement KM data.'}
            {category==='food' && 'Upload the monthly meal count sheet (Excel/CSV).'}
            {category==='housekeeping' && 'Upload the attendance/mandays sheet.'}
            {!['bus','vehicle','crane','palfinger_hydra','food','housekeeping'].includes(category) && 'Upload supporting document if available, or skip to fill manually.'}
          </p>

          {/* Upload area */}
          <label className="block border-2 border-dashed border-orange-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#4fc3f7] hover:bg-blue-50/30 transition-colors mb-5">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-sm font-medium text-[#4fc3f7]">Click or drag log sheet / document here</p>
            <p className="text-xs text-gray-400 mt-1">Supports Excel (.xlsx, .xls), CSV, Text, PDF, Images</p>
            <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.txt" onChange={(e) => { if (e.target.files?.[0]) alert('Excel parsing — coming soon'); }} />
          </label>

          {/* Manual entry form */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">📝 Or enter manually:</h3>

            {(category==='bus'||category==='vehicle'||category==='camper_fixed') && (
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-xs text-gray-500 block mb-1">Starting KM</label><input type="number" value={params.startKM||''} onChange={(e)=>{const v=Number(e.target.value);setParams({...params,startKM:v,totalKM:(params.endKM||0)-v});}} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 45000" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Closing KM</label><input type="number" value={params.endKM||''} onChange={(e)=>{const v=Number(e.target.value);setParams({...params,endKM:v,totalKM:v-(params.startKM||0)});}} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 48500" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Total KM <span className="text-green-600">(auto)</span></label><input type="number" value={params.totalKM||''} readOnly className="w-full px-3 py-2.5 border border-green-200 rounded-lg text-sm bg-green-50 font-bold text-green-700" /></div>
              </div>
            )}
            {category==='crane' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 block mb-1">Total Working Hours</label><input type="number" value={params.totalHours||''} onChange={(e)=>setParams({...params,totalHours:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 180" /></div>
              </div>
            )}
            {category==='palfinger_hydra' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 block mb-1">Operating Hours</label><input type="number" value={params.operatingHours||''} onChange={(e)=>setParams({...params,operatingHours:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 120" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Movement KM</label><input type="number" value={params.vehicleMovementKM||''} onChange={(e)=>setParams({...params,vehicleMovementKM:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 500" /></div>
              </div>
            )}
            {category==='food' && (
              <div className="grid grid-cols-4 gap-4">
                <div><label className="text-xs text-gray-500 block mb-1">Total Breakfast</label><input type="number" value={params.totalBreakfast||''} onChange={(e)=>setParams({...params,totalBreakfast:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Total Lunch</label><input type="number" value={params.totalLunch||''} onChange={(e)=>setParams({...params,totalLunch:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Total Snacks</label><input type="number" value={params.totalSnacks||''} onChange={(e)=>setParams({...params,totalSnacks:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Total Dinner</label><input type="number" value={params.totalDinner||''} onChange={(e)=>setParams({...params,totalDinner:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
            )}
            {category==='housekeeping' && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 block mb-1">Total Mandays</label><input type="number" value={params.totalMandays||''} onChange={(e)=>setParams({...params,totalMandays:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Supervisor Mandays</label><input type="number" value={params.supervisorMandays||''} onChange={(e)=>setParams({...params,supervisorMandays:Number(e.target.value)})} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
            )}
            {!['bus','vehicle','camper_fixed','crane','palfinger_hydra','food','housekeeping'].includes(category) && (
              <p className="text-xs text-gray-400">No log sheet data needed for this service. Click "Skip → Fill Manually" to proceed.</p>
            )}
          </div>

          {/* Bill Components Reference */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-5">
            <h3 className="text-sm font-semibold text-orange-700 mb-3">📋 Bill Components Reference:</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-orange-200">
                  <th className="text-left py-2 text-gray-600 font-semibold">Component</th>
                  <th className="text-left py-2 text-gray-600 font-semibold">Type</th>
                  <th className="text-left py-2 text-gray-600 font-semibold">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {(category==='bus'||category==='vehicle') && (<>
                  <tr><td className="py-2 text-gray-700">Monthly Hired Charges</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.monthlyHire ? `₹${Number(params.monthlyHire).toLocaleString('en-IN')}` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Mileage</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.mileage ? `${params.mileage} KM/Ltr` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Starting KM</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">{params.startKM ? params.startKM.toLocaleString('en-IN') : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Closing KM</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">{params.endKM ? params.endKM.toLocaleString('en-IN') : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Diesel Price</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">{params.dieselPrice ? `₹${params.dieselPrice}/Ltr` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                  <tr><td className="py-2 font-bold text-gray-800">Total KM</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-bold">🤖 AUTO</span></td><td className="py-2 font-mono text-gray-800">{params.totalKM ? `${params.totalKM.toLocaleString('en-IN')} KM` : '— KM'}</td></tr>
                </>)}
                {category==='camper_fixed' && (<>
                  <tr><td className="py-2 text-gray-700">Monthly Contract Value</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.monthlyHire ? `₹${Number(params.monthlyHire).toLocaleString('en-IN')}` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                </>)}
                {category==='crane' && (<>
                  <tr><td className="py-2 text-gray-700">Monthly Hire Charges</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.monthlyHire ? `₹${Number(params.monthlyHire).toLocaleString('en-IN')}` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">PO Quantity</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.poQuantity || '—'} months</td></tr>
                  <tr><td className="py-2 text-gray-700">Working Hours</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">{params.totalHours || '—'} hrs</td></tr>
                  <tr><td className="py-2 text-gray-700">Diesel/Hr</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.dieselPerHour} Ltr/Hr</td></tr>
                  <tr><td className="py-2 text-gray-700">Diesel Price</td><td className="py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${params.dieselPrice > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{params.dieselPrice > 0 ? '🔒 FIXED (PO)' : '✏️ USER INPUT'}</span></td><td className="py-2 font-mono text-gray-800">₹{params.dieselPrice || '—'}/Ltr</td></tr>
                  <tr><td className="py-2 text-gray-700">Max Diesel (PO)</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.maxDieselQty || '—'} Ltr</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                </>)}
                {category==='palfinger_hydra' && (<>
                  <tr><td className="py-2 text-gray-700">Monthly Hire</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.monthlyHire ? `₹${Number(params.monthlyHire).toLocaleString('en-IN')}` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Operating Hours</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">{params.operatingHours || '—'} hrs</td></tr>
                  <tr><td className="py-2 text-gray-700">Movement KM</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">{params.vehicleMovementKM || '—'} KM</td></tr>
                  <tr><td className="py-2 text-gray-700">Diesel Price</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.dieselPrice}/Ltr</td></tr>
                </>)}
                {category==='food' && (<>
                  <tr><td className="py-2 text-gray-700">Rate/Meal</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">₹{params.mealRate}/plate</td></tr>
                  <tr><td className="py-2 text-gray-700">Meal Counts</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">B:{params.totalBreakfast||0} L:{params.totalLunch||0} S:{params.totalSnacks||0} D:{params.totalDinner||0}</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                </>)}
                {category==='housekeeping' && (<>
                  <tr><td className="py-2 text-gray-700">Rate/Manday</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">₹{params.ratePerManday}/day</td></tr>
                  <tr><td className="py-2 text-gray-700">Total Mandays</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">📊 LOG SHEET</span></td><td className="py-2 font-mono text-gray-800">{params.totalMandays || '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                </>)}
                {category==='rent' && (<>
                  <tr><td className="py-2 text-gray-700">Monthly Rent</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">{params.monthlyRent ? `₹${Number(params.monthlyRent).toLocaleString('en-IN')}` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                </>)}
                {category==='it_cmms' && (<>
                  <tr><td className="py-2 text-gray-700">Rate/Month</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold">🔒 FIXED (PO)</span></td><td className="py-2 font-mono text-gray-800">₹{Number(params.ratePerMonth).toLocaleString('en-IN')}/month</td></tr>
                  <tr><td className="py-2 text-gray-700">Months</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">{params.serviceMonths}</td></tr>
                </>)}
                {(category==='other'||category==='consultancy'||category==='manpower_shutdown'||category==='guest_electricity') && (<>
                  <tr><td className="py-2 text-gray-700">Service Charges</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">{params.serviceCharges ? `₹${Number(params.serviceCharges).toLocaleString('en-IN')}` : '—'}</td></tr>
                  <tr><td className="py-2 text-gray-700">Penalty</td><td className="py-2"><span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">✏️ USER INPUT</span></td><td className="py-2 font-mono text-gray-800">₹{params.penalty || 0}</td></tr>
                </>)}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={()=>setStep(2)} className="px-5 py-2.5 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium hover:bg-[#3bb5e8]">Next → Set Parameters</button>
            <button onClick={()=>setStep(2)} className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">📝 Skip → Fill Manually</button>
            <button onClick={()=>setStep(0)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">← Back</button>
          </div>
        </div>
      )}

      {/* ===== STEP 2: Parameters ===== */}
      {step === 2 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold mb-2">Cost Parameters & Invoice Details</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-5 text-sm">
            Generating for: <strong>{selectedVendor?.name}</strong> → <strong>{selectedService?.serviceType}</strong> →
            <span className={`ml-1 text-xs font-bold px-2 py-0.5 rounded ${selectedService?.sectionCode==='REF'?'bg-blue-500 text-white':selectedService?.sectionCode==='PES'?'bg-red-500 text-white':'bg-purple-500 text-white'}`}>{selectedService?.sectionCode}</span>
            <span className="ml-2 text-xs text-gray-500">{category}</span>
          </div>

          {/* Upload Vendor Invoice — Auto-fill */}
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">📄 Upload Vendor Submitted Invoice <span className="text-[10px] font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Auto-fill parameters</span></h3>
            <p className="text-xs text-amber-700 mb-3">Upload the vendor's invoice PDF — values will be extracted and auto-filled below.</p>
            <label className="flex items-center gap-3 border-2 border-dashed border-amber-300 rounded-lg p-3 cursor-pointer hover:border-amber-400 hover:bg-amber-100/50 transition">
              <span className="text-2xl">📄</span>
              <div>
                <p className="text-sm font-medium text-amber-800">Click to upload vendor invoice (PDF)</p>
                <p className="text-[10px] text-amber-600">Invoice number, date, amounts, GST will be auto-extracted</p>
              </div>
              <input type="file" className="hidden" accept=".pdf" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  const res = await api.post('/po-reader/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  const ext = res.data.extracted;
                  if (ext) {
                    // Auto-fill parameters from extracted invoice data
                    const updates: any = {};
                    if (ext.totalAmount || ext.baseValue) updates.monthlyHire = Number(ext.baseValue || ext.totalAmount || 0);
                    if (ext.orderDate) updates.invoiceDate = ext.orderDate;
                    if (ext.purchaseOrderNumber) updates.invoiceSerial = ext.purchaseOrderNumber;
                    if (ext.vendorGstin) updates.vendorGstin = ext.vendorGstin;
                    if (ext.vendorPan) updates.vendorPan = ext.vendorPan;
                    if (ext.supplierAddress) updates.vendorAddress = ext.supplierAddress;
                    if (ext.cgstTotal > 0 || ext.sgstTotal > 0) updates.gstType = 'CGST_SGST';
                    if (ext.lineItems?.[0]?.quantity) updates.poQuantity = ext.lineItems[0].quantity;
                    if (ext.lineItems?.[0]?.unitRate) updates.monthlyHire = ext.lineItems[0].unitRate;
                    setParams((prev: any) => ({ ...prev, ...updates }));
                    alert('✅ Invoice values extracted and auto-filled!');
                  }
                } catch (err: any) {
                  alert('❌ Could not extract invoice: ' + (err.response?.data?.error || err.message));
                }
                e.target.value = '';
              }} />
            </label>
          </div>

          {/* 🆔 Vendor Identity */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">🆔 Vendor Identity <span className="text-xs text-green-600 font-normal">Auto-filled from PO ✓</span></h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-gray-500">Vendor GSTIN {params.vendorGstin && <span className="text-green-600">🔒 PO</span>}</label><input type="text" value={params.vendorGstin} onChange={(e)=>setParams({...params,vendorGstin:e.target.value})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.vendorGstin ? 'bg-green-50 border-green-200' : ''}`} /></div>
              <div><label className="text-xs text-gray-500">Vendor PAN {params.vendorPan && <span className="text-green-600">🔒 PO</span>}</label><input type="text" value={params.vendorPan} onChange={(e)=>setParams({...params,vendorPan:e.target.value})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.vendorPan ? 'bg-green-50 border-green-200' : ''}`} /></div>
              <div><label className="text-xs text-gray-500">Vendor Address {params.vendorAddress && <span className="text-green-600">🔒 PO</span>}</label><input type="text" value={params.vendorAddress} onChange={(e)=>setParams({...params,vendorAddress:e.target.value})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.vendorAddress ? 'bg-green-50 border-green-200' : ''}`} /></div>
            </div>
          </div>

          {/* 📋 Common Invoice Fields */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">📋 Common Invoice Fields</h3>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="text-xs text-gray-500">Billing Month</label><input type="text" value={params.billingMonth} onChange={(e)=>setParams({...params,billingMonth:e.target.value})} placeholder="e.g. May'2025" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="text-xs text-gray-500">Invoice Serial No</label><input type="text" value={params.invoiceSerial} onChange={(e)=>setParams({...params,invoiceSerial:e.target.value})} placeholder="e.g. 44/CAMPER" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="text-xs text-gray-500">Invoice Date</label><input type="date" value={params.invoiceDate} onChange={(e)=>setParams({...params,invoiceDate:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="text-xs text-gray-500">GST Type</label><select value={params.gstType} onChange={(e)=>setParams({...params,gstType:e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="CGST_SGST">CGST 9% + SGST 9%</option><option value="CGST_SGST_FOOD">CGST 2.5% + SGST 2.5%</option><option value="IGST">IGST 18%</option><option value="NO_GST">No GST</option></select></div>
            </div>
          </div>

          {/* Category-specific */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{getCategoryIcon(category)} {selectedService?.serviceType}</h3>
            <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded mb-3">Formula: {getCategoryFormula(category)}</p>
            <div className="grid grid-cols-3 gap-3">
              {(category==='bus'||category==='vehicle'||category==='crane'||category==='palfinger_hydra'||category==='camper_fixed') && (<>
                <div><label className="text-xs text-gray-500">Monthly Fixed Charges (₹) {params.monthlyHire > 0 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.monthlyHire||''} onChange={(e)=>setParams({...params,monthlyHire:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.monthlyHire > 0 ? 'bg-green-50 border-green-200' : ''}`} /></div>
                <div><label className="text-xs text-gray-500">PO Quantity (Months) {params.poQuantity > 0 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.poQuantity||''} onChange={(e)=>setParams({...params,poQuantity:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.poQuantity > 0 ? 'bg-green-50 border-green-200' : ''}`} /><span className="text-xs text-gray-400">Total PO: ₹{((params.monthlyHire||0)*(params.poQuantity||1)).toLocaleString('en-IN')}</span></div>
              </>)}
              {(category==='bus'||category==='vehicle') && (<>
                <div><label className="text-xs text-gray-500">Vehicle Reg No. {params.vehicleRegNo && <span className="text-green-600">🔒 PO</span>}</label><input type="text" value={params.vehicleRegNo||''} onChange={(e)=>setParams({...params,vehicleRegNo:e.target.value})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.vehicleRegNo ? 'bg-green-50 border-green-200' : ''}`} /></div>
                <div><label className="text-xs text-gray-500">Seating Capacity {params.seatingCapacity && <span className="text-green-600">🔒 PO</span>}</label><input type="text" value={params.seatingCapacity||''} onChange={(e)=>setParams({...params,seatingCapacity:e.target.value})} placeholder="e.g. 40+D+1" className={`w-full px-3 py-2 border rounded-lg text-sm ${params.seatingCapacity ? 'bg-green-50 border-green-200' : ''}`} /></div>
                <div><label className="text-xs text-gray-500">Starting KM <span className="text-blue-600">📊 From Log Sheet</span></label><input type="number" value={params.startKM||''} onChange={(e)=>setParams({...params,startKM:Number(e.target.value),totalKM:(params.endKM||0)-Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm bg-blue-50" /></div>
                <div><label className="text-xs text-gray-500">Closing KM <span className="text-blue-600">📊 From Log Sheet</span></label><input type="number" value={params.endKM||''} onChange={(e)=>setParams({...params,endKM:Number(e.target.value),totalKM:Number(e.target.value)-(params.startKM||0)})} className="w-full px-3 py-2 border rounded-lg text-sm bg-blue-50" /></div>
                <div><label className="text-xs text-gray-500">Total KM <span className="text-green-600">🤖 AUTO</span></label><input type="number" value={params.totalKM||''} readOnly className="w-full px-3 py-2 border rounded-lg text-sm bg-green-50 font-bold text-green-700" /></div>
                <div><label className="text-xs text-gray-500">Diesel Mileage (KM/Ltr) {params.mileage > 0 ? <span className="text-green-600">🔒 PO</span> : <span className="text-red-500">✏️ USER</span>}</label><input type="number" value={params.mileage||''} onChange={(e)=>setParams({...params,mileage:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.mileage > 0 ? 'bg-green-50 border-green-200' : ''}`} /><span className="text-xs text-gray-400">Bus: 4 KM/Ltr</span></div>
                <div><label className="text-xs text-gray-500">Avg Diesel Price (₹/Ltr) {params.dieselPrice > 0 ? <span className="text-green-600">🔒 PO</span> : <span className="text-red-500">✏️ USER</span>}</label><input type="number" value={params.dieselPrice||''} onChange={(e)=>setParams({...params,dieselPrice:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.dieselPrice > 0 ? 'bg-green-50 border-green-200' : ''}`} />{params.maxDieselQty > 0 && <span className="text-xs text-gray-400">Max PO: {params.maxDieselQty} Ltr</span>}</div>
                <div><label className="text-xs text-gray-500">Agreement KM {params.agreementKM > 0 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.agreementKM||''} onChange={(e)=>setParams({...params,agreementKM:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.agreementKM > 0 ? 'bg-green-50 border-green-200' : ''}`} /></div>
              </>)}
              {category==='crane' && (<>
                <div><label className="text-xs text-gray-500">Total Hours <span className="text-blue-600">📊 From Log Sheet</span></label><input type="number" value={params.totalHours||''} onChange={(e)=>setParams({...params,totalHours:Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm bg-blue-50" /></div>
                <div><label className="text-xs text-gray-500">Diesel/Hr (Ltr) {params.dieselPerHour !== 6 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.dieselPerHour||''} onChange={(e)=>setParams({...params,dieselPerHour:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.dieselPerHour !== 6 ? 'bg-green-50 border-green-200' : ''}`} /></div>
                <div><label className="text-xs text-gray-500">Diesel Price (₹/Ltr) {params.dieselPrice > 0 ? <span className="text-green-600">🔒 PO</span> : <span className="text-red-500">✏️ USER</span>}</label><input type="number" value={params.dieselPrice||''} onChange={(e)=>setParams({...params,dieselPrice:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.dieselPrice > 0 ? 'bg-green-50 border-green-200' : ''}`} />{params.maxDieselQty > 0 && <span className="text-xs text-gray-400">Max PO: {params.maxDieselQty} Ltr</span>}</div>
              </>)}
              {category==='food' && (<>
                <div><label className="text-xs text-gray-500">Rate/Meal (₹) {params.mealRate !== 65 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.mealRate||''} onChange={(e)=>setParams({...params,mealRate:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.mealRate !== 65 ? 'bg-green-50 border-green-200' : ''}`} /></div>
                <div><label className="text-xs text-gray-500">Total Lunch <span className="text-blue-600">📊 From Log Sheet</span></label><input type="number" value={params.totalLunch||''} onChange={(e)=>setParams({...params,totalLunch:Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm bg-blue-50" /></div>
                <div><label className="text-xs text-gray-500">Total Dinner <span className="text-blue-600">📊 From Log Sheet</span></label><input type="number" value={params.totalDinner||''} onChange={(e)=>setParams({...params,totalDinner:Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm bg-blue-50" /></div>
              </>)}
              {category==='rent' && <div><label className="text-xs text-gray-500">Monthly Rent (₹) {params.monthlyRent > 0 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.monthlyRent||''} onChange={(e)=>setParams({...params,monthlyRent:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.monthlyRent > 0 ? 'bg-green-50 border-green-200' : ''}`} /></div>}
              {category==='housekeeping' && (<><div><label className="text-xs text-gray-500">Total Mandays <span className="text-blue-600">📊 From Log Sheet</span></label><input type="number" value={params.totalMandays||''} onChange={(e)=>setParams({...params,totalMandays:Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm bg-blue-50" /></div><div><label className="text-xs text-gray-500">Rate/Manday {params.ratePerManday !== 880 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.ratePerManday||''} onChange={(e)=>setParams({...params,ratePerManday:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.ratePerManday !== 880 ? 'bg-green-50 border-green-200' : ''}`} /></div></>)}
              {category==='it_cmms' && (<><div><label className="text-xs text-gray-500">Months <span className="text-red-500">✏️ USER</span></label><input type="number" value={params.serviceMonths||''} onChange={(e)=>setParams({...params,serviceMonths:Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div><div><label className="text-xs text-gray-500">Rate/Month {params.ratePerMonth !== 27500 && <span className="text-green-600">🔒 PO</span>}</label><input type="number" value={params.ratePerMonth||''} onChange={(e)=>setParams({...params,ratePerMonth:Number(e.target.value)})} className={`w-full px-3 py-2 border rounded-lg text-sm ${params.ratePerMonth !== 27500 ? 'bg-green-50 border-green-200' : ''}`} /></div></>)}
              <div><label className="text-xs text-gray-500">Penalty/Deduction (₹) <span className="text-red-500">✏️ USER</span></label><input type="number" value={params.penalty||''} onChange={(e)=>setParams({...params,penalty:Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
          </div>

          {/* Live Calculation Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
            <h4 className="text-sm font-semibold text-purple-700 mb-2">📊 Live Calculation Preview:</h4>
            <div className="space-y-1 text-sm text-gray-700">{calc.steps.map((s,i) => <div key={i} className={s.startsWith('⚠️') ? 'text-orange-600 text-xs' : s.includes('Total =') || s.includes('Step 5') ? 'font-bold text-green-800 bg-green-100 px-2 py-1 rounded' : ''}>{s}</div>)}</div>
          </div>

          <div className="flex gap-3">
            <button onClick={()=>setStep(1)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">← Back to Log Sheet</button>
            <button onClick={()=>setStep(3)} className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Next → Bill Calculation</button>
          </div>
        </div>
      )}

      {/* ===== STEP 3: Bill Calculation — Printable Format ===== */}
      {step === 3 && (
        <div>
          <h2 className="text-xl font-bold text-green-800 mb-3">📋 Bill Calculation — Printable Format</h2>
          {params.totalKM > 0 && <div className="bg-green-100 border border-green-300 rounded-lg px-4 py-2 mb-4 text-sm text-green-800">✓ KM Data: Starting {(params.startKM||0).toLocaleString('en-IN')} → Closing {(params.endKM||0).toLocaleString('en-IN')} = <strong>{params.totalKM.toLocaleString('en-IN')} KM</strong></div>}

          {/* Printable Invoice */}
          <div className="bg-white border-2 border-gray-300 p-6 font-mono text-xs leading-relaxed" id="printable-invoice">
            <div className="text-center text-base font-bold border-b-2 border-gray-800 pb-2 mb-4">TAX INVOICE</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="border border-gray-400 p-3">
                <div><strong>Name:</strong> M/s.{selectedVendor?.name}</div>
                <div><strong>Address:</strong> {params.vendorAddress || 'N/A'}</div>
                <div><strong>State:</strong> ODISHA-765015</div>
                <div><strong>GSTIN:</strong> {params.vendorGstin || '—'}</div>
                <div><strong>PAN NO:</strong> {params.vendorPan || '—'}</div>
              </div>
              <div className="border border-gray-400 p-3">
                <div><strong>Date:</strong> {params.invoiceDate}</div>
                <div><strong>INVOICE NO:</strong> {params.invoiceSerial || '—'}</div>
                <div><strong>PO No:</strong> {selectedService?.poNumber || '—'}</div>
                <div><strong>PO Date:</strong></div>
              </div>
            </div>
            <div className="border border-gray-400 p-3 mb-4">
              <div><strong>TO</strong></div>
              <div>BLUSPRING ENTERPRISES LIMITED</div>
              <div>Third Floor, Block E, Plot 67P, Venus Plaza, Bhubaneswar</div>
              <div>Dist-Khordha, Odisha-751010</div>
              <div>GST No: 21AAMCB3236E1Z5 | STATE CODE: 21</div>
              <div>SITE: UAIL, TIKIRI</div>
            </div>

            {/* Line Items Table */}
            <table className="w-full border-collapse border border-gray-800 mb-4 text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-800 px-2 py-1 text-left w-8">Sl No</th>
                  <th className="border border-gray-800 px-2 py-1 text-left">DESCRIPTION OF SERVICE</th>
                  <th className="border border-gray-800 px-2 py-1 text-center w-16">HSN/SAC CODE</th>
                  <th className="border border-gray-800 px-2 py-1 text-center w-10">QTY</th>
                  <th className="border border-gray-800 px-2 py-1 text-center w-10">UOM</th>
                  <th className="border border-gray-800 px-2 py-1 text-right w-20">RATE</th>
                  <th className="border border-gray-800 px-2 py-1 text-right w-24">TAXABLE VALUE (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {calc.lineItems.map((item, i) => (
                  <tr key={i}>
                    <td className="border border-gray-800 px-2 py-1">{i+1}</td>
                    <td className="border border-gray-800 px-2 py-1">{item.description}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{item.hsnSac}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{item.qty}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{item.uom}</td>
                    <td className="border border-gray-800 px-2 py-1 text-right">{item.rate.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                    <td className="border border-gray-800 px-2 py-1 text-right">{item.amount.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                  </tr>
                ))}
                <tr><td colSpan={6} className="border border-gray-800 px-2 py-1 text-right font-bold">Taxable Value</td><td className="border border-gray-800 px-2 py-1 text-right font-bold">₹{calc.taxableValue.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
                {calc.cgst > 0 && <tr><td colSpan={6} className="border border-gray-800 px-2 py-1 text-right">CGST @ 9%</td><td className="border border-gray-800 px-2 py-1 text-right">₹{calc.cgst.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>}
                {calc.sgst > 0 && <tr><td colSpan={6} className="border border-gray-800 px-2 py-1 text-right">SGST @ 9%</td><td className="border border-gray-800 px-2 py-1 text-right">₹{calc.sgst.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>}
                {calc.igst > 0 && <tr><td colSpan={6} className="border border-gray-800 px-2 py-1 text-right">IGST @ 18%</td><td className="border border-gray-800 px-2 py-1 text-right">₹{calc.igst.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>}
                <tr className="bg-cyan-50"><td colSpan={6} className="border border-gray-800 px-2 py-1 text-right font-bold text-lg">Grand Total Value</td><td className="border border-gray-800 px-2 py-1 text-right font-bold text-lg">₹{calc.grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
              </tbody>
            </table>

            <div className="italic text-xs mb-4">{numToWords(calc.grandTotal)}</div>
            <div className="flex justify-between mt-6">
              <div className="text-xs">Authorised Signatory</div>
              <div className="text-xs">For {selectedVendor?.name}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button onClick={handleSaveBill} disabled={savingBill} className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {savingBill ? '⏳ Saving...' : '📋 Generate & Save Bill'}
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">📝 Download as Word (.doc)</button>
            <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">📊 Download as CSV (Print-ready)</button>
            <button onClick={()=>setStep(2)} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">✏️ Edit Bill Parameters</button>
          </div>
          <button onClick={()=>setStep(2)} className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">← Back to Parameters</button>
        </div>
      )}

      {/* ===== STEP 4: Generated ===== */}
      {step === 4 && (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Bill Generated & Saved!</h2>
          <p className="text-sm text-gray-500 mb-2">Grand Total: <strong className="text-green-700 text-lg">₹{calc.grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</strong></p>
          <p className="text-xs text-gray-400 mb-6">{numToWords(calc.grandTotal)}</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {vendorId ? (
              <>
                <button onClick={() => navigate(`/vendors/${vendorId}`)} className="px-5 py-2.5 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#2a2a4e]">
                  ← Back to Vendor Account
                </button>
                <button onClick={()=>{setStep(0);setSelectedService(null);}} className="px-5 py-2.5 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium">
                  🔄 Generate Another Bill
                </button>
              </>
            ) : (
              <button onClick={()=>{setStep(0);setSelectedVendor(null);setSelectedService(null);}} className="px-5 py-2.5 bg-[#4fc3f7] text-white rounded-lg text-sm font-medium">🔄 New Bill</button>
            )}
            <button onClick={()=>setStep(3)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">← Back to Preview</button>
          </div>
        </div>
      )}
    </div>
  );
}
