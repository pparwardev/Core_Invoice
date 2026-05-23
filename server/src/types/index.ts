// ============================================================
// Core-Invoice — Complete TypeScript Types
// ============================================================

export interface BillingPeriod {
  month: number;
  year: number;
}

export type Section = 'REFINERY' | 'POWER-ENGINEERING SERVICE' | 'POWER-MMD';
export type BillingStatus = 'draft' | 'log_sheet_done' | 'invoice_done' | 'wcr_done' | 'finalized';
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'hold';
export type BillingStep = 'log_sheet' | 'invoice' | 'wcr';
export type DocumentType = 'logsheet' | 'po' | 'invoice' | 'wcr' | 'eway' | 'other';

// Service category classification
export type ServiceCategory =
  | 'crane' | 'palfinger_hydra' | 'bus' | 'camper_fixed' | 'vehicle'
  | 'food' | 'rent' | 'guest_electricity' | 'housekeeping'
  | 'it_cmms' | 'manpower_shutdown' | 'consultancy' | 'other';

// --- Auth ---
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface RegisterInput { name: string; email: string; password: string; }
export interface LoginInput { email: string; password: string; }
export interface AuthToken { token: string; user: { id: number; name: string; email: string }; }

// --- Company ---
export interface CompanyInfo {
  id: number;
  name: string;
  gstin?: string;
  pan?: string;
  state?: string;
  stateCode?: string;
  address?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  hsnVehicle?: string;
  hsnFood?: string;
  hsnService?: string;
}

// --- Vendor ---
export interface Vendor {
  id: number;
  name: string;
  vendorCode?: string;
  serviceType: string;
  serviceSubtype?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  gstRegistered: boolean;
  vendorType: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  seatingCapacity?: number;
  isActive: boolean;
  sections: { id: number; name: string; code: string }[];
  purchaseOrders?: PurchaseOrder[];
  createdAt: Date;
}

export interface VendorFilter {
  section?: string;
  serviceType?: string;
  searchTerm?: string;
  status?: 'active' | 'inactive' | 'all';
}

// --- Purchase Order ---
export interface PurchaseOrder {
  id: number;
  vendorId: number;
  poNumber: string;
  poDate?: string;
  validityDate?: string;
  poValue: number;
  serviceDescription?: string;
  isDieselPo: boolean;
  totalBilled?: number;
  utilizationPct?: number;
  remaining?: number;
  monthsOfBudgetLeft?: number;
}

// --- Billing ---
export interface BillingRecord {
  id: number;
  vendorId: number;
  purchaseOrderId: number;
  sectionId: number;
  billingPeriodMonth: number;
  billingPeriodYear: number;
  status: BillingStatus;
  paymentStatus: PaymentStatus;
  deductionAmount: number;
  deductionRemarks?: string;
  paidAmount?: number;
  utrDetails?: string;
  paymentDate?: string;
  remarks?: string;
  finalized: boolean;
}

export interface WizardState {
  currentStep: BillingStep | 'not_started' | 'completed';
  completedSteps: BillingStep[];
  logSheetId?: number;
  invoiceId?: number;
  wcrId?: number;
  billingRecordId?: number;
}

// --- Log Sheet ---
export interface LogSheet {
  id: number;
  billingRecordId: number;
  periodStart: string;
  periodEnd: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  deviceName?: string;
  totalMileageKm?: number;
  agreedKm?: number;
  totalDays?: number;
  totalBreakdownDays?: number;
  monthStartingKm?: number;
  monthEndingKm?: number;
  entries: LogEntry[];
}

export interface LogEntry {
  id?: number;
  logSheetId?: number;
  entryDate: string;
  deviceName?: string;
  routeDescription?: string;
  startingKm?: number;
  endingKm?: number;
  totalKm?: number;
  remark?: string;
}

export interface LogSheetInput {
  periodStart: string;
  periodEnd: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  deviceName?: string;
  agreedKm?: number;
  entries: LogEntry[];
  purchaseOrderId: number;
  sectionId: number;
}

// --- Invoice ---
export interface Invoice {
  id: number;
  billingRecordId: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceReceiptDate?: string;
  nature: string;
  basicValue: number;
  gstPercentage: number;
  gstAmount: number;
  invoiceValue: number;
  hsnSacCode?: string;
  billedToName?: string;
  billedToAddress?: string;
  consigneeAddress?: string;
  placeOfSupply?: string;
  lineItems: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  id?: number;
  invoiceId?: number;
  srNo: number;
  description: string;
  hsnSac?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount: number;
  isDiesel: boolean;
  dieselRate?: number;
  dieselLitres?: number;
}

export interface InvoiceInput {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceReceiptDate?: string;
  nature?: string;
  gstPercentage?: number;
  hsnSacCode?: string;
  billedToName?: string;
  billedToAddress?: string;
  consigneeAddress?: string;
  placeOfSupply?: string;
  deductionAmount?: number;
  deductionRemarks?: string;
  lineItems: InvoiceLineItem[];
}

// --- WCR ---
export interface WorkCompletionReport {
  id: number;
  billingRecordId: number;
  reportDate: string;
  documentRef: string;
  revision: string;
  siteName?: string;
  location?: string;
  clientName?: string;
  workSummary: string;
  invoiceReference?: string;
  invoiceValue?: number;
  amountInWords?: string;
  modeOfDelivery: string;
  documentsEnclosed?: string;
  signatories: WcrSignatory[];
}

export interface WcrSignatory {
  id?: number;
  wcrId?: number;
  role: string;
  name?: string;
  signOrder: number;
}

export interface WcrInput {
  reportDate: string;
  siteName?: string;
  location?: string;
  clientName?: string;
  workSummary?: string;
  modeOfDelivery?: string;
  documentsEnclosed?: string;
  signatories?: WcrSignatory[];
}

// --- Diesel ---
export interface DieselPurchase {
  id: number;
  purchaseDate: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  billNumber?: string;
  pumpName?: string;
  month: number;
  year: number;
}

export interface DieselMonthlyAverage {
  month: number;
  year: number;
  totalLiters: number;
  totalCost: number;
  weightedAvgPrice: number;
}

// --- Documents ---
export interface UploadedDocument {
  id: number;
  fileName: string;
  filePath?: string;
  fileType: DocumentType;
  fileSize?: number;
  vendorId?: number;
  vendorName?: string;
  month?: string;
  department?: string;
  status: 'processing' | 'mapped' | 'error';
  extractedData?: string;
  summary?: string;
  uploadedAt: Date;
}

// --- Dashboard ---
export interface DashboardStats {
  totalVendors: number;
  activeVendors: number;
  totalBilledThisMonth: number;
  totalPaidThisMonth: number;
  pendingBills: number;
  poExpiryAlerts: number;
  budgetWarnings: number;
  departmentBreakdown: { section: string; vendorCount: number; totalBilled: number }[];
  recentActivity: { id: number; description: string; date: string; type: string }[];
}

// --- Billing Calculation ---
export interface BillingCalculation {
  category: ServiceCategory;
  monthlyHire: number;
  totalKm?: number;
  mileageRate?: number;
  dieselLiters?: number;
  avgDieselPrice?: number;
  dieselCost?: number;
  penalty?: number;
  basicValue: number;
  gstPercentage: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalGst: number;
  invoiceValue: number;
  breakdown: string[];
}

// --- Validation ---
export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string; expectedFormat?: string }[];
}
