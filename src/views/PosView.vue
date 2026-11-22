<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AlertTriangle,
  Barcode,
  Check,
  CreditCard,
  PauseCircle,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-vue-next';
import ProductImage from '../components/ProductImage.vue';
import ReceiptModal from '../components/ReceiptModal.vue';
import UserSwitchModal from '../components/UserSwitchModal.vue';
import { useStore } from '../composables/useStore';
import {
  Customer,
  PaymentBreakdown,
  PaymentMethod,
  Product,
  ProductCategory,
  Sale,
  SaleItem,
  SkinConcern,
} from '../types/pos';
import {
  allocateFEFO,
  calculateActivePromotionsDiscount,
  formatKHR,
  formatUSD,
  getProductStockSummary,
  getTodayDateStr,
  toKHR,
  tr,
} from '../utils/fefo';
import { canApproveReturnsOrHighDiscount } from '../utils/permissions';

interface CartLine {
  productId: string;
  qty: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
}

const props = withDefaults(
  defineProps<{
    shortcutsDisabled?: boolean;
  }>(),
  { shortcutsDisabled: false }
);

const CATEGORIES: ('All' | 'Best Sellers' | ProductCategory)[] = [
  'All',
  'Best Sellers',
  'Cleanser',
  'Serum',
  'Sunscreen',
  'Moisturizer',
  'Toner',
  'Set',
];

const CONCERNS: ('All' | SkinConcern)[] = [
  'All',
  'Hydration',
  'Acne',
  'Brightening',
  'Anti-Aging',
  'Sensitive',
  'SPF Protection',
];

const {
  state,
  activeStaff,
  currentShift,
  completeSale,
  holdSale,
  removeHeldSale,
  processReturn,
  addCustomer,
} = useStore();

const hasManagerPrivilege = computed(() =>
  canApproveReturnsOrHighDiscount(activeStaff.value.role)
);

const today = getTodayDateStr();
const rate = computed(() => state.value.settings.exchangeRateKHR);
const lang = computed(() => state.value.settings.language);

// Catalog filters & scan
const scanInput = ref('');
const category = ref<'All' | 'Best Sellers' | ProductCategory>('All');
const concern = ref<'All' | SkinConcern>('All');
const alertBanner = ref<{ type: 'error' | 'info'; text: string } | null>(null);

// Cart state
const cart = ref<CartLine[]>([]);
const selectedCustomerId = ref('');
const voucherCode = ref('');
const redeemPoints = ref(0);

// Modals
const showNewCustomer = ref(false);
const newCustName = ref('');
const newCustPhone = ref('');
const newCustSkin = ref<Customer['skinType']>('Normal');
const newCustAllergy = ref('');

const showHeldModal = ref(false);
const showReturnModal = ref(false);
const showPayModal = ref(false);
const showOverrideModal = ref(false);
const discountOverrideApproved = ref(false);
const completedReceipt = ref<Sale | null>(null);

// Payment modal state
const payMethod = ref<PaymentMethod>('cash');
const cashTenderUSD = ref('');
const cashTenderKHR = ref('0');
const splitCardUSD = ref('0');
const splitAbaUSD = ref('0');
const abaRef = ref('ABA-KHQR-CONFIRMED');

// Return modal state
const returnSearch = ref('');
const selectedReturnSaleId = ref(state.value.sales[0]?.id || '');
const returnQtys = ref<Record<string, number>>({});
const returnRestock = ref(true);
const returnReason = ref('Unopened skin sensitivity exchange');

const searchInputRef = ref<HTMLInputElement | null>(null);
const customerSelectRef = ref<HTMLSelectElement | null>(null);

function showNotice(type: 'error' | 'info', text: string) {
  alertBanner.value = { type, text };
  setTimeout(() => {
    if (alertBanner.value?.text === text) {
      alertBanner.value = null;
    }
  }, 4500);
}

function clearCart() {
  if (cart.value.length === 0 && !selectedCustomerId.value && !voucherCode.value) return;
  cart.value = [];
  selectedCustomerId.value = '';
  voucherCode.value = '';
  redeemPoints.value = 0;
  discountOverrideApproved.value = false;
  showNotice('info', 'Cart cleared.');
}

const bestSellerIds = computed(() => {
  const counts: Record<string, number> = {};
  for (const s of state.value.sales) {
    for (const i of s.items) {
      counts[i.productId] = (counts[i.productId] || 0) + i.qty;
    }
  }
  return new Set(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id)
  );
});

