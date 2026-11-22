<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  AlertTriangle,
  ArrowRightLeft,
  Barcode,
  Check,
  ClipboardCheck,
  History,
  PackagePlus,
} from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { Batch, StockMovementType } from '../types/pos';
import { daysUntil, formatUSD, getProductStockSummary, getTodayDateStr } from '../utils/fefo';

type InvTab = 'overview' | 'batches' | 'stocktake' | 'stockin' | 'adjust' | 'history';

const TABS: { id: InvTab; label: string }[] = [
  { id: 'overview', label: 'Shelf vs Back-Room' },
  { id: 'batches', label: 'FEFO & Expiry Batches' },
  { id: 'stocktake', label: 'Scan Stocktake' },
  { id: 'stockin', label: 'Stock In' },
  { id: 'adjust', label: 'Adjustments & Testers' },
  { id: 'history', label: 'Movement History' },
];

const { state, receiveBatch, transferBackroomToShelf, commitStocktake, adjustStock } = useStore();
const today = getTodayDateStr();

const tab = ref<InvTab>('overview');
const notice = ref<string | null>(null);

// Stock-In Form
const inProdId = ref(state.value.products[0]?.id || '');
const inBatchNo = ref('SL26-NEW');
const inExpiry = ref('2027-11-30');
const inQty = ref('12');
const inLoc = ref<'shelf' | 'backroom'>('backroom');
const inSupplier = ref(state.value.suppliers[0]?.id || '');

// Stocktake Scan-to-Count
const scanCode = ref('');
const countedMap = reactive<Record<string, number>>((() => {
  const init: Record<string, number> = {};
  for (const p of state.value.products) {
    init[p.id] = getProductStockSummary(state.value.batches, p.id, today).shelfQty;
  }
  return init;
})());

// Adjustment Form
const adjBatchId = ref(state.value.batches[0]?.id || '');
const adjLoc = ref<'shelf' | 'backroom'>('shelf');
const adjType = ref<StockMovementType>('damage_writeoff');
const adjQty = ref('1');
const adjReason = ref('Broken dropper / tester allocation');

function flashNotice(msg: string) {
  notice.value = msg;
  setTimeout(() => {
    notice.value = null;
  }, 3500);
}

