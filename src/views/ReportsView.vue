<script setup lang="ts">
import { computed, ref } from 'vue';
import { Download } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { daysUntil, formatUSD, getTodayDateStr } from '../utils/fefo';

type ReportTab = 'sales' | 'breakdown' | 'margin' | 'valuation' | 'expiry_movers';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'sales', label: 'Daily / Monthly Sales' },
  { id: 'breakdown', label: 'By Cashier & Brand' },
  { id: 'margin', label: 'Profit & Margin' },
  { id: 'valuation', label: 'Stock Valuation' },
  { id: 'expiry_movers', label: 'Expiry, Dead Stock & Movers' },
];

const { state } = useStore();
const today = getTodayDateStr();
const tab = ref<ReportTab>('sales');

const validSales = computed(() => state.value.sales.filter((s) => s.status !== 'returned'));

const summary = computed(() => {
  const grossRevenue = validSales.value.reduce((s, x) => s + x.totalUSD, 0);
  const totalCOGS = validSales.value.reduce(
    (s, x) => s + x.items.reduce((isum, i) => isum + i.costPrice * i.qty, 0),
    0
  );
  const netProfit = grossRevenue - totalCOGS;
  const marginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
  return { grossRevenue, totalCOGS, netProfit, marginPct };
});

const byCashier = computed(() => {
  const map: Record<string, { name: string; count: number; total: number }> = {};
  for (const s of validSales.value) {
    if (!map[s.cashierName]) map[s.cashierName] = { name: s.cashierName, count: 0, total: 0 };
    map[s.cashierName].count += 1;
    map[s.cashierName].total += s.totalUSD;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
});

const byProduct = computed(() => {
  const map: Record<
    string,
    { id: string; name: string; brand: string; units: number; revenue: number; cogs: number }
  > = {};
  for (const p of state.value.products) {
    map[p.id] = { id: p.id, name: p.name, brand: p.brand, units: 0, revenue: 0, cogs: 0 };
  }
  for (const s of validSales.value) {
    for (const i of s.items) {
      if (!map[i.productId]) continue;
      map[i.productId].units += i.qty;
      map[i.productId].revenue += i.lineTotalUSD;
      map[i.productId].cogs += i.costPrice * i.qty;
    }
  }
  return Object.values(map).sort((a, b) => b.units - a.units);
});

const byBrand = computed(() => {
  const map: Record<string, { brand: string; units: number; revenue: number }> = {};
  for (const row of byProduct.value) {
    if (!map[row.brand]) map[row.brand] = { brand: row.brand, units: 0, revenue: 0 };
    map[row.brand].units += row.units;
    map[row.brand].revenue += row.revenue;
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
});

const stockValuation = computed(() => {
  let totalUnits = 0;
  let totalCostVal = 0;
  let totalRetailVal = 0;
  const rows = state.value.products.map((p) => {
    const pBatches = state.value.batches.filter(
      (b) => b.productId === p.id && daysUntil(b.expiryDate, today) > 0
    );
    const qty = pBatches.reduce((s, b) => s + b.shelfQty + b.backroomQty, 0);
    const costVal = qty * p.costPrice;
    const retailVal = qty * p.retailPrice;
    totalUnits += qty;
    totalCostVal += costVal;
    totalRetailVal += retailVal;
    return { product: p, qty, costVal, retailVal };
  });
  return { rows, totalUnits, totalCostVal, totalRetailVal };
});

const expiryBatches = computed(() => {
  return state.value.batches
    .filter((b) => b.shelfQty + b.backroomQty > 0)
    .map((b) => ({
      batch: b,
      product: state.value.products.find((p) => p.id === b.productId),
      daysLeft: daysUntil(b.expiryDate, today),
      valueAtCost: (b.shelfQty + b.backroomQty) * b.costPerUnit,
    }))
    .filter((x) => x.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);
});

function exportCSV() {
  const headers = ['Receipt', 'Date', 'Cashier', 'Customer', 'Method', 'Total USD', 'Total KHR'];
  const lines = validSales.value.map((s) =>
    [
      s.receiptNo,
      s.createdAt.slice(0, 10),
      s.cashierName,
      s.customerName || 'Walk-in',
      s.paymentMethod,
      s.totalUSD.toFixed(2),
      s.totalKHR,
    ].join(',')
  );
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kiri-sales-report-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">
          Analytics & Reports
        </h1>
        <p class="text-xs text-zinc-500">
          Sales performance, cashier & brand breakdown, profit margins, stock valuation, and fast/slow movers
        </p>
      </div>
      <button
        @click="exportCSV"
        class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <Download class="h-3.5 w-3.5" />
        Export Sales CSV
      </button>
    </div>

    <!-- KPI Strip -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs text-zinc-500">Total Recorded Sales</div>
        <div class="mt-1 font-mono text-xl font-bold text-zinc-900 tabular-nums">
          {{ formatUSD(summary.grossRevenue) }}
        </div>
      </div>
      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs text-zinc-500">Cost of Goods (COGS)</div>
        <div class="mt-1 font-mono text-xl font-bold text-zinc-900 tabular-nums">
          {{ formatUSD(summary.totalCOGS) }}
        </div>
      </div>
      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs text-zinc-500">Gross Profit</div>
        <div class="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
          {{ formatUSD(summary.netProfit) }}
        </div>
      </div>
      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs text-zinc-500">Inventory Cost Value</div>
        <div class="mt-1 font-mono text-xl font-bold text-zinc-900 tabular-nums">
          {{ formatUSD(stockValuation.totalCostVal) }}
        </div>
      </div>
    </div>

    <!-- Report Tabs -->
    <div class="flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-white p-1.5">
      <button
        v-for="t in TABS"
        :key="t.id"
        @click="tab = t.id"
        :class="[
          'rounded-lg px-3.5 py-2 text-xs font-medium whitespace-nowrap',
          tab === t.id ? 'bg-[#155E4B] text-white' : 'text-zinc-600 hover:bg-zinc-100',
        ]"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="tab === 'sales'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
            <th class="px-4 py-3 font-medium">Receipt #</th>
            <th class="px-4 py-3 font-medium">Date & Time</th>
            <th class="px-4 py-3 font-medium">Cashier</th>
            <th class="px-4 py-3 font-medium">Customer</th>
            <th class="px-4 py-3 font-medium">Payment</th>
            <th class="px-4 py-3 text-right font-medium">Total USD</th>
            <th class="px-4 py-3 text-right font-medium">Total KHR</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100">
          <tr v-for="s in validSales" :key="s.id" class="hover:bg-zinc-50">
            <td class="px-4 py-2.5 font-mono font-semibold text-zinc-900">
              {{ s.receiptNo }}
            </td>
            <td class="px-4 py-2.5 font-mono text-zinc-500 tabular-nums">
              {{ s.createdAt.slice(0, 16).replace('T', ' ') }}
            </td>
            <td class="px-4 py-2.5 text-zinc-700">{{ s.cashierName }}</td>
            <td class="px-4 py-2.5 text-zinc-700">{{ s.customerName || 'Walk-in' }}</td>
            <td class="px-4 py-2.5 uppercase text-zinc-600">
              {{ s.paymentMethod.replace('_', ' ') }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
              {{ formatUSD(s.totalUSD) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono text-zinc-500 tabular-nums">
              {{ s.totalKHR.toLocaleString() }} ៛
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tab === 'breakdown'" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div class="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">
          Sales by Cashier
        </div>
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-2.5 font-medium">Staff</th>
              <th class="px-4 py-2.5 text-right font-medium">Bills</th>
              <th class="px-4 py-2.5 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="c in byCashier" :key="c.name">
              <td class="px-4 py-2.5 font-medium text-zinc-900">{{ c.name }}</td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums">{{ c.count }}</td>
              <td class="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                {{ formatUSD(c.total) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div class="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">
          Sales by Brand
        </div>
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-2.5 font-medium">Brand</th>
              <th class="px-4 py-2.5 text-right font-medium">Units</th>
              <th class="px-4 py-2.5 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="b in byBrand" :key="b.brand">
              <td class="px-4 py-2.5 font-medium text-zinc-900">{{ b.brand }}</td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums">{{ b.units }}</td>
              <td class="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                {{ formatUSD(b.revenue) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="tab === 'margin'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
            <th class="px-4 py-3 font-medium">Product</th>
            <th class="px-4 py-3 text-right font-medium">Units Sold</th>
            <th class="px-4 py-3 text-right font-medium">Revenue</th>
            <th class="px-4 py-3 text-right font-medium">COGS</th>
            <th class="px-4 py-3 text-right font-medium">Profit</th>
            <th class="px-4 py-3 text-right font-medium">Margin %</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100">
          <tr v-for="r in byProduct" :key="r.id">
            <td class="px-4 py-2.5 font-medium text-zinc-900">{{ r.name }}</td>
            <td class="px-4 py-2.5 text-right font-mono tabular-nums">{{ r.units }}</td>
            <td class="px-4 py-2.5 text-right font-mono tabular-nums">
              {{ formatUSD(r.revenue) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono text-zinc-500 tabular-nums">
              {{ formatUSD(r.cogs) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
              {{ formatUSD(r.revenue - r.cogs) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono tabular-nums">
              {{ (r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0).toFixed(1) }}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tab === 'valuation'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-3 text-xs">
        <span class="font-semibold text-zinc-900">
          Total Active Inventory ({{ stockValuation.totalUnits }} units)
        </span>
        <span class="font-mono font-semibold text-zinc-800 tabular-nums">
          Cost: {{ formatUSD(stockValuation.totalCostVal) }} · Retail Potential:
          {{ formatUSD(stockValuation.totalRetailVal) }}
        </span>
      </div>
      <table class="w-full text-left text-xs">
        <thead>
          <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
            <th class="px-4 py-2.5 font-medium">Product</th>
            <th class="px-4 py-2.5 text-right font-medium">Sellable Qty</th>
            <th class="px-4 py-2.5 text-right font-medium">Cost Value</th>
            <th class="px-4 py-2.5 text-right font-medium">Retail Value</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-100">
          <tr v-for="r in stockValuation.rows" :key="r.product.id">
            <td class="px-4 py-2.5 font-medium text-zinc-900">{{ r.product.name }}</td>
            <td class="px-4 py-2.5 text-right font-mono tabular-nums">{{ r.qty }}</td>
            <td class="px-4 py-2.5 text-right font-mono tabular-nums">
              {{ formatUSD(r.costVal) }}
            </td>
            <td class="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
              {{ formatUSD(r.retailVal) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tab === 'expiry_movers'" class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div class="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">
          Expiry & At-Risk Batches (≤ 90 days)
        </div>
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-2.5 font-medium">Product / Batch</th>
              <th class="px-4 py-2.5 font-medium">Expiry</th>
              <th class="px-4 py-2.5 text-right font-medium">Cost at Risk</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="e in expiryBatches" :key="e.batch.id">
              <td class="px-4 py-2.5">
                <div class="font-medium text-zinc-900">{{ e.product?.name }}</div>
                <div class="font-mono text-[11px] text-zinc-500">
                  {{ e.batch.batchNumber }} · {{ e.batch.shelfQty + e.batch.backroomQty }} units
                </div>
              </td>
              <td class="px-4 py-2.5 font-mono">
                <span :class="e.daysLeft <= 0 ? 'font-semibold text-red-600' : 'text-amber-700'">
                  {{ e.batch.expiryDate }} ({{ e.daysLeft }}d)
                </span>
              </td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums">
                {{ formatUSD(e.valueAtCost) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div class="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">
          Fast & Slow Movers (Dead Stock Watch)
        </div>
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-2.5 font-medium">Product</th>
              <th class="px-4 py-2.5 text-right font-medium">Units Sold</th>
              <th class="px-4 py-2.5 text-right font-medium">Velocity</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="p in byProduct" :key="p.id">
              <td class="px-4 py-2.5 font-medium text-zinc-900">{{ p.name }}</td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums">{{ p.units }}</td>
              <td class="px-4 py-2.5 text-right">
                <span v-if="p.units >= 2" class="font-medium text-emerald-700">Fast Mover</span>
                <span v-else-if="p.units === 1" class="text-zinc-600">Steady</span>
                <span v-else class="font-medium text-amber-700">Slow / Dead Stock</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
