import { computed, ref, watch } from 'vue';
import { createSeedData } from '../data/seedData';
import {
  Batch,
  CashMovement,
  Customer,
  HeldSale,
  PaymentBreakdown,
  PaymentMethod,
  Product,
  Promotion,
  PurchaseOrder,
  Sale,
  SaleItem,
  Shift,
  StaffMember,
  StockMovement,
  StockMovementType,
  StoreSettings,
  StoreState,
} from '../types/pos';
import { allocateFEFO, getTodayDateStr, toKHR } from '../utils/fefo';

const STORAGE_KEY = 'kiri_atelier_pos_v1';

export interface CompleteSaleInput {
  items: Omit<SaleItem, 'batchDeductions'>[];
  customerId?: string;
  promoDiscountUSD: number;
  voucherCode?: string;
  voucherDiscountUSD: number;
  pointsRedeemed: number;
  pointsDiscountUSD: number;
  paymentMethod: PaymentMethod;
  payment: PaymentBreakdown;
  notes?: string;
}

function loadInitialState(): StoreState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.batches)) {
        if (Array.isArray(parsed.staff)) {
          parsed.staff = parsed.staff.map((m: Record<string, unknown>) => ({
            ...m,
            role: m.role === 'owner' ? 'admin' : m.role,
          }));
        }
        return parsed as StoreState;
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return createSeedData();
}

const state = ref<StoreState>(loadInitialState());

watch(
  state,
  (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } catch {
      // ignore quota errors
    }
  },
  { deep: true }
);

