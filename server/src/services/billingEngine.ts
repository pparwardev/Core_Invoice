import { ServiceCategory, BillingCalculation } from '../types/index.js';

/**
 * Classify service type into billing category using regex patterns
 */
export function classifyService(serviceType: string): ServiceCategory {
  const s = serviceType.toLowerCase();
  if (/200\s*t|100\s*t|40\s*t|crane/i.test(s)) return 'crane';
  if (/palfinger|hydra|forklift|trail[eo]r/i.test(s)) return 'palfinger_hydra';
  if (/bus/i.test(s)) return 'bus';
  if (/camper/i.test(s)) return 'camper_fixed';
  if (/bolero|scorpio|xylo|tipper|bob\s*cat|dozz?er/i.test(s)) return 'vehicle';
  if (/food|meal|hotel|hospitality|catering/i.test(s)) return 'food';
  if (/guest\s*house\s*rent|house\s*rent|rent/i.test(s)) return 'rent';
  if (/guest\s*house\s*elect|electricity/i.test(s)) return 'guest_electricity';
  if (/house\s*keeping|housekeeping|manpower\s*supply/i.test(s)) return 'housekeeping';
  if (/cmms|it\s*service|software/i.test(s)) return 'it_cmms';
  if (/shutdown|project\s*work/i.test(s)) return 'manpower_shutdown';
  if (/consultancy|scientific|technical|statutory|calibration/i.test(s)) return 'consultancy';
  return 'other';
}

/**
 * Determine GST split based on vendor state code
 */
export function getGstSplit(vendorStateCode: string, category: ServiceCategory, gstRegistered: boolean) {
  if (!gstRegistered) return { gstPct: 0, cgst: 0, sgst: 0, igst: 0, type: 'none' as const };

  let gstPct = 18;
  if (category === 'food') gstPct = 5;

  const isIntraState = vendorStateCode === '21'; // Odisha
  if (isIntraState) {
    return { gstPct, cgst: gstPct / 2, sgst: gstPct / 2, igst: 0, type: 'intra' as const };
  }
  return { gstPct, cgst: 0, sgst: 0, igst: gstPct, type: 'inter' as const };
}

interface CalcParams {
  serviceType: string;
  vendorStateCode: string;
  gstRegistered: boolean;
  monthlyHire: number;
  totalKm?: number;
  mileageRate?: number; // km per liter
  avgDieselPrice?: number;
  penalty?: number;
  // Crane specific
  totalHours?: number;
  dieselPerHour?: number;
  nonAvailHours?: number;
  // Food specific
  totalMeals?: number;
  mealCost?: number;
  // Housekeeping
  mandays?: number;
  mandayRate?: number;
  supervisorDays?: number;
  supervisorRate?: number;
  workerAllowance?: number;
  workerCount?: number;
  // IT/CMMS
  months?: number;
  monthlyRate?: number;
  // Shutdown
  marginPct?: number;
  // Rent
  fixedRent?: number;
  // Electricity
  actualBill?: number;
}

/**
 * Calculate billing based on service category
 */
