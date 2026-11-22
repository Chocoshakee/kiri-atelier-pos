<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Check, CreditCard, PackageCheck, Plus, X } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { PurchaseOrder } from '../types/pos';
import { addDays, formatUSD, getProductStockSummary, getTodayDateStr } from '../utils/fefo';

const { state, createPurchaseOrder, receivePurchaseOrder, recordSupplierPayment } = useStore();
const today = getTodayDateStr();

const showNewPO = ref(false);
const poSupplierId = ref(state.value.suppliers[0]?.id || '');
const poItems = ref<{ productId: string; qtyOrdered: number; unitCostUSD: number }[]>([
  {
    productId: state.value.products[2]?.id || state.value.products[0]?.id,
    qtyOrdered: 12,
    unitCostUSD: state.value.products[2]?.costPrice || 10,
  },
]);
const receivingPO = ref<PurchaseOrder | null>(null);
const batchInputs = reactive<
  Record<string, { batchNumber: string; expiryDate: string; qtyReceived: number }>
>({});

function fillLowStock() {
  const low = state.value.products
    .filter((p) => getProductStockSummary(state.value.batches, p.id, today).totalSellableQty <= p.reorderLevel)
    .map((p) => ({
      productId: p.id,
      qtyOrdered: Math.max(10, p.reorderLevel * 2),
      unitCostUSD: p.costPrice,
    }));
  if (low.length > 0) poItems.value = low;
}

function handleCreatePO() {
  const sup = state.value.suppliers.find((s) => s.id === poSupplierId.value);
  if (!sup || poItems.value.length === 0) return;
  const totalCostUSD = Number(
    poItems.value.reduce((s, i) => s + i.qtyOrdered * i.unitCostUSD, 0).toFixed(2)
  );
  createPurchaseOrder({
    supplierId: sup.id,
    supplierName: sup.name,
    expectedDate: addDays(today, sup.leadTimeDays),
    status: 'ordered',
    items: poItems.value.map((i) => ({ ...i, qtyReceived: 0 })),
    totalCostUSD,
    paidUSD: 0,
  });
  showNewPO.value = false;
}

function openReceiveModal(po: PurchaseOrder) {
  po.items.forEach((item, idx) => {
    batchInputs[item.productId] = {
      batchNumber: `LOT-${today.slice(2, 7).replace('-', '')}-${idx + 1}`,
      expiryDate: addDays(today, 365),
      qtyReceived: item.qtyOrdered,
    };
  });
  receivingPO.value = po;
}

function handleConfirmReceive() {
  if (!receivingPO.value) return;
  const details = receivingPO.value.items.map((item) => ({
    productId: item.productId,
    batchNumber: batchInputs[item.productId]?.batchNumber || 'LOT-NEW',
    expiryDate: batchInputs[item.productId]?.expiryDate || addDays(today, 365),
    qtyReceived: batchInputs[item.productId]?.qtyReceived ?? item.qtyOrdered,
  }));
  receivePurchaseOrder(receivingPO.value.id, details);
  receivingPO.value = null;
}

function getPoItemsSummary(po: PurchaseOrder) {
  return po.items
    .map((i) => {
      const p = state.value.products.find((pr) => pr.id === i.productId);
      return `${p?.sku || i.productId} (${i.qtyOrdered})`;
    })
    .join(', ');
}

function getUnpaid(po: PurchaseOrder) {
  return Math.max(0, Number((po.totalCostUSD - po.paidUSD).toFixed(2)));
}

function onRowProductChange(idx: number, productId: string) {
  const prod = state.value.products.find((p) => p.id === productId);
  poItems.value = poItems.value.map((item, i) =>
    i === idx
      ? {
          ...item,
          productId,
          unitCostUSD: prod?.costPrice || item.unitCostUSD,
        }
      : item
  );
}

function addLineItem() {
  const p = state.value.products[0];
  poItems.value = [
    ...poItems.value,
    { productId: p?.id, qtyOrdered: 10, unitCostUSD: p?.costPrice || 10 },
  ];
}