const filteredProducts = computed(() => {
  const q = scanInput.value.trim().toLowerCase();
  return state.value.products.filter((p) => {
    if (p.active === false) return false;
    if (category.value === 'Best Sellers' && !bestSellerIds.value.has(p.id)) return false;
    if (
      category.value !== 'All' &&
      category.value !== 'Best Sellers' &&
      p.category !== category.value
    )
      return false;
    if (concern.value !== 'All' && !p.concerns.includes(concern.value)) return false;
    if (q) {
      const hay = `${p.name} ${p.nameKm} ${p.sku} ${p.barcode} ${p.brand}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

function getStock(productId: string) {
  return getProductStockSummary(state.value.batches, productId, today);
}

function getInCartQty(productId: string) {
  return cart.value.find((c) => c.productId === productId)?.qty || 0;
}

function addToCart(product: Product) {
  const existingQty = getInCartQty(product.id);
  const requestedQty = existingQty + 1;
  const alloc = allocateFEFO(state.value.batches, product.id, requestedQty, today);

  if (!alloc.ok) {
    showNotice('error', `${product.name}: ${alloc.reason}`);
    return;
  }

  const idx = cart.value.findIndex((c) => c.productId === product.id);
  if (idx >= 0) {
    cart.value[idx] = { ...cart.value[idx], qty: cart.value[idx].qty + 1 };
  } else {
    cart.value.push({
      productId: product.id,
      qty: 1,
      discountType: 'percent',
      discountValue: 0,
    });
  }
}

function handleBarcodeEnter() {
  const q = scanInput.value.trim().toLowerCase();
  if (!q) return;
  const exact = state.value.products.find(
    (p) => p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q
  );
  const target = exact || filteredProducts.value[0];
  if (target) {
    addToCart(target);
    scanInput.value = '';
  } else {
    showNotice('error', `No product found matching "${scanInput.value}".`);
  }
}

function updateCartQty(productId: string, delta: number) {
  const prod = state.value.products.find((p) => p.id === productId);
  const current = cart.value.find((c) => c.productId === productId);
  if (!current || !prod) return;
  const nextQty = current.qty + delta;
  if (nextQty <= 0) {
    cart.value = cart.value.filter((c) => c.productId !== productId);
    return;
  }
  if (delta > 0) {
    const alloc = allocateFEFO(state.value.batches, productId, nextQty, today);
    if (!alloc.ok) {
      showNotice('error', `${prod.name}: ${alloc.reason}`);
      return;
    }
  }
  cart.value = cart.value.map((c) =>
    c.productId === productId ? { ...c, qty: nextQty } : c
  );
}

function updateLineDiscount(
  productId: string,
  discountType: 'percent' | 'fixed',
  discountValue: number
) {
  let cleanVal = Math.max(0, isNaN(discountValue) ? 0 : discountValue);
  if (!hasManagerPrivilege.value && !discountOverrideApproved.value) {
    if (discountType === 'percent' && cleanVal > 10) {
      cleanVal = 10;
      showNotice(
        'error',
        'Cashier discounts are capped at 10%. Sign in as Manager or Admin for higher.'
      );
    } else if (discountType === 'fixed') {
      const prod = state.value.products.find((p) => p.id === productId);
      const lineQty = cart.value.find((c) => c.productId === productId)?.qty || 1;
      const maxFixed = prod ? Number((prod.retailPrice * lineQty * 0.1).toFixed(2)) : 5;
      if (cleanVal > maxFixed) {
        cleanVal = maxFixed;
        showNotice('error', `Cashier fixed discount capped at 10% (${formatUSD(maxFixed)}).`);
      }
    }
  }
  cart.value = cart.value.map((c) =>
    c.productId === productId ? { ...c, discountType, discountValue: cleanVal } : c
  );
}

const selectedCustomer = computed(() =>
  state.value.customers.find((c) => c.id === selectedCustomerId.value)
);

watch(selectedCustomerId, () => {
  redeemPoints.value = 0;
  voucherCode.value = '';
});

const computedCart = computed(() => {
  const items: SaleItem[] = [];
  for (const line of cart.value) {
    const prod = state.value.products.find((p) => p.id === line.productId);
    if (!prod) continue;
    const gross = prod.retailPrice * line.qty;
    const lineDiscountUSD =
      line.discountType === 'percent'
        ? Number(((gross * Math.min(100, line.discountValue)) / 100).toFixed(2))
        : Number(Math.min(gross, line.discountValue).toFixed(2));
    const lineTotalUSD = Number(Math.max(0, gross - lineDiscountUSD).toFixed(2));
    const alloc = allocateFEFO(state.value.batches, prod.id, line.qty, today);

    items.push({
      productId: prod.id,
      productName: prod.name,
      productNameKm: prod.nameKm,
      sku: prod.sku,
      variant: prod.variant,
      qty: line.qty,
      unitPrice: prod.retailPrice,
      costPrice: prod.costPrice,
      discountType: line.discountType,
      discountValue: line.discountValue,
      lineDiscountUSD,
      lineTotalUSD,
      batchDeductions: alloc.deductions,
    });
  }

  const subtotalUSD = Number(items.reduce((s, i) => s + i.lineTotalUSD, 0).toFixed(2));
  const { promoDiscountUSD, appliedPromoNames } = calculateActivePromotionsDiscount(
    items,
    state.value.products,
    state.value.promotions,
    today
  );

  const activeVoucher = selectedCustomer.value?.vouchers.find(
    (v) =>
      !v.used &&
      v.code.toUpperCase() === voucherCode.value.trim().toUpperCase() &&
      v.expiryDate >= today &&
      subtotalUSD >= v.minSpendUSD
  );
  const voucherDiscountUSD = activeVoucher ? activeVoucher.discountUSD : 0;

  const maxRedeemablePts = selectedCustomer.value
    ? Math.min(
        selectedCustomer.value.points,
        Math.floor(Math.max(0, subtotalUSD - promoDiscountUSD - voucherDiscountUSD) * 100)
      )
    : 0;
  const validPoints = Math.min(redeemPoints.value, maxRedeemablePts);
  const pointsDiscountUSD = Number((validPoints / 100).toFixed(2));

  const netBeforeTax = Math.max(
    0,
    subtotalUSD - promoDiscountUSD - voucherDiscountUSD - pointsDiscountUSD
  );
  const taxUSD = state.value.settings.taxInclusive
    ? 0
    : Number((netBeforeTax * (state.value.settings.taxRatePercent / 100)).toFixed(2));
  const totalUSD = Number((netBeforeTax + taxUSD).toFixed(2));
  const totalKHR = toKHR(totalUSD, rate.value);

  return {
    items,
    subtotalUSD,
    promoDiscountUSD,
    appliedPromoNames,
    activeVoucher,
    voucherDiscountUSD,
    validPoints,
    pointsDiscountUSD,
    taxUSD,
    totalUSD,
    totalKHR,
  };
});

const allergyConflicts = computed(() => {
  if (!selectedCustomer.value || selectedCustomer.value.allergies.length === 0) return [];
  const warnings: string[] = [];
  for (const line of cart.value) {
    const prod = state.value.products.find((p) => p.id === line.productId);
    if (!prod?.allergens) continue;
    const hit = prod.allergens.filter((a) =>
      selectedCustomer.value!.allergies.some((ca) => ca.toLowerCase() === a.toLowerCase())
    );
    if (hit.length > 0) {
      warnings.push(`${prod.name} contains ${hit.join(', ')}`);
    }
  }
  return warnings;
});

function openCheckout() {
  if (cart.value.length === 0) return;
  if (!currentShift.value) {
    showNotice('error', 'No cashier shift is open. Open a shift in Cash & Shifts first.');
    return;
  }
  payMethod.value = 'cash';
  cashTenderUSD.value = computedCart.value.totalUSD.toFixed(2);
  cashTenderKHR.value = '0';
  splitCardUSD.value = '0';
  splitAbaUSD.value = '0';
  abaRef.value = `ABA-${Math.floor(100000 + Math.random() * 899999)}`;
  showPayModal.value = true;
}

function handleConfirmPayment() {
  const total = computedCart.value.totalUSD;
  const usdIn = parseFloat(cashTenderUSD.value) || 0;
  const khrIn = parseFloat(cashTenderKHR.value) || 0;
  const cashEquivalentUSD = usdIn + khrIn / rate.value;

  let paymentBreakdown: PaymentBreakdown = {
    cashUSD: 0,
    cashKHR: 0,
    cardUSD: 0,
    abaQrUSD: 0,
    tenderedUSD: total,
    changeUSD: 0,
  };

  if (payMethod.value === 'cash') {
    if (cashEquivalentUSD + 0.005 < total) {
      showNotice('error', 'Cash tendered is less than the total due.');
      return;
    }
    const changeUSD = Math.max(0, Number((cashEquivalentUSD - total).toFixed(2)));
    paymentBreakdown = {
      cashUSD: Number(Math.min(total, usdIn).toFixed(2)),
      cashKHR: khrIn > 0 && usdIn < total ? khrIn : 0,
      cardUSD: 0,
      abaQrUSD: 0,
      tenderedUSD: Number(cashEquivalentUSD.toFixed(2)),
      changeUSD,
    };
  } else if (payMethod.value === 'card') {
    paymentBreakdown = {
      cashUSD: 0,
      cashKHR: 0,
      cardUSD: total,
      abaQrUSD: 0,
      tenderedUSD: total,
      changeUSD: 0,
    };
  } else if (payMethod.value === 'aba_qr') {
    paymentBreakdown = {
      cashUSD: 0,
      cashKHR: 0,
      cardUSD: 0,
      abaQrUSD: total,
      tenderedUSD: total,
      changeUSD: 0,
      abaRef: abaRef.value.trim() || 'ABA-KHQR',
    };
  } else if (payMethod.value === 'split') {
    const cardAmt = parseFloat(splitCardUSD.value) || 0;
    const abaAmt = parseFloat(splitAbaUSD.value) || 0;
    const sumSplit = cashEquivalentUSD + cardAmt + abaAmt;
    if (sumSplit + 0.005 < total) {
      showNotice('error', 'Split payment amounts do not cover total due.');
      return;
    }
    const changeUSD = Math.max(0, Number((sumSplit - total).toFixed(2)));
    paymentBreakdown = {
      cashUSD: Number(usdIn.toFixed(2)),
      cashKHR: khrIn,
      cardUSD: Number(cardAmt.toFixed(2)),
      abaQrUSD: Number(abaAmt.toFixed(2)),
      tenderedUSD: Number(sumSplit.toFixed(2)),
      changeUSD,
      abaRef: abaAmt > 0 ? abaRef.value.trim() || 'ABA-SPLIT' : undefined,
    };
  }

  const res = completeSale({
    items: computedCart.value.items.map(({ batchDeductions: _bd, ...rest }) => rest),
    customerId: selectedCustomerId.value || undefined,
    promoDiscountUSD: computedCart.value.promoDiscountUSD,
    voucherCode: computedCart.value.activeVoucher?.code,
    voucherDiscountUSD: computedCart.value.voucherDiscountUSD,
    pointsRedeemed: computedCart.value.validPoints,
    pointsDiscountUSD: computedCart.value.pointsDiscountUSD,
    paymentMethod: payMethod.value,
    payment: paymentBreakdown,
  });

  if (!res.ok || !res.sale) {
    showNotice('error', res.error || 'Checkout failed.');
    return;
  }

  showPayModal.value = false;
  cart.value = [];
  selectedCustomerId.value = '';
  voucherCode.value = '';
  redeemPoints.value = 0;
  completedReceipt.value = res.sale;
}

function handleHoldCurrentSale() {
  if (cart.value.length === 0) return;
  holdSale({
    label: selectedCustomer.value
      ? selectedCustomer.value.name
      : `Walk-in (${cart.value.length} items)`,
    customerId: selectedCustomerId.value || undefined,
    items: cart.value.map((c) => ({ ...c })),
    voucherCode: voucherCode.value || undefined,
  });
  cart.value = [];
  selectedCustomerId.value = '';
  voucherCode.value = '';
  redeemPoints.value = 0;
  showNotice('info', 'Sale parked to Held Orders.');
}

function handleResumeHeld(heldId: string) {
  const h = state.value.heldSales.find((x) => x.id === heldId);
  if (!h) return;
  cart.value = h.items.map((i) => ({ ...i }));
  selectedCustomerId.value = h.customerId || '';
  voucherCode.value = h.voucherCode || '';
  removeHeldSale(heldId);
  showHeldModal.value = false;
}

function handleCreateQuickCustomer() {
  if (!newCustName.value.trim() || !newCustPhone.value.trim()) return;
  const created = addCustomer({
    name: newCustName.value.trim(),
    phone: newCustPhone.value.trim(),
    skinType: newCustSkin.value,
    allergies: newCustAllergy.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });
  selectedCustomerId.value = created.id;
  showNewCustomer.value = false;
  newCustName.value = '';
  newCustPhone.value = '';
  newCustAllergy.value = '';
  showNotice('info', `Added member ${created.name} (+20 welcome points).`);
}

const matchingReturnSales = computed(() => {
  const q = returnSearch.value.trim().toLowerCase();
  return state.value.sales
    .filter((s) => s.status !== 'returned')
    .filter(
      (s) =>
        !q ||
        s.receiptNo.toLowerCase().includes(q) ||
        (s.customerName || '').toLowerCase().includes(q)
    )
    .slice(0, 12);
});

const activeReturnSale = computed(
  () =>
    state.value.sales.find((s) => s.id === selectedReturnSaleId.value) ||
    matchingReturnSales.value[0]
);

function handleConfirmReturn() {
  if (!activeReturnSale.value) return;
  const list = Object.entries(returnQtys.value)
    .filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({
      productId,
      qty,
      reason: returnReason.value,
      restock: returnRestock.value,
    }));
  const res = processReturn(activeReturnSale.value.id, list);
  if (!res.ok) {
    showNotice('error', res.error || 'Could not process return.');
    return;
  }
  showReturnModal.value = false;
  returnQtys.value = {};
  showNotice(
    'info',
    `Return processed for ${activeReturnSale.value.receiptNo} (${formatUSD(res.refundUSD)} refunded).`
  );
}

const cashTenderTotalUSD = computed(
  () => (parseFloat(cashTenderUSD.value) || 0) + (parseFloat(cashTenderKHR.value) || 0) / rate.value
);
const cashChangeUSD = computed(() => Math.max(0, cashTenderTotalUSD.value - computedCart.value.totalUSD));

const splitTotalCoveredUSD = computed(
  () =>
    (parseFloat(cashTenderUSD.value) || 0) +
    (parseFloat(cashTenderKHR.value) || 0) / rate.value +
    (parseFloat(splitCardUSD.value) || 0) +
    (parseFloat(splitAbaUSD.value) || 0)
);

const cashPresets = computed(() => [
  { label: 'Exact', usd: computedCart.value.totalUSD.toFixed(2), khr: '0' },
  { label: '$20', usd: '20', khr: '0' },
  { label: '$50', usd: '50', khr: '0' },
  { label: '$100', usd: '100', khr: '0' },
  { label: 'Exact KHR', usd: '0', khr: String(computedCart.value.totalKHR) },
]);

const payMethods = [
  { id: 'cash' as const, label: 'Cash', icon: Wallet },
  { id: 'aba_qr' as const, label: 'ABA KHQR', icon: QrCode },
  { id: 'card' as const, label: 'Card', icon: CreditCard },
  { id: 'split' as const, label: 'Split', icon: Plus },
];

// Global keyboard shortcuts for mouse-free cashier speed
function onKeyDown(e: KeyboardEvent) {
  if (props.shortcutsDisabled) return;

  const anyModalOpen =
    Boolean(completedReceipt.value) ||
    showOverrideModal.value ||
    showPayModal.value ||
    showReturnModal.value ||
    showHeldModal.value ||
    showNewCustomer.value;

  if (e.key === 'F1') {
    e.preventDefault();
    if (!anyModalOpen) {
      searchInputRef.value?.focus();
      searchInputRef.value?.select();
    }
    return;
  }

  if (e.key === 'F2') {
    e.preventDefault();
    if (showPayModal.value) {
      handleConfirmPayment();
    } else if (!anyModalOpen) {
      if (cart.value.length > 0) {
        openCheckout();
      } else {
        showNotice('info', 'Add items to cart before opening payment (F2).');
      }
    }
    return;
  }

  if (e.key === 'F4') {
    e.preventDefault();
    if (!anyModalOpen) {
      customerSelectRef.value?.focus();
    }
    return;
  }

  if (e.key === 'F8') {
    e.preventDefault();
    if (!anyModalOpen) {
      if (cart.value.length > 0) {
        handleHoldCurrentSale();
      } else {
        showHeldModal.value = true;
      }
    }
    return;
  }

  if (e.key === 'F9') {
    e.preventDefault();
    if (!anyModalOpen) {
      if (hasManagerPrivilege.value) {
        showReturnModal.value = true;
      } else {
        showOverrideModal.value = true;
      }
    }
    return;
  }

  if (e.key === 'Escape') {
    if (completedReceipt.value) {
      e.preventDefault();
      completedReceipt.value = null;
      return;
    }
    if (showOverrideModal.value) {
      e.preventDefault();
      showOverrideModal.value = false;
      return;
    }
    if (showPayModal.value) {
      e.preventDefault();
      showPayModal.value = false;
      return;
    }
    if (showReturnModal.value) {
      e.preventDefault();
      showReturnModal.value = false;
      return;
    }
    if (showHeldModal.value) {
      e.preventDefault();
      showHeldModal.value = false;
      return;
    }
    if (showNewCustomer.value) {
      e.preventDefault();
      showNewCustomer.value = false;
      return;
    }
    if (cart.value.length > 0) {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      clearCart();
      return;
    }
    if (scanInput.value.trim()) {
      e.preventDefault();
      scanInput.value = '';
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div class="flex h-[calc(100vh-57px)] flex-col lg:flex-row">
    <!-- Left Catalog & Scan Area -->
    <div
      class="flex flex-1 flex-col overflow-hidden border-b border-zinc-200 lg:border-b-0 lg:border-r"
    >
      <!-- Top Scan & Action Bar -->
      <div class="border-b border-zinc-200 bg-white px-5 py-3.5">
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative min-w-[240px] flex-1">
            <Barcode
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            />
            <input
              ref="searchInputRef"
              type="text"
              v-model="scanInput"
              @keydown.enter="handleBarcodeEnter"
              placeholder="Scan barcode or search product, SKU... (F1)"
              class="w-full rounded-lg border border-zinc-200 bg-[#F8F8F7] py-2 pl-9 pr-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#155E4B] focus:bg-white focus:outline-none"
            />
            <button
              v-if="scanInput"
              @click="scanInput = ''"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              aria-label="Clear search"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <select
            v-model="concern"
            class="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 focus:border-[#155E4B] focus:outline-none"
            aria-label="Filter by skin concern"
          >
            <option v-for="c in CONCERNS" :key="c" :value="c">
              {{ c === 'All' ? 'All Skin Concerns' : c }}
            </option>
          </select>

          <button
            @click="showHeldModal = true"
            class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
            title="Shortcut: F8"
          >
            <PauseCircle class="h-3.5 w-3.5" />
            Held ({{ state.heldSales.length }})
            <span class="font-mono text-[10px] text-zinc-400">F8</span>
          </button>

          <button
            @click="hasManagerPrivilege ? (showReturnModal = true) : (showOverrideModal = true)"
            class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
            title="Shortcut: F9"
          >
            <RotateCcw class="h-3.5 w-3.5" />
            Returns
            <span class="font-mono text-[10px] text-zinc-400">F9</span>
          </button>
        </div>

        <!-- Category Segmented Tabs -->
        <div class="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            v-for="cat in CATEGORIES"
            :key="cat"
            @click="category = cat"
            :class="[
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0',
              category === cat
                ? 'bg-[#155E4B] text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900',
            ]"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Inline Alert Banner -->
      <div
        v-if="alertBanner"
        :class="[
          'flex items-center justify-between border-b px-5 py-2.5 text-xs font-medium',
          alertBanner.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900',
        ]"
      >
        <div class="flex items-center gap-2">
          <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
          <span>{{ alertBanner.text }}</span>
        </div>
        <button @click="alertBanner = null" class="p-0.5 hover:opacity-75">
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Product Quick-Add Grid -->
      <div class="flex-1 overflow-y-auto p-5">
        <div
          v-if="filteredProducts.length === 0"
          class="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center"
        >
          <Search class="h-7 w-7 text-zinc-300" />
          <p class="mt-2 text-sm font-medium text-zinc-800">No matching products</p>
          <p class="mt-1 text-xs text-zinc-500">
            Try clearing the barcode search or switching skin-concern filter.
          </p>
        </div>

        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <button
            v-for="product in filteredProducts"
            :key="product.id"
            @click="addToCart(product)"
            :class="[
              'group flex flex-col overflow-hidden rounded-xl border bg-white text-left transition-all',
              getStock(product.id).isExpiredOnly
                ? 'border-red-200 bg-red-50/30 hover:border-red-300'
                : getInCartQty(product.id) > 0
                ? 'border-[#155E4B] ring-1 ring-[#155E4B]/20'
                : 'border-zinc-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm',
            ]"
          >
            <div class="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
              <ProductImage
                :src="product.image"
                :alt="product.name"
                className="h-full w-full transition-transform duration-200 group-hover:scale-[1.03]"
              />
              <div
                v-if="getInCartQty(product.id) > 0"
                class="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md bg-[#155E4B] px-1.5 font-mono text-xs font-semibold text-white tabular-nums"
              >
                {{ getInCartQty(product.id) }}
              </div>
            </div>

            <div class="flex flex-1 flex-col justify-between p-3">
              <div>
                <div class="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                  <span class="truncate">{{ product.brand }} · {{ product.variant }}</span>
                  <span class="font-mono shrink-0">{{ product.sku }}</span>
                </div>
                <h4 class="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900">
                  {{ product.name }}
                </h4>
                <p v-if="lang !== 'en'" class="mt-0.5 truncate text-[11px] text-zinc-500">
                  {{ product.nameKm }}
                </p>
              </div>

              <div class="mt-3 border-t border-zinc-100 pt-2">
                <div class="flex items-baseline justify-between gap-1">
                  <span class="font-mono text-sm font-semibold text-zinc-900 tabular-nums">
                    {{ formatUSD(product.retailPrice) }}
                  </span>
                  <span class="font-mono text-[11px] text-zinc-500 tabular-nums">
                    {{ formatKHR(toKHR(product.retailPrice, rate)) }}
                  </span>
                </div>
                <div class="mt-1 flex items-center justify-between text-[11px]">
                  <span
                    v-if="getStock(product.id).isExpiredOnly"
                    class="font-medium text-red-600"
                  >
                    Expired Batch Blocked
                  </span>
                  <span
                    v-else-if="getStock(product.id).shelfQty === 0"
                    class="font-medium text-amber-700"
                  >
                    Shelf 0
                    {{
                      getStock(product.id).backroomQty > 0
                        ? `(Back: ${getStock(product.id).backroomQty})`
                        : '· Out'
                    }}
                  </span>
                  <span v-else class="text-zinc-500 tabular-nums">
                    Shelf {{ getStock(product.id).shelfQty }}
                    <span
                      v-if="
                        getStock(product.id).nearestExpiryDays !== null &&
                        getStock(product.id).nearestExpiryDays! > 0 &&
                        getStock(product.id).nearestExpiryDays! <= 30
                      "
                      class="text-amber-700"
                    >
                      · Exp {{ getStock(product.id).nearestExpiryDays }}d
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Keyboard Shortcut Bar -->
      <div
        class="hidden items-center gap-4 border-t border-zinc-200 bg-white px-5 py-2 font-mono text-[11px] text-zinc-500 sm:flex"
      >
        <span>F1 Search</span>
        <span class="text-zinc-300">·</span>
        <span>F2 Payment</span>
        <span class="text-zinc-300">·</span>
        <span>F4 Customer</span>
        <span class="text-zinc-300">·</span>
        <span>F8 Hold</span>
        <span class="text-zinc-300">·</span>
        <span>F9 Returns</span>
        <span class="text-zinc-300">·</span>
        <span>Esc Clear Cart</span>
      </div>
    </div>

    <!-- Right Cart & Checkout Panel -->
    <div class="flex w-full flex-col bg-white lg:w-[410px] xl:w-[440px]">
      <!-- Customer Lookup Bar -->
      <div class="border-b border-zinc-200 px-4 py-3">
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            />
            <select
              ref="customerSelectRef"
              v-model="selectedCustomerId"
              class="w-full appearance-none rounded-lg border border-zinc-200 bg-[#F8F8F7] py-1.5 pl-8 pr-3 text-xs font-medium text-zinc-800 focus:border-[#155E4B] focus:bg-white focus:outline-none"
              aria-label="Select customer (F4)"
            >
              <option value="">Walk-in Customer (No Loyalty)</option>
              <option v-for="c in state.customers" :key="c.id" :value="c.id">
                {{ c.name }} · {{ c.phone }} ({{ c.tier }} · {{ c.points }} pts)
              </option>
            </select>
          </div>
          <button
            @click="showNewCustomer = true"
            class="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
            title="Add new customer"
          >
            <UserPlus class="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <div
          v-if="selectedCustomer"
          class="mt-2 flex items-center justify-between text-[11px] text-zinc-600"
        >
          <span>
            {{ selectedCustomer.skinType }} skin · {{ selectedCustomer.tier }} ·
            <strong class="font-mono text-zinc-900 tabular-nums">
              {{ selectedCustomer.points }} pts
            </strong>
          </span>
          <span v-if="selectedCustomer.allergies.length > 0" class="font-medium text-amber-700">
            Allergy: {{ selectedCustomer.allergies.join(', ') }}
          </span>
        </div>

        <div
          v-if="allergyConflicts.length > 0"
          class="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-medium text-red-800"
        >
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Allergy Warning: {{ allergyConflicts.join('; ') }}</span>
        </div>
      </div>

      <!-- Cart Items List -->
      <div class="flex-1 overflow-y-auto px-4 py-3">
        <div
          v-if="computedCart.items.length === 0"
          class="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-zinc-400"
        >
          <ShoppingBag class="h-8 w-8 stroke-[1.4]" />
          <p class="mt-2 text-sm font-medium text-zinc-600">Cart is empty</p>
          <p class="mt-1 text-xs text-zinc-400">
            Scan a barcode or tap any skincare tile to start.
          </p>
        </div>

        <div v-else class="divide-y divide-zinc-100">
          <div v-for="item in computedCart.items" :key="item.productId" class="py-3 first:pt-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="truncate text-xs font-semibold text-zinc-900">
                  {{ item.productName }}
                </div>
                <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 tabular-nums">
                  <span>{{ formatUSD(item.unitPrice) }}</span>
                  <span>·</span>
                  <span class="truncate font-mono text-[10px] text-emerald-700">
                    FEFO:
                    {{ item.batchDeductions.map((d) => `${d.batchNumber} (${d.qty})`).join(', ') }}
                  </span>
                </div>
              </div>
              <div class="text-right font-mono text-xs font-semibold text-zinc-900 tabular-nums">
                {{ formatUSD(item.lineTotalUSD) }}
              </div>
            </div>

            <!-- Qty Steppers + Line Discount -->
            <div class="mt-2 flex items-center justify-between gap-2">
              <div class="flex items-center rounded-lg border border-zinc-200 bg-[#F8F8F7]">
                <button
                  @click="updateCartQty(item.productId, -1)"
                  class="px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200/60"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span class="w-7 text-center font-mono text-xs font-semibold tabular-nums">
                  {{ item.qty }}
                </span>
                <button
                  @click="updateCartQty(item.productId, 1)"
                  class="px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200/60"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <div class="flex items-center gap-1.5">
                <span class="text-[11px] text-zinc-400">Disc</span>
                <select
                  :value="item.discountType"
                  @change="
                    updateLineDiscount(
                      item.productId,
                      ($event.target as HTMLSelectElement).value as 'percent' | 'fixed',
                      item.discountValue
                    )
                  "
                  class="rounded border border-zinc-200 bg-white px-1 py-0.5 text-[11px] text-zinc-700"
                >
                  <option value="percent">%</option>
                  <option value="fixed">$</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  :value="item.discountValue || ''"
                  @input="
                    updateLineDiscount(
                      item.productId,
                      item.discountType,
                      parseFloat(($event.target as HTMLInputElement).value)
                    )
                  "
                  placeholder="0"
                  class="w-12 rounded border border-zinc-200 px-1.5 py-0.5 text-right font-mono text-[11px] tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
                <button
                  @click="updateCartQty(item.productId, -item.qty)"
                  class="ml-1 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove item"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Discounts, Vouchers & Checkout Summary -->
      <div class="border-t border-zinc-200 bg-[#F8F8F7] px-4 py-3.5">
        <div class="mb-3 space-y-2">
          <div class="flex items-center gap-2">
            <input
              type="text"
              v-model="voucherCode"
              :placeholder="
                selectedCustomer?.vouchers.some((v) => !v.used)
                  ? `Voucher (try ${selectedCustomer.vouchers.find((v) => !v.used)?.code})`
                  : 'Voucher code (optional)'
              "
              class="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-[#155E4B] focus:outline-none"
            />
            <button
              v-if="selectedCustomer && selectedCustomer.points >= 100"
              @click="
                redeemPoints =
                  redeemPoints > 0 ? 0 : Math.floor(selectedCustomer.points / 100) * 100
              "
              :class="[
                'rounded-lg border px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap',
                redeemPoints > 0
                  ? 'border-[#155E4B] bg-[#155E4B]/10 text-[#155E4B]'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
              ]"
            >
              {{ redeemPoints > 0 ? `Using ${computedCart.validPoints} pts` : 'Redeem Pts' }}
            </button>
          </div>

          <div
            v-if="computedCart.appliedPromoNames.length > 0"
            class="text-[11px] font-medium text-emerald-700"
          >
            Active Promo: {{ computedCart.appliedPromoNames.join(', ') }}
          </div>
        </div>

        <!-- Numeric Summary -->
        <div class="space-y-1 border-t border-zinc-200 pt-2.5 text-xs">
          <div class="flex justify-between text-zinc-600">
            <span>{{ tr('subtotal', lang) }}</span>
            <span class="font-mono tabular-nums">{{ formatUSD(computedCart.subtotalUSD) }}</span>
          </div>
          <div
            v-if="
              computedCart.promoDiscountUSD > 0 ||
              computedCart.voucherDiscountUSD > 0 ||
              computedCart.pointsDiscountUSD > 0
            "
            class="flex justify-between text-emerald-700"
          >
            <span>{{ tr('discount', lang) }} (Promo / Voucher / Pts)</span>
            <span class="font-mono tabular-nums">
              -{{
                formatUSD(
                  computedCart.promoDiscountUSD +
                    computedCart.voucherDiscountUSD +
                    computedCart.pointsDiscountUSD
                )
              }}
            </span>
          </div>
          <div class="flex items-baseline justify-between pt-1">
            <span class="text-sm font-semibold text-zinc-900">{{ tr('total', lang) }}</span>
            <div class="text-right">
              <div class="font-mono text-lg font-bold text-zinc-900 tabular-nums">
                {{ formatUSD(computedCart.totalUSD) }}
              </div>
              <div class="font-mono text-xs text-zinc-500 tabular-nums">
                {{ formatKHR(computedCart.totalKHR) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Primary Actions -->
        <div class="mt-3 flex items-center gap-2">
          <button
            @click="clearCart"
            :disabled="cart.length === 0"
            title="Clear Cart (Esc)"
            class="rounded-lg border border-zinc-300 bg-white px-2.5 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap"
          >
            Clear <span class="ml-0.5 font-mono text-[10px] text-zinc-400">Esc</span>
          </button>
          <button
            @click="handleHoldCurrentSale"
            :disabled="cart.length === 0"
            title="Hold Sale (F8)"
            class="rounded-lg border border-zinc-300 bg-white px-2.5 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap"
          >
            Hold <span class="ml-0.5 font-mono text-[10px] text-zinc-400">F8</span>
          </button>
          <button
            @click="openCheckout"
            :disabled="cart.length === 0"
            title="Checkout (F2)"
            class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#155E4B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F4738] disabled:opacity-40 whitespace-nowrap"
          >
            {{ tr('checkout', lang) }} · {{ formatUSD(computedCart.totalUSD) }}
            <span class="font-mono text-[11px] font-normal text-white/75">F2</span>
          </button>
        </div>
      </div>
    </div>

    <!-- PAYMENT MODAL -->
    <div
      v-if="showPayModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <div
        class="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-zinc-900">Complete Payment</h3>
            <p class="text-xs text-zinc-500 tabular-nums">
              Total Due: {{ formatUSD(computedCart.totalUSD) }} ·
              {{ formatKHR(computedCart.totalKHR) }}
            </p>
          </div>
          <button
            @click="showPayModal = false"
            class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="p-5">
          <!-- Payment Method Tabs -->
          <div class="grid grid-cols-4 gap-1.5 rounded-lg bg-zinc-100 p-1">
            <button
              v-for="m in payMethods"
              :key="m.id"
              @click="payMethod = m.id"
              :class="[
                'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors whitespace-nowrap',
                payMethod === m.id
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900',
              ]"
            >
              <component :is="m.icon" class="h-3.5 w-3.5" />
              {{ m.label }}
            </button>
          </div>

          <!-- CASH PANEL -->
          <div v-if="payMethod === 'cash'" class="mt-4 space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-zinc-600">Cash Tendered (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  v-model="cashTenderUSD"
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm font-semibold tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-600">Cash Tendered (KHR)</label>
                <input
                  type="number"
                  step="1000"
                  v-model="cashTenderKHR"
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm font-semibold tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in cashPresets"
                :key="preset.label"
                @click="
                  cashTenderUSD = preset.usd;
                  cashTenderKHR = preset.khr;
                "
                class="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              >
                {{ preset.label }}
              </button>
            </div>

            <div
              class="flex items-center justify-between rounded-lg border border-zinc-200 bg-[#F8F8F7] px-4 py-3"
            >
              <span class="text-xs font-medium text-zinc-600">Change Due (USD / KHR)</span>
              <div class="text-right font-mono">
                <div class="text-sm font-bold text-zinc-900 tabular-nums">
                  {{ formatUSD(cashChangeUSD) }}
                </div>
                <div class="text-xs text-zinc-500 tabular-nums">
                  {{ formatKHR(toKHR(cashChangeUSD, rate)) }}
                </div>
              </div>
            </div>
          </div>

          <!-- ABA KHQR PANEL -->
          <div
            v-if="payMethod === 'aba_qr'"
            class="mt-4 flex flex-col items-center rounded-xl border border-zinc-200 bg-[#F8F8F7] p-5 text-center"
          >
            <div
              class="w-full max-w-[230px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
            >
              <div class="bg-[#005E7D] py-2 text-xs font-bold tracking-wide text-white">
                KHQR · ABA PAY
              </div>
              <div class="p-4">
                <div class="text-xs font-semibold text-zinc-900">
                  {{ state.settings.abaMerchantName }}
                </div>
                <div class="mt-0.5 font-mono text-lg font-bold text-zinc-900 tabular-nums">
                  {{ formatUSD(computedCart.totalUSD) }}
                </div>
                <div class="font-mono text-xs text-zinc-500 tabular-nums">
                  {{ formatKHR(computedCart.totalKHR) }}
                </div>
                <div
                  class="mx-auto mt-3 flex h-32 w-32 items-center justify-center rounded-lg border border-zinc-200 bg-white p-2"
                >
                  <svg viewBox="0 0 100 100" class="h-full w-full text-zinc-900">
                    <rect
                      x="4"
                      y="4"
                      width="26"
                      height="26"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="6"
                    />
                    <rect x="12" y="12" width="10" height="10" fill="currentColor" />
                    <rect
                      x="70"
                      y="4"
                      width="26"
                      height="26"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="6"
                    />
                    <rect x="78" y="12" width="10" height="10" fill="currentColor" />
                    <rect
                      x="4"
                      y="70"
                      width="26"
                      height="26"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="6"
                    />
                    <rect x="12" y="78" width="10" height="10" fill="currentColor" />
                    <path
                      d="M38 6h8v8h-8zM52 6h10v8H52zM38 20h14v8H38zM58 20h6v14h-6zM6 38h10v8H6zM22 38h10v14H22zM40 38h20v20H40zM68 38h10v10H68zM84 38h10v14H84zM6 54h10v10H6zM66 54h12v8H66zM38 66h12v10H38zM56 66h10v14H56zM74 66h20v8H74zM38 82h8v12h-8zM52 86h16v8H52zM74 80h10v14H74zM88 80h6v14h-6z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div class="mt-2 font-mono text-[10px] text-zinc-400">
                  ID: {{ state.settings.abaMerchantId }}
                </div>
              </div>
            </div>

            <div class="mt-3 w-full">
              <label class="block text-left text-xs font-medium text-zinc-600">
                ABA Transaction Reference
              </label>
              <input
                type="text"
                v-model="abaRef"
                class="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-[#155E4B] focus:outline-none"
              />
            </div>
          </div>

          <!-- CARD PANEL -->
          <div
            v-if="payMethod === 'card'"
            class="mt-4 rounded-xl border border-zinc-200 bg-[#F8F8F7] p-4 text-xs text-zinc-600"
          >
            <p class="font-medium text-zinc-900">
              POS Card Terminal Charge: {{ formatUSD(computedCart.totalUSD) }}
            </p>
            <p class="mt-1">
              Tap or insert customer Visa / Mastercard / UnionPay on the counter terminal, then
              confirm below.
            </p>
          </div>

          <!-- SPLIT PAYMENT PANEL -->
          <div v-if="payMethod === 'split'" class="mt-4 space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-zinc-600">Cash (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  v-model="cashTenderUSD"
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-600">Cash (KHR)</label>
                <input
                  type="number"
                  step="1000"
                  v-model="cashTenderKHR"
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-600">ABA KHQR (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  v-model="splitAbaUSD"
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-zinc-600">Card (USD)</label>
                <input
                  type="number"
                  step="0.5"
                  v-model="splitCardUSD"
                  class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums focus:border-[#155E4B] focus:outline-none"
                />
              </div>
            </div>
            <div class="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-xs">
              <span class="text-zinc-600">Covered vs. Total Due</span>
              <span
                :class="[
                  'font-mono font-semibold tabular-nums',
                  splitTotalCoveredUSD + 0.005 >= computedCart.totalUSD
                    ? 'text-emerald-700'
                    : 'text-amber-700',
                ]"
              >
                {{ formatUSD(splitTotalCoveredUSD) }} / {{ formatUSD(computedCart.totalUSD) }}
              </span>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-end gap-2">
            <button
              @click="showPayModal = false"
              class="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              @click="handleConfirmPayment"
              class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
            >
              <Check class="h-3.5 w-3.5" />
              {{ payMethod === 'aba_qr' ? 'Confirm ABA Payment' : 'Confirm & Issue Receipt' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- NEW CUSTOMER MODAL -->
    <div
      v-if="showNewCustomer"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleCreateQuickCustomer"
        class="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">Quick Add Customer</h3>
          <button
            type="button"
            @click="showNewCustomer = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="mt-4 space-y-3">
          <div>
            <label class="block text-xs font-medium text-zinc-700">Full Name</label>
            <input
              required
              v-model="newCustName"
              placeholder="e.g. Sokha Chann"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#155E4B] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Phone Number</label>
            <input
              required
              v-model="newCustPhone"
              placeholder="e.g. 012 345 678"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#155E4B] focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Skin Type</label>
            <select
              v-model="newCustSkin"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#155E4B] focus:outline-none"
            >
              <option value="Normal">Normal</option>
              <option value="Dry">Dry</option>
              <option value="Oily">Oily</option>
              <option value="Combination">Combination</option>
              <option value="Sensitive">Sensitive</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">
              Allergies / Avoid Ingredients (comma separated)
            </label>
            <input
              v-model="newCustAllergy"
              placeholder="e.g. Fragrance, Salicylic Acid"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#155E4B] focus:outline-none"
            />
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            @click="showNewCustomer = false"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            Save Customer
          </button>
        </div>
      </form>
    </div>

    <!-- HELD SALES MODAL -->
    <div
      v-if="showHeldModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <div class="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">Held Orders</h3>
          <button
            @click="showHeldModal = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="mt-4 max-h-80 space-y-2 overflow-y-auto">
          <p v-if="state.heldSales.length === 0" class="py-8 text-center text-xs text-zinc-500">
            No held orders right now.
          </p>
          <div
            v-else
            v-for="h in state.heldSales"
            :key="h.id"
            class="flex items-center justify-between rounded-lg border border-zinc-200 p-3"
          >
            <div>
              <div class="text-xs font-semibold text-zinc-900">{{ h.label }}</div>
              <div class="text-[11px] text-zinc-500">
                {{ h.items.reduce((s, i) => s + i.qty, 0) }} item(s) ·
                {{
                  new Date(h.heldAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </div>
              <div v-if="h.notes" class="mt-0.5 text-[11px] text-zinc-400">{{ h.notes }}</div>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                @click="handleResumeHeld(h.id)"
                class="rounded-md bg-[#155E4B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0F4738]"
              >
                Resume
              </button>
              <button
                @click="removeHeldSale(h.id)"
                class="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RETURNS & EXCHANGES MODAL -->
    <div
      v-if="showReturnModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <div class="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 class="text-base font-semibold text-zinc-900">Returns &amp; Exchanges</h3>
            <p class="text-xs text-zinc-500">
              Select an invoice to refund and optionally restock unopened items
            </p>
          </div>
          <button
            @click="showReturnModal = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div class="flex gap-2">
            <input
              v-model="returnSearch"
              placeholder="Search receipt # (e.g. INV-2026-1001) or customer..."
              class="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs focus:border-[#155E4B] focus:outline-none"
            />
            <select
              :value="activeReturnSale?.id || ''"
              @change="
                selectedReturnSaleId = ($event.target as HTMLSelectElement).value;
                returnQtys = {};
              "
              class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium"
            >
              <option v-for="s in matchingReturnSales" :key="s.id" :value="s.id">
                {{ s.receiptNo }} · {{ formatUSD(s.totalUSD) }}
              </option>
            </select>
          </div>

          <div
            v-if="activeReturnSale"
            class="rounded-lg border border-zinc-200 bg-[#F8F8F7] p-3"
          >
            <div class="mb-2 flex items-center justify-between text-xs">
              <span class="font-semibold text-zinc-900">
                {{ activeReturnSale.receiptNo }} · {{ activeReturnSale.customerName || 'Walk-in' }}
              </span>
              <span class="font-mono text-zinc-500">
                {{ new Date(activeReturnSale.createdAt).toLocaleDateString() }}
              </span>
            </div>
            <div class="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
              <div
                v-for="item in activeReturnSale.items"
                :key="item.productId"
                class="flex items-center justify-between px-3 py-2 text-xs"
              >
                <div>
                  <div class="font-medium text-zinc-900">{{ item.productName }}</div>
                  <div class="text-[11px] text-zinc-500 tabular-nums">
                    Sold {{ item.qty }} × {{ formatUSD(item.lineTotalUSD / item.qty) }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-zinc-500">Return Qty:</span>
                  <input
                    type="number"
                    min="0"
                    :max="item.qty"
                    :value="returnQtys[item.productId] || 0"
                    @input="
                      returnQtys = {
                        ...returnQtys,
                        [item.productId]: Math.min(
                          item.qty,
                          Math.max(0, parseInt(($event.target as HTMLInputElement).value, 10) || 0)
                        ),
                      }
                    "
                    class="w-14 rounded border border-zinc-200 px-2 py-1 text-right font-mono text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-700">Reason</label>
              <input
                v-model="returnReason"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              />
            </div>
            <div class="flex items-end pb-1.5">
              <label class="flex items-center gap-2 text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  v-model="returnRestock"
                  class="rounded border-zinc-300 text-[#155E4B]"
                />
                Unopened — Restock back to shelf
              </label>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            @click="showReturnModal = false"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            @click="handleConfirmReturn"
            class="rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            Process Refund
          </button>
        </div>
      </div>
    </div>

    <!-- THERMAL RECEIPT MODAL -->
    <ReceiptModal
      v-if="completedReceipt"
      :sale="completedReceipt"
      @close="completedReceipt = null"
    />

    <!-- MANAGER / ADMIN OVERRIDE MODAL FOR CASHIER RETURNS -->
    <UserSwitchModal
      v-if="showOverrideModal"
      mode="override"
      title="Manager or Admin Approval Required"
      subtitle="Enter Manager or Admin PIN to process a counter return"
      :allowedRoles="['manager', 'admin']"
      @close="showOverrideModal = false"
      @authorized="
        (approver) => {
          discountOverrideApproved = true;
          showNotice('info', `Approved by ${approver.name} (${approver.role}).`);
          showReturnModal = true;
        }
      "
    />
  </div>
</template>