export function useStore() {
  const activeStaff = computed<StaffMember>(() => {
    return (
      state.value.staff.find((s) => s.id === state.value.activeStaffId && s.active) ||
      state.value.staff.find((s) => s.active) ||
      state.value.staff[0]
    );
  });

  const currentShift = computed<Shift | undefined>(() => {
    return state.value.shifts.find((s) => s.status === 'open');
  });

  const completeSale = (
    input: CompleteSaleInput
  ): { ok: boolean; sale?: Sale; error?: string } => {
    const today = getTodayDateStr();
    const shift = currentShift.value;
    if (!shift) {
      return { ok: false, error: 'Please open a cashier shift before completing sales.' };
    }

    const updatedBatches = state.value.batches.map((b) => ({ ...b }));
    const finalItems: SaleItem[] = [];
    const newMovements: StockMovement[] = [];
    const receiptNo = `INV-${new Date().getFullYear()}-${String(
      1001 + state.value.sales.length
    ).padStart(4, '0')}`;

    for (const item of input.items) {
      const alloc = allocateFEFO(updatedBatches, item.productId, item.qty, today);
      if (!alloc.ok) {
        return {
          ok: false,
          error: `${item.productName}: ${alloc.reason}`,
        };
      }
      for (const d of alloc.deductions) {
        const batch = updatedBatches.find((b) => b.id === d.batchId);
        if (batch) {
          batch.shelfQty -= d.qty;
          newMovements.push({
            id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date().toISOString(),
            productId: item.productId,
            productName: item.productName,
            batchNumber: d.batchNumber,
            type: 'sale_fefo',
            qtyDelta: -d.qty,
            location: 'shelf',
            reference: receiptNo,
            staffName: activeStaff.value.name,
          });
        }
      }
      finalItems.push({
        ...item,
        batchDeductions: alloc.deductions,
      });
    }

    const subtotalUSD = Number(
      finalItems.reduce((sum, i) => sum + i.lineTotalUSD, 0).toFixed(2)
    );
    const totalDiscounts =
      input.promoDiscountUSD + input.voucherDiscountUSD + input.pointsDiscountUSD;
    const netBeforeTax = Math.max(0, subtotalUSD - totalDiscounts);
    const taxUSD = state.value.settings.taxInclusive
      ? 0
      : Number((netBeforeTax * (state.value.settings.taxRatePercent / 100)).toFixed(2));
    const totalUSD = Number((netBeforeTax + taxUSD).toFixed(2));
    const totalKHR = toKHR(totalUSD, state.value.settings.exchangeRateKHR);
    const pointsEarned = input.customerId ? Math.floor(totalUSD) : 0;

    const customer = state.value.customers.find((c) => c.id === input.customerId);

    const newSale: Sale = {
      id: `sale-${Date.now()}`,
      receiptNo,
      createdAt: new Date().toISOString(),
      cashierId: activeStaff.value.id,
      cashierName: activeStaff.value.name,
      shiftId: shift.id,
      customerId: customer?.id,
      customerName: customer?.name,
      items: finalItems,
      subtotalUSD,
      promoDiscountUSD: input.promoDiscountUSD,
      voucherCode: input.voucherCode,
      voucherDiscountUSD: input.voucherDiscountUSD,
      pointsRedeemed: input.pointsRedeemed,
      pointsDiscountUSD: input.pointsDiscountUSD,
      taxUSD,
      totalUSD,
      exchangeRate: state.value.settings.exchangeRateKHR,
      totalKHR,
      paymentMethod: input.paymentMethod,
      payment: input.payment,
      pointsEarned,
      status: 'completed',
      notes: input.notes,
    };

    const cashAddedUSD =
      input.payment.cashUSD + input.payment.cashKHR / state.value.settings.exchangeRateKHR;

    state.value = {
      ...state.value,
      batches: updatedBatches,
      sales: [newSale, ...state.value.sales],
      stockMovements: [...newMovements, ...state.value.stockMovements],
      shifts: state.value.shifts.map((s) =>
        s.id === shift.id
          ? { ...s, expectedCashUSD: Number((s.expectedCashUSD + cashAddedUSD).toFixed(2)) }
          : s
      ),
      customers: state.value.customers.map((c) => {
        if (c.id !== input.customerId) return c;
        const newTotalSpent = Number((c.totalSpentUSD + totalUSD).toFixed(2));
        const newPoints = Math.max(0, c.points - input.pointsRedeemed + pointsEarned);
        const newTier = newTotalSpent >= 500 ? 'VIP' : newTotalSpent >= 200 ? 'Gold' : 'Silver';
        return {
          ...c,
          points: newPoints,
          totalSpentUSD: newTotalSpent,
          visitCount: c.visitCount + 1,
          lastVisit: today,
          tier: newTier,
          vouchers: c.vouchers.map((v) =>
            v.code === input.voucherCode ? { ...v, used: true } : v
          ),
        };
      }),
    };

    return { ok: true, sale: newSale };
  };

  const holdSale = (held: Omit<HeldSale, 'id' | 'heldAt'>) => {
    const newHeld: HeldSale = {
      ...held,
      id: `held-${Date.now()}`,
      heldAt: new Date().toISOString(),
    };
    state.value.heldSales = [newHeld, ...state.value.heldSales];
  };

  const removeHeldSale = (id: string) => {
    state.value.heldSales = state.value.heldSales.filter((h) => h.id !== id);
  };

  const processReturn = (
    saleId: string,
    returns: { productId: string; qty: number; reason: string; restock: boolean }[]
  ): { ok: boolean; refundUSD: number; error?: string } => {
    const sale = state.value.sales.find((s) => s.id === saleId);
    if (!sale) return { ok: false, refundUSD: 0, error: 'Sale not found.' };
    if (returns.length === 0) return { ok: false, refundUSD: 0, error: 'No return items selected.' };

    let refundUSD = 0;
    const updatedBatches = state.value.batches.map((b) => ({ ...b }));
    const newMovements: StockMovement[] = [];

    for (const r of returns) {
      const saleItem = sale.items.find((i) => i.productId === r.productId);
      if (!saleItem || r.qty <= 0 || r.qty > saleItem.qty) continue;
      const perUnitRefund = saleItem.lineTotalUSD / saleItem.qty;
      refundUSD += perUnitRefund * r.qty;

      if (r.restock) {
        const targetBatchId = saleItem.batchDeductions[0]?.batchId;
        const batch =
          updatedBatches.find((b) => b.id === targetBatchId) ||
          updatedBatches.find((b) => b.productId === r.productId);
        if (batch) {
          batch.shelfQty += r.qty;
          newMovements.push({
            id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date().toISOString(),
            productId: saleItem.productId,
            productName: saleItem.productName,
            batchNumber: batch.batchNumber,
            type: 'return_restock',
            qtyDelta: r.qty,
            location: 'shelf',
            reference: `RET-${sale.receiptNo}`,
            staffName: activeStaff.value.name,
          });
        }
      }
    }

    refundUSD = Number(refundUSD.toFixed(2));
    const totalSaleUnits = sale.items.reduce((s, i) => s + i.qty, 0);
    const totalReturnedUnits = returns.reduce((s, r) => s + r.qty, 0);
    const newStatus = totalReturnedUnits >= totalSaleUnits ? 'returned' : 'partial_return';
    const shift = currentShift.value;

    state.value = {
      ...state.value,
      batches: updatedBatches,
      stockMovements: [...newMovements, ...state.value.stockMovements],
      sales: state.value.sales.map((s) =>
        s.id === saleId
          ? {
              ...s,
              status: newStatus,
              returnedItems: [
                ...(s.returnedItems || []),
                ...returns.map((r) => ({
                  productId: r.productId,
                  qty: r.qty,
                  reason: r.reason,
                  restocked: r.restock,
                })),
              ],
            }
          : s
      ),
      shifts: shift
        ? state.value.shifts.map((sh) =>
            sh.id === shift.id
              ? {
                  ...sh,
                  expectedCashUSD: Math.max(0, Number((sh.expectedCashUSD - refundUSD).toFixed(2))),
                }
              : sh
          )
        : state.value.shifts,
    };

    return { ok: true, refundUSD };
  };

  const openShift = (cashierId: string, openingCashUSD: number, openingCashKHR: number) => {
    const cashier = state.value.staff.find((s) => s.id === cashierId) || activeStaff.value;
    const totalOpeningUSD = Number(
      (openingCashUSD + openingCashKHR / state.value.settings.exchangeRateKHR).toFixed(2)
    );
    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      cashierId: cashier.id,
      cashierName: cashier.name,
      openedAt: new Date().toISOString(),
      openingCashUSD,
      openingCashKHR,
      expectedCashUSD: totalOpeningUSD,
      status: 'open',
    };
    state.value.shifts = [newShift, ...state.value.shifts];
  };

  const addCashMovement = (
    type: 'in' | 'out',
    amountUSD: number,
    amountKHR: number,
    reason: string
  ) => {
    const shift = currentShift.value;
    if (!shift) return;
    const deltaUSD = amountUSD + amountKHR / state.value.settings.exchangeRateKHR;
    const cm: CashMovement = {
      id: `cm-${Date.now()}`,
      shiftId: shift.id,
      type,
      amountUSD,
      amountKHR,
      reason,
      createdAt: new Date().toISOString(),
      staffName: activeStaff.value.name,
    };
    state.value.cashMovements = [cm, ...state.value.cashMovements];
    state.value.shifts = state.value.shifts.map((s) =>
      s.id === shift.id
        ? {
            ...s,
            expectedCashUSD: Number(
              (s.expectedCashUSD + (type === 'in' ? deltaUSD : -deltaUSD)).toFixed(2)
            ),
          }
        : s
    );
  };

  const closeShift = (countedCashUSD: number, notes?: string) => {
    const shift = currentShift.value;
    if (!shift) return;
    const varianceUSD = Number((countedCashUSD - shift.expectedCashUSD).toFixed(2));
    state.value.shifts = state.value.shifts.map((s) =>
      s.id === shift.id
        ? {
            ...s,
            closedAt: new Date().toISOString(),
            countedCashUSD,
            varianceUSD,
            status: 'closed',
            notes,
          }
        : s
    );
  };

  const addProduct = (productInput: Omit<Product, 'id'>): Product => {
    const newProd: Product = {
      ...productInput,
      id: `prod-${Date.now()}`,
    };
    state.value.products = [newProd, ...state.value.products];
    return newProd;
  };

  const updateProduct = (product: Product) => {
    state.value.products = state.value.products.map((p) => (p.id === product.id ? product : p));
  };

  const receiveBatch = (input: {
    productId: string;
    batchNumber: string;
    expiryDate: string;
    qty: number;
    location: 'shelf' | 'backroom';
    costPerUnit: number;
    supplierId: string;
    reference?: string;
  }) => {
    const product = state.value.products.find((p) => p.id === input.productId);
    const newBatch: Batch = {
      id: `bat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: input.productId,
      batchNumber: input.batchNumber,
      expiryDate: input.expiryDate,
      receivedDate: getTodayDateStr(),
      shelfQty: input.location === 'shelf' ? input.qty : 0,
      backroomQty: input.location === 'backroom' ? input.qty : 0,
      costPerUnit: input.costPerUnit,
      supplierId: input.supplierId,
    };
    const mv: StockMovement = {
      id: `sm-${Date.now()}`,
      createdAt: new Date().toISOString(),
      productId: input.productId,
      productName: product?.name || 'Product',
      batchNumber: input.batchNumber,
      type: 'stock_in',
      qtyDelta: input.qty,
      location: input.location,
      reference: input.reference || 'Direct Stock-In',
      staffName: activeStaff.value.name,
    };
    state.value.batches = [newBatch, ...state.value.batches];
    state.value.stockMovements = [mv, ...state.value.stockMovements];
  };

  const transferBackroomToShelf = (batchId: string, qty: number) => {
    const batch = state.value.batches.find((b) => b.id === batchId);
    if (!batch || qty <= 0 || batch.backroomQty < qty) return;
    const product = state.value.products.find((p) => p.id === batch.productId);
    const mv: StockMovement = {
      id: `sm-${Date.now()}`,
      createdAt: new Date().toISOString(),
      productId: batch.productId,
      productName: product?.name || 'Product',
      batchNumber: batch.batchNumber,
      type: 'transfer_to_shelf',
      qtyDelta: qty,
      location: 'shelf',
      reference: 'Backroom → Shelf',
      staffName: activeStaff.value.name,
    };
    state.value.batches = state.value.batches.map((b) =>
      b.id === batchId
        ? { ...b, backroomQty: b.backroomQty - qty, shelfQty: b.shelfQty + qty }
        : b
    );
    state.value.stockMovements = [mv, ...state.value.stockMovements];
  };

  const commitStocktake = (counts: { productId: string; countedShelfQty: number }[]) => {
    const today = getTodayDateStr();
    const updatedBatches = state.value.batches.map((b) => ({ ...b }));
    const newMovements: StockMovement[] = [];

    for (const c of counts) {
      const product = state.value.products.find((p) => p.id === c.productId);
      const validBatches = updatedBatches
        .filter((b) => b.productId === c.productId && b.expiryDate > today)
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      const currentShelf = validBatches.reduce((sum, b) => sum + b.shelfQty, 0);
      const delta = c.countedShelfQty - currentShelf;
      if (delta === 0) continue;

      if (validBatches.length > 0) {
        if (delta > 0) {
          validBatches[validBatches.length - 1].shelfQty += delta;
          newMovements.push({
            id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date().toISOString(),
            productId: c.productId,
            productName: product?.name || '',
            batchNumber: validBatches[validBatches.length - 1].batchNumber,
            type: 'stocktake_adjust',
            qtyDelta: delta,
            location: 'shelf',
            reference: `Stocktake ${today}`,
            staffName: activeStaff.value.name,
          });
        } else {
          let toDeduct = Math.abs(delta);
          for (const b of validBatches) {
            if (toDeduct <= 0) break;
            const take = Math.min(b.shelfQty, toDeduct);
            if (take > 0) {
              b.shelfQty -= take;
              toDeduct -= take;
              newMovements.push({
                id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                createdAt: new Date().toISOString(),
                productId: c.productId,
                productName: product?.name || '',
                batchNumber: b.batchNumber,
                type: 'stocktake_adjust',
                qtyDelta: -take,
                location: 'shelf',
                reference: `Stocktake ${today}`,
                staffName: activeStaff.value.name,
              });
            }
          }
        }
      }
    }

    if (newMovements.length > 0) {
      state.value.batches = updatedBatches;
      state.value.stockMovements = [...newMovements, ...state.value.stockMovements];
    }
  };

  const adjustStock = (input: {
    batchId: string;
    location: 'shelf' | 'backroom';
    qtyDelta: number;
    type: StockMovementType;
    reason: string;
  }) => {
    const batch = state.value.batches.find((b) => b.id === input.batchId);
    if (!batch || input.qtyDelta === 0) return;
    const product = state.value.products.find((p) => p.id === batch.productId);
    const mv: StockMovement = {
      id: `sm-${Date.now()}`,
      createdAt: new Date().toISOString(),
      productId: batch.productId,
      productName: product?.name || '',
      batchNumber: batch.batchNumber,
      type: input.type,
      qtyDelta: input.qtyDelta,
      location: input.location,
      reference: input.reason,
      staffName: activeStaff.value.name,
    };
    state.value.batches = state.value.batches.map((b) => {
      if (b.id !== input.batchId) return b;
      if (input.location === 'shelf') {
        return { ...b, shelfQty: Math.max(0, b.shelfQty + input.qtyDelta) };
      }
      return { ...b, backroomQty: Math.max(0, b.backroomQty + input.qtyDelta) };
    });
    state.value.stockMovements = [mv, ...state.value.stockMovements];
  };

  const createPurchaseOrder = (po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt'>) => {
    const poNumber = `PO-${new Date().getFullYear()}-${String(
      42 + state.value.purchaseOrders.length
    ).padStart(3, '0')}`;
    const newPO: PurchaseOrder = {
      ...po,
      id: `po-${Date.now()}`,
      poNumber,
      createdAt: getTodayDateStr(),
    };
    state.value.purchaseOrders = [newPO, ...state.value.purchaseOrders];
    state.value.suppliers = state.value.suppliers.map((s) =>
      s.id === po.supplierId
        ? { ...s, balanceOwedUSD: Number((s.balanceOwedUSD + po.totalCostUSD).toFixed(2)) }
        : s
    );
  };

  const receivePurchaseOrder = (
    poId: string,
    batchDetails: {
      productId: string;
      batchNumber: string;
      expiryDate: string;
      qtyReceived: number;
    }[]
  ) => {
    const po = state.value.purchaseOrders.find((p) => p.id === poId);
    if (!po) return;

    const newBatches: Batch[] = [];
    const newMovements: StockMovement[] = [];

    for (const det of batchDetails) {
      if (det.qtyReceived <= 0) continue;
      const prod = state.value.products.find((p) => p.id === det.productId);
      const poItem = po.items.find((i) => i.productId === det.productId);
      newBatches.push({
        id: `bat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: det.productId,
        batchNumber: det.batchNumber,
        expiryDate: det.expiryDate,
        receivedDate: getTodayDateStr(),
        shelfQty: 0,
        backroomQty: det.qtyReceived,
        costPerUnit: poItem?.unitCostUSD || prod?.costPrice || 0,
        supplierId: po.supplierId,
      });
      newMovements.push({
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        productId: det.productId,
        productName: prod?.name || '',
        batchNumber: det.batchNumber,
        type: 'stock_in',
        qtyDelta: det.qtyReceived,
        location: 'backroom',
        reference: po.poNumber,
        staffName: activeStaff.value.name,
      });
    }

    state.value.batches = [...newBatches, ...state.value.batches];
    state.value.stockMovements = [...newMovements, ...state.value.stockMovements];
    state.value.purchaseOrders = state.value.purchaseOrders.map((p) =>
      p.id === poId
        ? {
            ...p,
            status: 'received',
            items: p.items.map((item) => {
              const rec = batchDetails.find((d) => d.productId === item.productId);
              return rec ? { ...item, qtyReceived: rec.qtyReceived } : item;
            }),
          }
        : p
    );
  };

  const recordSupplierPayment = (poId: string, amountUSD: number) => {
    const po = state.value.purchaseOrders.find((p) => p.id === poId);
    if (!po || amountUSD <= 0) return;
    state.value.purchaseOrders = state.value.purchaseOrders.map((p) =>
      p.id === poId
        ? { ...p, paidUSD: Math.min(p.totalCostUSD, Number((p.paidUSD + amountUSD).toFixed(2))) }
        : p
    );
    state.value.suppliers = state.value.suppliers.map((s) =>
      s.id === po.supplierId
        ? { ...s, balanceOwedUSD: Math.max(0, Number((s.balanceOwedUSD - amountUSD).toFixed(2))) }
        : s
    );
  };

  const addCustomer = (
    custInput: Omit<Customer, 'id' | 'points' | 'totalSpentUSD' | 'visitCount' | 'vouchers' | 'tier'>
  ): Customer => {
    const newCust: Customer = {
      ...custInput,
      id: `cust-${Date.now()}`,
      tier: 'Silver',
      points: 20,
      totalSpentUSD: 0,
      visitCount: 0,
      vouchers: [],
    };
    state.value.customers = [newCust, ...state.value.customers];
    return newCust;
  };

  const logReminderSent = (customerId: string, productId: string, channel: 'Telegram' | 'SMS') => {
    state.value.reminderLogs = [
      {
        id: `rem-${Date.now()}`,
        customerId,
        productId,
        sentAt: new Date().toISOString(),
        channel,
      },
      ...state.value.reminderLogs,
    ];
  };

  const issueCustomerVoucher = (
    customerId: string,
    title: string,
    discountUSD: number,
    minSpendUSD: number
  ) => {
    const code = `KIRI${Math.floor(100 + Math.random() * 900)}`;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    state.value.customers = state.value.customers.map((c) =>
      c.id === customerId
        ? {
            ...c,
            vouchers: [
              ...c.vouchers,
              {
                code,
                title,
                discountUSD,
                minSpendUSD,
                expiryDate: expiry.toISOString().slice(0, 10),
                used: false,
              },
            ],
          }
        : c
    );
  };

  const addPromotion = (promo: Omit<Promotion, 'id'>) => {
    state.value.promotions = [{ ...promo, id: `promo-${Date.now()}` }, ...state.value.promotions];
  };

  const togglePromotion = (promoId: string) => {
    state.value.promotions = state.value.promotions.map((p) =>
      p.id === promoId ? { ...p, active: !p.active } : p
    );
  };

  const updateSettings = (settingsPatch: Partial<StoreSettings>) => {
    state.value.settings = { ...state.value.settings, ...settingsPatch };
  };

  const setActiveStaff = (staffId: string) => {
    state.value.activeStaffId = staffId;
  };

  const addStaffMember = (input: {
    name: string;
    role: StaffMember['role'];
    pin: string;
  }): StaffMember => {
    const newMember: StaffMember = {
      id: `staff-${Date.now()}`,
      name: input.name.trim(),
      role: input.role,
      pin: input.pin.trim(),
      active: true,
    };
    state.value.staff = [...state.value.staff, newMember];
    return newMember;
  };

  const updateStaffMember = (staffId: string, patch: Partial<Omit<StaffMember, 'id'>>) => {
    state.value.staff = state.value.staff.map((s) =>
      s.id === staffId ? { ...s, ...patch } : s
    );
  };

  const verifyStaffPin = (
    pin: string,
    allowedRoles?: StaffMember['role'][]
  ): StaffMember | null => {
    const match = state.value.staff.find(
      (s) =>
        s.active &&
        s.pin === pin.trim() &&
        (!allowedRoles || allowedRoles.includes(s.role))
    );
    return match || null;
  };

  const importBackupJSON = (json: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.batches)) {
        return { ok: false, error: 'Invalid backup structure.' };
      }
      state.value = parsed;
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not parse JSON file.' };
    }
  };

  const resetDemoData = () => {
    const fresh = createSeedData();
    state.value = fresh;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  };

  return {
    state,
    activeStaff,
    currentShift,
    completeSale,
    holdSale,
    removeHeldSale,
    processReturn,
    openShift,
    addCashMovement,
    closeShift,
    addProduct,
    updateProduct,
    receiveBatch,
    transferBackroomToShelf,
    commitStocktake,
    adjustStock,
    createPurchaseOrder,
    receivePurchaseOrder,
    recordSupplierPayment,
    addCustomer,
    logReminderSent,
    issueCustomerVoucher,
    addPromotion,
    togglePromotion,
    updateSettings,
    setActiveStaff,
    addStaffMember,
    updateStaffMember,
    verifyStaffPin,
    importBackupJSON,
    resetDemoData,
  };
}