function getProductName(productId: string) {
  return state.value.products.find((p) => p.id === productId)?.name || productId;
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">
          Purchasing & Suppliers
        </h1>
        <p class="text-xs text-zinc-500">
          Supplier directory, purchase orders, FEFO batch receiving, and supplier payments
        </p>
      </div>
      <button
        @click="showNewPO = true"
        class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
      >
        <Plus class="h-3.5 w-3.5" />
        New Purchase Order
      </button>
    </div>

    <!-- Suppliers Directory -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div
        v-for="sup in state.suppliers"
        :key="sup.id"
        class="rounded-xl border border-zinc-200 bg-white p-4"
      >
        <div class="text-sm font-semibold text-zinc-900">{{ sup.name }}</div>
        <div class="mt-1 text-xs text-zinc-500">
          Contact: {{ sup.contactName }} · {{ sup.phone }}
        </div>
        <div class="mt-0.5 font-mono text-[11px] text-zinc-400">
          Telegram: {{ sup.telegram }} · Lead time {{ sup.leadTimeDays }}d
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2.5 text-xs">
          <span class="text-zinc-500">Balance Owed</span>
          <span
            :class="[
              'font-mono font-bold tabular-nums',
              sup.balanceOwedUSD > 0 ? 'text-amber-700' : 'text-emerald-700',
            ]"
          >
            {{ formatUSD(sup.balanceOwedUSD) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Purchase Orders Table -->
    <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 px-5 py-3.5">
        <h2 class="text-sm font-semibold text-zinc-900">Purchase Orders</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-3 font-medium">PO #</th>
              <th class="px-4 py-3 font-medium">Supplier</th>
              <th class="px-4 py-3 font-medium">Expected</th>
              <th class="px-4 py-3 font-medium">Items</th>
              <th class="px-4 py-3 text-right font-medium">Total Cost</th>
              <th class="px-4 py-3 text-right font-medium">Paid</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="po in state.purchaseOrders" :key="po.id" class="hover:bg-zinc-50">
              <td class="px-4 py-3 font-mono font-semibold text-zinc-900">
                {{ po.poNumber }}
              </td>
              <td class="px-4 py-3 text-zinc-800">{{ po.supplierName }}</td>
              <td class="px-4 py-3 font-mono text-zinc-500 tabular-nums">
                {{ po.expectedDate }}
              </td>
              <td class="px-4 py-3 text-zinc-600">
                {{ getPoItemsSummary(po) }}
              </td>
              <td class="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                {{ formatUSD(po.totalCostUSD) }}
              </td>
              <td class="px-4 py-3 text-right font-mono text-zinc-600 tabular-nums">
                {{ formatUSD(po.paidUSD) }}
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'font-medium capitalize',
                    po.status === 'received' ? 'text-emerald-700' : 'text-amber-700',
                  ]"
                >
                  {{ po.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="inline-flex items-center gap-1.5">
                  <button
                    v-if="po.status !== 'received'"
                    @click="openReceiveModal(po)"
                    class="inline-flex items-center gap-1 rounded-md bg-[#155E4B] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#0F4738]"
                  >
                    <PackageCheck class="h-3 w-3" />
                    Receive
                  </button>
                  <button
                    v-if="getUnpaid(po) > 0"
                    @click="recordSupplierPayment(po.id, getUnpaid(po))"
                    class="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    <CreditCard class="h-3 w-3" />
                    Pay {{ formatUSD(getUnpaid(po)) }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- NEW PO MODAL -->
    <div
      v-if="showNewPO"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleCreatePO"
        class="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">Create Purchase Order</h3>
          <button
            type="button"
            @click="showNewPO = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div class="flex items-end justify-between gap-2">
            <div class="flex-1">
              <label class="block text-xs font-medium text-zinc-700">Supplier</label>
              <select
                v-model="poSupplierId"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              >
                <option v-for="s in state.suppliers" :key="s.id" :value="s.id">
                  {{ s.name }}
                </option>
              </select>
            </div>
            <button
              type="button"
              @click="fillLowStock"
              class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-[#155E4B] hover:bg-zinc-50 whitespace-nowrap"
            >
              Auto-Fill Low Stock
            </button>
          </div>

          <div class="max-h-60 space-y-2 overflow-y-auto">
            <div v-for="(row, idx) in poItems" :key="idx" class="flex items-center gap-2">
              <select
                :value="row.productId"
                @change="onRowProductChange(idx, ($event.target as HTMLSelectElement).value)"
                class="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
              >
                <option v-for="p in state.products" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
              <input
                type="number"
                min="1"
                v-model.number="row.qtyOrdered"
                class="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums"
              />
              <span class="font-mono text-xs text-zinc-500 tabular-nums">
                × {{ formatUSD(row.unitCostUSD) }}
              </span>
            </div>
          </div>
          <button
            type="button"
            @click="addLineItem"
            class="text-xs font-medium text-[#155E4B] hover:underline"
          >
            + Add Line Item
          </button>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            @click="showNewPO = false"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            Issue Purchase Order
          </button>
        </div>
      </form>
    </div>

    <!-- RECEIVE PO INTO FEFO BATCHES MODAL -->
    <div
      v-if="receivingPO"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleConfirmReceive"
        class="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 class="text-base font-semibold text-zinc-900">
              Receive {{ receivingPO.poNumber }} into FEFO Batches
            </h3>
            <p class="text-xs text-zinc-500">
              Assign batch numbers & expiry dates before adding to back-room inventory
            </p>
          </div>
          <button
            type="button"
            @click="receivingPO = null"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div
            v-for="item in receivingPO.items"
            :key="item.productId"
            class="rounded-lg border border-zinc-200 bg-[#F8F8F7] p-3"
          >
            <div class="text-xs font-semibold text-zinc-900">
              {{ getProductName(item.productId) }}
            </div>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label class="block text-[10px] text-zinc-500">Batch #</label>
                <input
                  required
                  v-model="batchInputs[item.productId].batchNumber"
                  class="mt-0.5 w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-xs"
                />
              </div>
              <div>
                <label class="block text-[10px] text-zinc-500">Expiry Date</label>
                <input
                  required
                  type="date"
                  v-model="batchInputs[item.productId].expiryDate"
                  class="mt-0.5 w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-xs"
                />
              </div>
              <div>
                <label class="block text-[10px] text-zinc-500">Qty Received</label>
                <input
                  required
                  type="number"
                  min="0"
                  v-model.number="batchInputs[item.productId].qtyReceived"
                  class="mt-0.5 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-right font-mono text-xs tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            @click="receivingPO = null"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            <Check class="h-3.5 w-3.5" />
            Receive Stock
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
