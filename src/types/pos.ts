export type ModuleId =
  | 'pos'
  | 'dashboard'
  | 'shifts'
  | 'products'
  | 'inventory'
  | 'purchasing'
  | 'customers'
  | 'promotions'
  | 'reports'
  | 'settings';

export type LanguageMode = 'en' | 'km' | 'bilingual';

export type ProductCategory =
  | 'Cleanser'
  | 'Serum'
  | 'Sunscreen'
  | 'Moisturizer'
  | 'Toner'
  | 'Set';

export type SkinConcern =
  | 'Hydration'
  | 'Acne'
  | 'Brightening'
  | 'Anti-Aging'
  | 'Sensitive'
  | 'SPF Protection';

export interface Product {
  id: string;
  name: string;
  nameKm: string;
  brand: string;
  sku: string;
  barcode: string;
  category: ProductCategory;
  variant: string; // e.g. "30ml", "50ml / SPF 50+"
  concerns: SkinConcern[];
  retailPrice: number; // USD
  costPrice: number; // USD
  reorderLevel: number;
  usageDays: number; // Estimated days until customer finishes bottle (for repurchase reminders)
  image: string;
  allergens?: string[]; // e.g., ['Fragrance', 'Niacinamide', 'Salicylic Acid']
  active?: boolean;
}

export interface Batch {
  id: string;
  productId: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  receivedDate: string; // YYYY-MM-DD
  shelfQty: number;
  backroomQty: number;
  costPerUnit: number;
  supplierId: string;
}

export type PaymentMethod = 'cash' | 'card' | 'aba_qr' | 'split';

export interface PaymentBreakdown {
  cashUSD: number;
  cashKHR: number;
  cardUSD: number;
  abaQrUSD: number;
  tenderedUSD: number;
  changeUSD: number;
  abaRef?: string;
}

export interface BatchDeduction {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  qty: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  productNameKm: string;
  sku: string;
  variant: string;
  qty: number;
  unitPrice: number;
  costPrice: number;
  discountType: 'percent' | 'fixed';
  discountValue: number; // percent (0-100) or fixed USD per line
  lineDiscountUSD: number;
  lineTotalUSD: number;
  batchDeductions: BatchDeduction[];
}

export interface Sale {
  id: string;
  receiptNo: string;
  createdAt: string; // ISO string
  cashierId: string;
  cashierName: string;
  shiftId: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotalUSD: number;
  promoDiscountUSD: number;
  voucherCode?: string;
  voucherDiscountUSD: number;
  pointsRedeemed: number;
  pointsDiscountUSD: number;
  taxUSD: number;
  totalUSD: number;
  exchangeRate: number;
  totalKHR: number;
  paymentMethod: PaymentMethod;
  payment: PaymentBreakdown;
  pointsEarned: number;
  status: 'completed' | 'returned' | 'partial_return';
  returnedItems?: { productId: string; qty: number; reason: string; restocked: boolean }[];
  notes?: string;
}

export interface HeldSale {
  id: string;
  heldAt: string;
  label: string;
  customerId?: string;
  items: {
    productId: string;
    qty: number;
    discountType: 'percent' | 'fixed';
    discountValue: number;
  }[];
  voucherCode?: string;
  notes?: string;
}

export interface CashMovement {
  id: string;
  shiftId: string;
  type: 'in' | 'out';
  amountUSD: number;
  amountKHR: number;
  reason: string;
  createdAt: string;
  staffName: string;
}

export interface Shift {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCashUSD: number;
  openingCashKHR: number;
  expectedCashUSD: number;
  countedCashUSD?: number;
  varianceUSD?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export type LoyaltyTier = 'Silver' | 'Gold' | 'VIP';

export interface CustomerVoucher {
  code: string;
  title: string;
  discountUSD: number;
  minSpendUSD: number;
  expiryDate: string;
  used: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  telegram?: string;
  skinType: 'Oily' | 'Dry' | 'Combination' | 'Sensitive' | 'Normal';
  allergies: string[];
  birthday?: string; // MM-DD
  tier: LoyaltyTier;
  points: number;
  totalSpentUSD: number;
  visitCount: number;
  lastVisit?: string;
  vouchers: CustomerVoucher[];
  notes?: string;
}

export interface ReminderLog {
  id: string;
  customerId: string;
  productId: string;
  sentAt: string;
  channel: 'Telegram' | 'SMS';
}

export interface Promotion {
  id: string;
  name: string;
  nameKm: string;
  type: 'percent_category' | 'bogo' | 'bundle' | 'cart_percent';
  targetCategory?: ProductCategory;
  targetProductIds?: string[];
  discountPercent?: number;
  bundlePriceUSD?: number;
  minQty?: number;
  code?: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  telegram: string;
  leadTimeDays: number;
  balanceOwedUSD: number;
}

export interface PurchaseOrderItem {
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostUSD: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  expectedDate: string;
  status: 'draft' | 'ordered' | 'received';
  items: PurchaseOrderItem[];
  totalCostUSD: number;
  paidUSD: number;
  notes?: string;
}

export type StockMovementType =
  | 'sale_fefo'
  | 'stock_in'
  | 'transfer_to_shelf'
  | 'stocktake_adjust'
  | 'damage_writeoff'
  | 'expired_writeoff'
  | 'tester_sample'
  | 'return_restock';

export interface StockMovement {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  batchNumber: string;
  type: StockMovementType;
  qtyDelta: number;
  location: 'shelf' | 'backroom';
  reference: string;
  staffName: string;
}

export type StaffRole = 'cashier' | 'manager' | 'admin';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  pin: string;
  active: boolean;
}

export interface StoreSettings {
  storeName: string;
  storeNameKm: string;
  branchAddress: string;
  phone: string;
  exchangeRateKHR: number; // e.g., 4100
  taxRatePercent: number; // e.g., 10 or 0 (VAT included or exclusive)
  taxInclusive: boolean;
  language: LanguageMode;
  abaMerchantId: string;
  abaMerchantName: string;
  receiptFooterEn: string;
  receiptFooterKm: string;
  hardware: {
    scannerMode: 'keyboard_wedge' | 'usb_hid';
    printerWidth: '80mm' | '58mm';
    autoOpenDrawer: boolean;
  };
}

export interface StoreState {
  products: Product[];
  batches: Batch[];
  sales: Sale[];
  heldSales: HeldSale[];
  shifts: Shift[];
  cashMovements: CashMovement[];
  customers: Customer[];
  reminderLogs: ReminderLog[];
  promotions: Promotion[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  staff: StaffMember[];
  activeStaffId: string;
  settings: StoreSettings;
}
