import { Batch, BatchDeduction, LanguageMode, Product, Promotion, SaleItem } from '../types/pos';

export function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(dateStr: string, refDateStr: string = getTodayDateStr()): number {
  const target = new Date(dateStr + 'T00:00:00Z').getTime();
  const ref = new Date(refDateStr + 'T00:00:00Z').getTime();
  return Math.round((target - ref) / (1000 * 60 * 60 * 24));
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function toKHR(amountUSD: number, exchangeRate: number): number {
  // Cambodia retail rounds KHR to nearest 100 Riel
  return Math.round((amountUSD * exchangeRate) / 100) * 100;
}

export function formatKHR(amountKHR: number): string {
  return `${amountKHR.toLocaleString('en-US')} ៛`;
}

export function formatDualCurrency(amountUSD: number, exchangeRate: number): string {
  return `${formatUSD(amountUSD)} · ${formatKHR(toKHR(amountUSD, exchangeRate))}`;
}

export interface ProductStockSummary {
  shelfQty: number;
  backroomQty: number;
  totalSellableQty: number;
  expiredShelfQty: number;
  expiredBackroomQty: number;
  nearestExpiryDate: string | null;
  nearestExpiryDays: number | null;
  isExpiredOnly: boolean;
  activeBatches: Batch[];
  expiredBatches: Batch[];
}

export function getProductStockSummary(
  batches: Batch[],
  productId: string,
  todayStr: string = getTodayDateStr()
): ProductStockSummary {
  const productBatches = batches.filter((b) => b.productId === productId);
  const activeBatches: Batch[] = [];
  const expiredBatches: Batch[] = [];

  for (const b of productBatches) {
    const d = daysUntil(b.expiryDate, todayStr);
    if (d <= 0) {
      expiredBatches.push(b);
    } else {
      activeBatches.push(b);
    }
  }

  activeBatches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  expiredBatches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const shelfQty = activeBatches.reduce((sum, b) => sum + b.shelfQty, 0);
  const backroomQty = activeBatches.reduce((sum, b) => sum + b.backroomQty, 0);
  const expiredShelfQty = expiredBatches.reduce((sum, b) => sum + b.shelfQty, 0);
  const expiredBackroomQty = expiredBatches.reduce((sum, b) => sum + b.backroomQty, 0);

  const sellableActive = activeBatches.filter((b) => b.shelfQty > 0 || b.backroomQty > 0);
  const nearest = sellableActive[0] || null;

  return {
    shelfQty,
    backroomQty,
    totalSellableQty: shelfQty + backroomQty,
    expiredShelfQty,
    expiredBackroomQty,
    nearestExpiryDate: nearest ? nearest.expiryDate : null,
    nearestExpiryDays: nearest ? daysUntil(nearest.expiryDate, todayStr) : null,
    isExpiredOnly: shelfQty === 0 && backroomQty === 0 && (expiredShelfQty > 0 || expiredBackroomQty > 0),
    activeBatches,
    expiredBatches,
  };
}

export interface FEFOAllocationResult {
  ok: boolean;
  reason?: string;
  deductions: BatchDeduction[];
  remainingQty: number;
}

/**
 * FEFO (First-Expired, First-Out) allocator for POS counter sales.
 * Strictly blocks expired batches (expiryDate <= todayStr) and deducts from
 * the earliest valid shelf batch first.
 */
export function allocateFEFO(
  batches: Batch[],
  productId: string,
  requestedQty: number,
  todayStr: string = getTodayDateStr()
): FEFOAllocationResult {
  if (requestedQty <= 0) {
    return { ok: false, reason: 'Quantity must be greater than zero.', deductions: [], remainingQty: requestedQty };
  }

  const productBatches = batches.filter((b) => b.productId === productId);
  const validShelfBatches = productBatches
    .filter((b) => daysUntil(b.expiryDate, todayStr) > 0 && b.shelfQty > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const totalShelfAvailable = validShelfBatches.reduce((sum, b) => sum + b.shelfQty, 0);

  if (totalShelfAvailable === 0) {
    const hasExpired = productBatches.some((b) => daysUntil(b.expiryDate, todayStr) <= 0 && b.shelfQty > 0);
    const hasBackroom = productBatches.some((b) => daysUntil(b.expiryDate, todayStr) > 0 && b.backroomQty > 0);
    if (hasExpired) {
      return {
        ok: false,
        reason: 'Blocked: Available batch is expired and cannot be sold at POS.',
        deductions: [],
        remainingQty: requestedQty,
      };
    }
    if (hasBackroom) {
      return {
        ok: false,
        reason: 'Shelf stock is 0. Restock from back-room in Inventory first.',
        deductions: [],
        remainingQty: requestedQty,
      };
    }
    return {
      ok: false,
      reason: 'Out of stock on shelf.',
      deductions: [],
      remainingQty: requestedQty,
    };
  }

  if (totalShelfAvailable < requestedQty) {
    return {
      ok: false,
      reason: `Only ${totalShelfAvailable} non-expired unit(s) available on shelf.`,
      deductions: [],
      remainingQty: requestedQty - totalShelfAvailable,
    };
  }

  let remaining = requestedQty;
  const deductions: BatchDeduction[] = [];

  for (const batch of validShelfBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.shelfQty, remaining);
    deductions.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      qty: take,
    });
    remaining -= take;
  }

  return {
    ok: true,
    deductions,
    remainingQty: 0,
  };
}