export function calculateBilling(params: CalcParams): BillingCalculation {
  const category = classifyService(params.serviceType);
  const gst = getGstSplit(params.vendorStateCode, category, params.gstRegistered);
  const breakdown: string[] = [];
  let basicValue = 0;

  switch (category) {
    case 'bus':
    case 'vehicle': {
      const totalKm = params.totalKm || 0;
      const mileageRate = params.mileageRate || 8; // default 8 km/liter
      const dieselLiters = totalKm / mileageRate;
      const dieselCost = dieselLiters * (params.avgDieselPrice || 90);
      const penalty = params.penalty || 0;
      basicValue = params.monthlyHire - penalty + dieselCost;
      breakdown.push(`Monthly Hire: ₹${params.monthlyHire.toLocaleString('en-IN')}`);
      breakdown.push(`Total KM: ${totalKm} ÷ Mileage Rate: ${mileageRate} = ${dieselLiters.toFixed(2)} liters`);
      breakdown.push(`Diesel Cost: ${dieselLiters.toFixed(2)} × ₹${params.avgDieselPrice || 90} = ₹${dieselCost.toFixed(2)}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty.toLocaleString('en-IN')}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'camper_fixed': {
      const penalty = params.penalty || 0;
      basicValue = params.monthlyHire - penalty;
      breakdown.push(`Monthly Hire (all-inclusive): ₹${params.monthlyHire.toLocaleString('en-IN')}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty.toLocaleString('en-IN')}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'crane': {
      const totalHours = params.totalHours || 0;
      const dieselPerHour = params.dieselPerHour || 15;
      const dieselLiters = totalHours * dieselPerHour;
      const dieselCost = dieselLiters * (params.avgDieselPrice || 90);
      const nonAvailPenalty = (params.nonAvailHours || 0) * 1500;
      const penalty = (params.penalty || 0) + nonAvailPenalty;
      basicValue = params.monthlyHire + dieselCost - penalty;
      breakdown.push(`Monthly Hire: ₹${params.monthlyHire.toLocaleString('en-IN')}`);
      breakdown.push(`Operating Hours: ${totalHours} × ${dieselPerHour} L/hr = ${dieselLiters} liters`);
      breakdown.push(`Diesel Cost: ${dieselLiters} × ₹${params.avgDieselPrice || 90} = ₹${dieselCost.toFixed(2)}`);
      if (nonAvailPenalty) breakdown.push(`Non-availability Penalty: ${params.nonAvailHours} hrs × ₹1500 = -₹${nonAvailPenalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'palfinger_hydra': {
      const totalKm = params.totalKm || 0;
      const mileageRate = params.mileageRate || 5;
      const dieselLiters = totalKm / mileageRate;
      const dieselCost = dieselLiters * (params.avgDieselPrice || 90);
      const penalty = params.penalty || 0;
      basicValue = params.monthlyHire + dieselCost - penalty;
      breakdown.push(`Monthly Hire: ₹${params.monthlyHire.toLocaleString('en-IN')}`);
      breakdown.push(`Total KM: ${totalKm} ÷ ${mileageRate} = ${dieselLiters.toFixed(2)} liters`);
      breakdown.push(`Diesel Cost: ₹${dieselCost.toFixed(2)}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'food': {
      const totalMeals = params.totalMeals || 0;
      const mealCost = params.mealCost || 65;
      const penalty = params.penalty || 0;
      basicValue = (totalMeals * mealCost) - penalty;
      breakdown.push(`Total Meals: ${totalMeals} × ₹${mealCost}/plate = ₹${(totalMeals * mealCost).toLocaleString('en-IN')}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'housekeeping': {
      const mandays = params.mandays || 0;
      const rate = params.mandayRate || 880;
      const supDays = params.supervisorDays || 0;
      const supRate = params.supervisorRate || 950;
      const workers = params.workerCount || 0;
      const allowance = params.workerAllowance || 500;
      const penalty = params.penalty || 0;
      basicValue = (mandays * rate) + (supDays * supRate) + (workers * allowance) - penalty;
      breakdown.push(`Mandays: ${mandays} × ₹${rate} = ₹${(mandays * rate).toLocaleString('en-IN')}`);
      if (supDays) breakdown.push(`Supervisor: ${supDays} × ₹${supRate} = ₹${(supDays * supRate).toLocaleString('en-IN')}`);
      if (workers) breakdown.push(`Worker Allowance: ${workers} × ₹${allowance} = ₹${(workers * allowance).toLocaleString('en-IN')}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'it_cmms': {
      const months = params.months || 1;
      const monthlyRate = params.monthlyRate || 27500;
      const penalty = params.penalty || 0;
      basicValue = (months * monthlyRate) - penalty;
      breakdown.push(`${months} month(s) × ₹${monthlyRate.toLocaleString('en-IN')} = ₹${(months * monthlyRate).toLocaleString('en-IN')}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'manpower_shutdown': {
      const mandays = params.mandays || 0;
      const rate = params.mandayRate || 880;
      const margin = params.marginPct || 15;
      const penalty = params.penalty || 0;
      const base = mandays * rate;
      basicValue = base * (1 + margin / 100) - penalty;
      breakdown.push(`Mandays: ${mandays} × ₹${rate} = ₹${base.toLocaleString('en-IN')}`);
      breakdown.push(`+ ${margin}% margin = ₹${(base * (1 + margin / 100)).toFixed(2)}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'rent': {
      const fixedRent = params.fixedRent || params.monthlyHire || 0;
      const penalty = params.penalty || 0;
      basicValue = fixedRent - penalty;
      breakdown.push(`Fixed Rent: ₹${fixedRent.toLocaleString('en-IN')}`);
      if (penalty) breakdown.push(`Penalty: -₹${penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)} (GST inclusive per PO)`);
      break;
    }
    case 'guest_electricity': {
      basicValue = (params.actualBill || params.monthlyHire || 0) - (params.penalty || 0);
      breakdown.push(`Actual Bill: ₹${(params.actualBill || params.monthlyHire || 0).toLocaleString('en-IN')}`);
      if (params.penalty) breakdown.push(`Penalty: -₹${params.penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
    case 'consultancy':
    default: {
      basicValue = params.monthlyHire - (params.penalty || 0);
      breakdown.push(`Service Value: ₹${params.monthlyHire.toLocaleString('en-IN')}`);
      if (params.penalty) breakdown.push(`Penalty: -₹${params.penalty}`);
      breakdown.push(`Basic Value: ₹${basicValue.toFixed(2)}`);
      break;
    }
  }

  const totalGst = basicValue * (gst.gstPct / 100);
  const invoiceValue = basicValue + totalGst;

  breakdown.push(`GST (${gst.gstPct}%): ₹${totalGst.toFixed(2)}`);
  if (gst.type === 'intra') {
    breakdown.push(`  CGST ${gst.cgst}%: ₹${(basicValue * gst.cgst / 100).toFixed(2)}`);
    breakdown.push(`  SGST ${gst.sgst}%: ₹${(basicValue * gst.sgst / 100).toFixed(2)}`);
  } else if (gst.type === 'inter') {
    breakdown.push(`  IGST ${gst.igst}%: ₹${totalGst.toFixed(2)}`);
  }
  breakdown.push(`Invoice Value: ₹${invoiceValue.toFixed(2)}`);

  return {
    category,
    monthlyHire: params.monthlyHire,
    totalKm: params.totalKm,
    mileageRate: params.mileageRate,
    dieselLiters: category === 'crane' ? (params.totalHours || 0) * (params.dieselPerHour || 15) : (params.totalKm || 0) / (params.mileageRate || 8),
    avgDieselPrice: params.avgDieselPrice,
    dieselCost: category === 'crane' ? (params.totalHours || 0) * (params.dieselPerHour || 15) * (params.avgDieselPrice || 90) : ((params.totalKm || 0) / (params.mileageRate || 8)) * (params.avgDieselPrice || 90),
    penalty: params.penalty,
    basicValue,
    gstPercentage: gst.gstPct,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    totalGst,
    invoiceValue,
    breakdown,
  };
}

/**
 * Convert number to Indian English words (Lakh/Crore system)
 */
export function numToWords(amount: number): string {
  if (amount === 0) return 'Rupees Zero Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const numToWordsHelper = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numToWordsHelper(n % 100) : '');
    if (n < 100000) return numToWordsHelper(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWordsHelper(n % 1000) : '');
    if (n < 10000000) return numToWordsHelper(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWordsHelper(n % 100000) : '');
    return numToWordsHelper(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWordsHelper(n % 10000000) : '');
  };

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let result = 'Rupees ' + numToWordsHelper(rupees);
  if (paise > 0) result += ' and ' + numToWordsHelper(paise) + ' Paise';
  return result + ' Only';
}

/**
 * Format number in Indian currency format (₹1,23,456.78)
 */
export function formatIndianCurrency(amount: number): string {
  const parts = amount.toFixed(2).split('.');
  let intPart = parts[0];
  const decPart = parts[1];
  const isNeg = intPart.startsWith('-');
  if (isNeg) intPart = intPart.slice(1);

  if (intPart.length <= 3) return (isNeg ? '-' : '') + '₹' + intPart + '.' + decPart;

  const last3 = intPart.slice(-3);
  let remaining = intPart.slice(0, -3);
  const groups: string[] = [];
  while (remaining.length > 2) {
    groups.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining) groups.unshift(remaining);

  return (isNeg ? '-' : '') + '₹' + groups.join(',') + ',' + last3 + '.' + decPart;
}

/**
 * Normalize month string to "MMM'YYYY" format
 */
export function normalizeMonth(raw: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Try "YYYY-MM" or "MM/YYYY"
  let match = raw.match(/(\d{4})[\/\-](\d{1,2})/);
  if (match) return months[parseInt(match[2]) - 1] + "'" + match[1];

  match = raw.match(/(\d{1,2})[\/\-](\d{4})/);
  if (match) return months[parseInt(match[1]) - 1] + "'" + match[2];

  // Try "May'2025" or "may-2025"
  match = raw.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*['\-\s]*(\d{4})/i);
  if (match) {
    const idx = months.findIndex(m => m.toLowerCase() === match![1].toLowerCase().slice(0, 3));
    return months[idx] + "'" + match[2];
  }

  return raw;
}