const sortedBatches = computed(() =>
  [...state.value.batches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
);

function getSummary(productId: string) {
  return getProductStockSummary(state.value.batches, productId, today);
}

function getProductName(productId: string) {
  return state.value.products.find((p) => p.id === productId)?.name || productId;
}

function handleStockIn() {
  const prod = state.value.products.find((p) => p.id === inProdId.value);
  const qty = parseInt(inQty.value, 10) || 0;
  if (!prod || qty <= 0) return;
  receiveBatch({
    productId: prod.id,
    batchNumber: inBatchNo.value.trim(),
    expiryDate: inExpiry.value,
    qty,
    location: inLoc.value,
    costPerUnit: prod.costPrice,
    supplierId: inSupplier.value,
    reference: 'Manual Stock-In',
  });
  flashNotice(`Received ${qty} × ${prod.name} (Batch ${inBatchNo.value}) into ${inLoc.value}.`);
}

function handleScanStocktake(e: KeyboardEvent) {
  if (e.key !== 'Enter') return;
  const q = scanCode.value.trim().toLowerCase();
  if (!q) return;
  const prod = state.value.products.find(
    (p) => p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q
  );
  if (!prod) {
    flashNotice(`No product matched barcode "${scanCode.value}".`);
    return;
  }
  countedMap[prod.id] = (countedMap[prod.id] ?? 0) + 1;
  scanCode.value = '';
  flashNotice(`Counted +1 for ${prod.name}`);
}

function handleCommitStocktake() {
  const payload = state.value.products.map((p) => ({
    productId: p.id,
    countedShelfQty: countedMap[p.id] ?? getSummary(p.id).shelfQty,
  }));
  commitStocktake(payload);
  flashNotice('Stocktake variances committed to shelf batches and movement ledger.');
}

function handleAdjust() {
  const qty = Math.abs(parseInt(adjQty.value, 10) || 0);
  if (!adjBatchId.value || qty <= 0) return;
  adjustStock({
    batchId: adjBatchId.value,
    location: adjLoc.value,
    qtyDelta: -qty,
    type: adjType.value,
    reason: adjReason.value.trim() || adjType.value,
  });
  flashNotice(`Adjusted -${qty} unit(s) from ${adjLoc.value}.`);
}

function moveFourToShelf(batch: Batch, productName: string) {
  const moveQty = Math.min(4, batch.backroomQty);
  transferBackroomToShelf(batch.id, moveQty);
  flashNotice(`Moved ${moveQty} × ${productName} (Batch ${batch.batchNumber}) to shelf.`);
}

function writeOffExpiredBatch(b: Batch) {
  if (b.shelfQty > 0) {
    adjustStock({
      batchId: b.id,
      location: 'shelf',
      qtyDelta: -b.shelfQty,
      type: 'expired_writeoff',
      reason: 'Expired batch write-off',
    });
  }
  if (b.backroomQty > 0) {
    adjustStock({
      batchId: b.id,
      location: 'backroom',
      qtyDelta: -b.backroomQty,
      type: 'expired_writeoff',
      reason: 'Expired batch write-off',
    });
  }
  flashNotice(`Wrote off expired batch ${b.batchNumber}.`);
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">
          Inventory & FEFO Batches
        </h1>
        <p class="text-xs text-zinc-500">
          Shelf vs. back-room stock, First-Expired-First-Out batches, stocktake, and audit history
        </p>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-1.5">
      <button
        v-for="t in TABS"
        :key="t.id"
        @click="tab = t.id"
        :class="[
          'rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap',
          tab === t.id
            ? 'bg-[#155E4B] text-white'
            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
        ]"
      >
        {{ t.label }}
      </button>
    </div>

    <div
      v-if="notice"
      class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900"
    >
      <Check class="h-4 w-4 shrink-0" />
      <span>{{ notice }}</span>
    </div>

    <!-- TAB 1: OVERVIEW (SHELF VS BACK-ROOM) -->
    <div v-if="tab === 'overview'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-zinc-200 bg-[#F8F8F7] text-zinc-500">
            <th class="px-4 py-3 font-medium">Product</th>
            <th class="px-4 py-3 text-right font-medium">Shelf</th>
            <th class="px-4 py-3 text-right font-medium">Back-Room</th>
            <th class="px-4 py-3 text-right font-medium">Expired (Blocked)</th>
            <th class="px-4 py-3 font-medium">Nearest FEFO Expiry</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 text-right font-medium">Restock Shelf</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100">
          <tr v-for="p in state.products" :key="p.id" class="hover:bg-zinc-50">
            <td class="px-4 py-3">
              <div class="font-semibold text-zinc-900">{{ p.name }}</div>
              <div class="font-mono text-[11px] text-zinc-400">
                {{ p.sku }} · Reorder ≤ {{ p.reorderLevel }}
              </div>
            </td>
            <td class="px-4 py-3 text-right font-mono font-semibold text-zinc-900 tabular-nums">
              {{ getSummary(p.id).shelfQty }}
            </td>
            <td class="px-4 py-3 text-right font-mono text-zinc-600 tabular-nums">
              {{ getSummary(p.id).backroomQty }}
            </td>
            <td class="px-4 py-3 text-right font-mono tabular-nums">
              <span
                v-if="getSummary(p.id).expiredShelfQty + getSummary(p.id).expiredBackroomQty > 0"
                class="font-semibold text-red-600"
              >
                {{ getSummary(p.id).expiredShelfQty + getSummary(p.id).expiredBackroomQty }}
              </span>
              <span v-else class="text-zinc-400">0</span>
            </td>
            <td class="px-4 py-3 font-mono text-zinc-600 tabular-nums">
              <span
                v-if="getSummary(p.id).nearestExpiryDate"
                :class="
                  (getSummary(p.id).nearestExpiryDays ?? 999) <= 30
                    ? 'font-semibold text-amber-700'
                    : ''
                "
              >
                {{ getSummary(p.id).nearestExpiryDate }} ({{ getSummary(p.id).nearestExpiryDays }}d)
              </span>
              <span v-else>—</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="getSummary(p.id).isExpiredOnly" class="font-semibold text-red-600">
                Expired Blocked
              </span>
              <span
                v-else-if="getSummary(p.id).totalSellableQty <= p.reorderLevel"
                class="font-semibold text-amber-700"
              >
                Low Stock
              </span>
              <span v-else class="text-emerald-700">Nominal</span>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="getSummary(p.id).activeBatches.find((b) => b.backroomQty > 0)"
                @click="
                  moveFourToShelf(
                    getSummary(p.id).activeBatches.find((b) => b.backroomQty > 0)!,
                    p.name
                  )
                "
                class="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
              >
                <ArrowRightLeft class="h-3 w-3" />
                Move +{{
                  Math.min(
                    4,
                    getSummary(p.id).activeBatches.find((b) => b.backroomQty > 0)!.backroomQty
                  )
                }}
              </button>
              <span v-else class="text-[11px] text-zinc-400">No backroom</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TAB 2: FEFO BATCHES -->
    <div v-if="tab === 'batches'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-zinc-200 bg-[#F8F8F7] text-zinc-500">
            <th class="px-4 py-3 font-medium">FEFO Order / Batch</th>
            <th class="px-4 py-3 font-medium">Product</th>
            <th class="px-4 py-3 font-medium">Expiry Date</th>
            <th class="px-4 py-3 text-right font-medium">Days Left</th>
            <th class="px-4 py-3 text-right font-medium">Shelf Qty</th>
            <th class="px-4 py-3 text-right font-medium">Back-Room</th>
            <th class="px-4 py-3 text-right font-medium">Unit Cost</th>
            <th class="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100">
          <tr v-for="b in sortedBatches" :key="b.id" class="hover:bg-zinc-50">
            <td class="px-4 py-3 font-mono font-semibold text-zinc-900">
              {{ b.batchNumber }}
            </td>
            <td class="px-4 py-3 font-medium text-zinc-800">
              {{ getProductName(b.productId) }}
            </td>
            <td class="px-4 py-3 font-mono text-zinc-600 tabular-nums">
              {{ b.expiryDate }}
            </td>
            <td class="px-4 py-3 text-right font-mono tabular-nums">
              <span
                v-if="daysUntil(b.expiryDate, today) <= 0"
                class="inline-flex items-center gap-1 font-semibold text-red-600"
              >
                <AlertTriangle class="h-3 w-3" />
                Expired ({{ Math.abs(daysUntil(b.expiryDate, today)) }}d ago)
              </span>
              <span
                v-else-if="daysUntil(b.expiryDate, today) <= 30"
                class="font-semibold text-amber-700"
              >
                {{ daysUntil(b.expiryDate, today) }} days
              </span>
              <span v-else class="text-zinc-600">{{ daysUntil(b.expiryDate, today) }} days</span>
            </td>
            <td class="px-4 py-3 text-right font-mono font-semibold tabular-nums">
              {{ b.shelfQty }}
            </td>
            <td class="px-4 py-3 text-right font-mono text-zinc-600 tabular-nums">
              {{ b.backroomQty }}
            </td>
            <td class="px-4 py-3 text-right font-mono text-zinc-600 tabular-nums">
              {{ formatUSD(b.costPerUnit) }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="daysUntil(b.expiryDate, today) <= 0 && b.shelfQty + b.backroomQty > 0"
                @click="writeOffExpiredBatch(b)"
                class="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
              >
                Write Off Expired
              </button>
              <button
                v-else-if="b.backroomQty > 0"
                @click="transferBackroomToShelf(b.id, b.backroomQty)"
                class="rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Move All to Shelf
              </button>
              <span v-else class="text-[11px] text-zinc-400">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TAB 3: SCAN STOCKTAKE -->
    <div v-if="tab === 'stocktake'" class="space-y-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4"
      >
        <div class="relative min-w-[260px] flex-1">
          <Barcode
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            v-model="scanCode"
            @keydown="handleScanStocktake"
            placeholder="Scan barcode & press Enter to increment shelf count..."
            class="w-full rounded-lg border border-zinc-200 bg-[#F8F8F7] py-2 pl-9 pr-3 font-mono text-xs focus:border-[#155E4B] focus:bg-white focus:outline-none"
          />
        </div>
        <button
          @click="handleCommitStocktake"
          class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
        >
          <ClipboardCheck class="h-3.5 w-3.5" />
          Commit Stocktake Variances
        </button>
      </div>

      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-200 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-3 font-medium">Product</th>
              <th class="px-4 py-3 font-medium">Barcode</th>
              <th class="px-4 py-3 text-right font-medium">System Shelf</th>
              <th class="px-4 py-3 text-right font-medium">Physical Count</th>
              <th class="px-4 py-3 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="p in state.products" :key="p.id" class="hover:bg-zinc-50">
              <td class="px-4 py-2.5 font-medium text-zinc-900">{{ p.name }}</td>
              <td class="px-4 py-2.5 font-mono text-zinc-500">{{ p.barcode }}</td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums">
                {{ getSummary(p.id).shelfQty }}
              </td>
              <td class="px-4 py-2.5 text-right">
                <input
                  type="number"
                  min="0"
                  :value="countedMap[p.id] ?? getSummary(p.id).shelfQty"
                  @input="
                    countedMap[p.id] = Math.max(
                      0,
                      parseInt(($event.target as HTMLInputElement).value, 10) || 0
                    )
                  "
                  class="w-20 rounded-md border border-zinc-200 px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums"
                />
              </td>
              <td class="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                <span
                  v-if="(countedMap[p.id] ?? getSummary(p.id).shelfQty) - getSummary(p.id).shelfQty === 0"
                  class="text-zinc-400"
                >
                  0
                </span>
                <span
                  v-else-if="(countedMap[p.id] ?? getSummary(p.id).shelfQty) - getSummary(p.id).shelfQty > 0"
                  class="text-emerald-700"
                >
                  +{{ (countedMap[p.id] ?? getSummary(p.id).shelfQty) - getSummary(p.id).shelfQty }}
                </span>
                <span v-else class="text-red-600">
                  {{ (countedMap[p.id] ?? getSummary(p.id).shelfQty) - getSummary(p.id).shelfQty }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 4: STOCK IN -->
    <form
      v-if="tab === 'stockin'"
      @submit.prevent="handleStockIn"
      class="max-w-xl rounded-xl border border-zinc-200 bg-white p-6"
    >
      <div class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <PackagePlus class="h-4 w-4 text-[#155E4B]" />
        Receive Stock Batch
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-zinc-700">Product</label>
          <select
            v-model="inProdId"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option v-for="p in state.products" :key="p.id" :value="p.id">
              {{ p.name }} ({{ p.sku }})
            </option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Batch Number</label>
          <input
            required
            v-model="inBatchNo"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Expiry Date</label>
          <input
            required
            type="date"
            v-model="inExpiry"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Quantity</label>
          <input
            required
            type="number"
            min="1"
            v-model="inQty"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs tabular-nums"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Destination</label>
          <select
            v-model="inLoc"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option value="backroom">Back-Room Storage</option>
            <option value="shelf">Shop Shelf (Ready for POS)</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-zinc-700">Supplier</label>
          <select
            v-model="inSupplier"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option v-for="s in state.suppliers" :key="s.id" :value="s.id">
              {{ s.name }}
            </option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        class="mt-5 rounded-lg bg-[#155E4B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
      >
        Add Batch to Inventory
      </button>
    </form>

    <!-- TAB 5: ADJUSTMENTS -->
    <form
      v-if="tab === 'adjust'"
      @submit.prevent="handleAdjust"
      class="max-w-xl rounded-xl border border-zinc-200 bg-white p-6"
    >
      <h2 class="text-sm font-semibold text-zinc-900">
        Write-Offs, Testers & Sample Adjustments
      </h2>
      <p class="mt-1 text-xs text-zinc-500">
        Deduct damaged goods, expired items, in-store shelf testers, or VIP samples.
      </p>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-zinc-700">Batch</label>
          <select
            v-model="adjBatchId"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option v-for="b in state.batches" :key="b.id" :value="b.id">
              {{ getProductName(b.productId) }} · Batch {{ b.batchNumber }} (Shelf: {{ b.shelfQty }} /
              Back: {{ b.backroomQty }})
            </option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Adjustment Type</label>
          <select
            v-model="adjType"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option value="tester_sample">In-Store Tester / Sample</option>
            <option value="damage_writeoff">Damaged Goods</option>
            <option value="expired_writeoff">Expired Write-Off</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Location</label>
          <select
            v-model="adjLoc"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option value="shelf">Shop Shelf</option>
            <option value="backroom">Back-Room</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Quantity to Deduct</label>
          <input
            type="number"
            min="1"
            v-model="adjQty"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs tabular-nums"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-zinc-700">Reason / Note</label>
          <input
            required
            v-model="adjReason"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          />
        </div>
      </div>
      <button
        type="submit"
        class="mt-5 rounded-lg bg-zinc-900 px-5 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
      >
        Record Adjustment
      </button>
    </form>

    <!-- TAB 6: MOVEMENT HISTORY -->
    <div v-if="tab === 'history'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div class="flex items-center gap-2 border-b border-zinc-200 px-5 py-3">
        <History class="h-4 w-4 text-zinc-500" />
        <h2 class="text-sm font-semibold text-zinc-900">Stock Movement Audit Ledger</h2>
      </div>
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
            <th class="px-4 py-2.5 font-medium">Timestamp</th>
            <th class="px-4 py-2.5 font-medium">Product</th>
            <th class="px-4 py-2.5 font-medium">Batch</th>
            <th class="px-4 py-2.5 font-medium">Event</th>
            <th class="px-4 py-2.5 text-right font-medium">Qty Delta</th>
            <th class="px-4 py-2.5 font-medium">Location</th>
            <th class="px-4 py-2.5 font-medium">Reference / Staff</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100">
          <tr
            v-for="m in state.stockMovements.slice(0, 40)"
            :key="m.id"
            class="hover:bg-zinc-50"
          >
            <td class="px-4 py-2.5 font-mono text-[11px] text-zinc-500 tabular-nums">
              {{
                new Date(m.createdAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }}
            </td>
            <td class="px-4 py-2.5 font-medium text-zinc-900">{{ m.productName }}</td>
            <td class="px-4 py-2.5 font-mono text-zinc-600">{{ m.batchNumber }}</td>
            <td class="px-4 py-2.5 text-zinc-600">{{ m.type.replace(/_/g, ' ') }}</td>
            <td
              :class="[
                'px-4 py-2.5 text-right font-mono font-semibold tabular-nums',
                m.qtyDelta > 0 ? 'text-emerald-700' : 'text-zinc-900',
              ]"
            >
              {{ m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta }}
            </td>
            <td class="px-4 py-2.5 text-zinc-600 capitalize">{{ m.location }}</td>
            <td class="px-4 py-2.5 text-zinc-500">{{ m.reference }} · {{ m.staffName }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