export function calculateActivePromotionsDiscount(
  items: SaleItem[],
  products: Product[],
  promotions: Promotion[],
  todayStr: string = getTodayDateStr()
): { promoDiscountUSD: number; appliedPromoNames: string[] } {
  let promoDiscountUSD = 0;
  const appliedPromoNames: string[] = [];

  const activePromos = promotions.filter(
    (p) => p.active && p.startDate <= todayStr && p.endDate >= todayStr
  );

  for (const promo of activePromos) {
    if (promo.type === 'percent_category' && promo.targetCategory && promo.discountPercent) {
      let categoryDiscount = 0;
      for (const item of items) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod && prod.category === promo.targetCategory) {
          categoryDiscount += item.lineTotalUSD * (promo.discountPercent / 100);
        }
      }
      if (categoryDiscount > 0) {
        promoDiscountUSD += categoryDiscount;
        appliedPromoNames.push(`${promo.name} (-${promo.discountPercent}%)`);
      }
    } else if (promo.type === 'bogo' && promo.targetCategory) {
      let bogoUnits: number[] = [];
      for (const item of items) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod && prod.category === promo.targetCategory) {
          for (let i = 0; i < item.qty; i++) {
            bogoUnits.push(item.unitPrice);
          }
        }
      }
      if (bogoUnits.length >= 2) {
        bogoUnits.sort((a, b) => a - b);
        const freeCount = Math.floor(bogoUnits.length / 2);
        let bogoDisc = 0;
        for (let i = 0; i < freeCount; i++) {
          bogoDisc += bogoUnits[i];
        }
        if (bogoDisc > 0) {
          promoDiscountUSD += bogoDisc;
          appliedPromoNames.push(promo.name);
        }
      }
    } else if (promo.type === 'bundle' && promo.targetProductIds && promo.bundlePriceUSD) {
      const hasAll = promo.targetProductIds.every((pid) =>
        items.some((item) => item.productId === pid && item.qty >= 1)
      );
      if (hasAll) {
        const regularSum = promo.targetProductIds.reduce((sum, pid) => {
          const prod = products.find((p) => p.id === pid);
          return sum + (prod ? prod.retailPrice : 0);
        }, 0);
        const diff = Math.max(0, regularSum - promo.bundlePriceUSD);
        if (diff > 0) {
          promoDiscountUSD += diff;
          appliedPromoNames.push(promo.name);
        }
      }
    }
  }

  return {
    promoDiscountUSD: Number(promoDiscountUSD.toFixed(2)),
    appliedPromoNames,
  };
}

const LABELS: Record<string, { en: string; km: string }> = {
  pos: { en: 'POS Counter', km: 'បញ្ជរលក់' },
  dashboard: { en: 'Dashboard', km: 'ផ្ទាំងគ្រប់គ្រង' },
  shifts: { en: 'Cash & Shifts', km: 'វេន និងសាច់ប្រាក់' },
  products: { en: 'Products', km: 'ផលិតផល' },
  inventory: { en: 'Inventory', km: 'ស្តុកហាង' },
  purchasing: { en: 'Purchasing', km: 'ការបញ្ជាទិញ' },
  customers: { en: 'Customers', km: 'អតិថិជន' },
  promotions: { en: 'Promotions', km: 'ប្រូម៉ូសិន' },
  reports: { en: 'Reports', km: 'របាយការណ៍' },
  settings: { en: 'Settings', km: 'ការកំណត់' },
  checkout: { en: 'Checkout', km: 'គិតប្រាក់' },
  subtotal: { en: 'Subtotal', km: 'សរុបបណ្តោះអាសន្ន' },
  discount: { en: 'Discount', km: 'បញ្ចុះតម្លៃ' },
  total: { en: 'Total', km: 'សរុបរួម' },
  receipt: { en: 'Receipt', km: 'វិក្កយបត្រ' },
  cash: { en: 'Cash', km: 'សាច់ប្រាក់' },
  card: { en: 'Card', km: 'កាត' },
  abaQr: { en: 'ABA KHQR', km: 'ស្កេន ABA KHQR' },
  split: { en: 'Split', km: 'បង់ចម្រុះ' },
  change: { en: 'Change', km: 'ប្រាក់អាប់' },
  thankYou: { en: 'Thank you for glowing with us!', km: 'សូមអរគុណសម្រាប់ការទិញទំនិញ!' },
};

export function tr(key: string, lang: LanguageMode): string {
  const entry = LABELS[key];
  if (!entry) return key;
  if (lang === 'km') return entry.km;
  if (lang === 'bilingual') return `${entry.en} · ${entry.km}`;
  return entry.en;
}
