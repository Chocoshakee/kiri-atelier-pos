<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, ArrowRight, Clock, Package, TrendingUp } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { ModuleId } from '../types/pos';
import {
  daysUntil,
  formatKHR,
  formatUSD,
  getProductStockSummary,
  getTodayDateStr,
  toKHR,
} from '../utils/fefo';

const emit = defineEmits<{
  (e: 'navigate', module: ModuleId): void;
}>();

const { state, currentShift } = useStore();
const today = getTodayDateStr();
const rate = computed(() => state.value.settings.exchangeRateKHR);

const todaySales = computed(() =>
  state.value.sales.filter(
    (s) => s.createdAt.slice(0, 10) === today && s.status !== 'returned'
  )
);

const metrics = computed(() => {
  const revenueUSD = todaySales.value.reduce((s, sale) => s + sale.totalUSD, 0);
  const txCount = todaySales.value.length;
  const avgBasket = txCount > 0 ? revenueUSD / txCount : 0;
  const cogsUSD = todaySales.value.reduce(
    (s, sale) => s + sale.items.reduce((isum, item) => isum + item.costPrice * item.qty, 0),
    0
  );
  const grossMarginPct = revenueUSD > 0 ? ((revenueUSD - cogsUSD) / revenueUSD) * 100 : 0;
  return { revenueUSD, txCount, avgBasket, grossMarginPct };
});

const hourlyBuckets = computed(() => {
  const hours = Array.from({ length: 13 }, (_, idx) => idx + 8);
  const map: Record<number, number> = {};
  for (const s of todaySales.value) {
    const h = new Date(s.createdAt).getHours();
    map[h] = (map[h] || 0) + s.totalUSD;
  }
  const maxVal = Math.max(25, ...Object.values(map));
  return hours.map((h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    amount: map[h] || 0,
    pct: Math.round(((map[h] || 0) / maxVal) * 100),
  }));
});

const topProducts = computed(() => {
  const map: Record<string, { name: string; sku: string; qty: number; revenue: number }> = {};
  for (const s of todaySales.value) {
    for (const item of s.items) {
      if (!map[item.productId]) {
        map[item.productId] = {
          name: item.productName,
          sku: item.sku,
          qty: 0,
          revenue: 0,
        };
      }
      map[item.productId].qty += item.qty;
      map[item.productId].revenue += item.lineTotalUSD;
    }
  }
  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
});

const lowStockAlerts = computed(() => {
  return state.value.products
    .map((p) => {
      const sum = getProductStockSummary(state.value.batches, p.id, today);
      return { product: p, sum };
    })
    .filter(({ product, sum }) => sum.totalSellableQty <= product.reorderLevel);
});

const expiryAlerts = computed(() => {
  return state.value.batches
    .filter((b) => b.shelfQty + b.backroomQty > 0)
    .map((b) => ({
      batch: b,
      product: state.value.products.find((p) => p.id === b.productId),
      days: daysUntil(b.expiryDate, today),
    }))
    .filter((x) => x.days <= 30)
    .sort((a, b) => a.days - b.days);
});
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-6 p-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">Store Overview</h1>
        <p class="text-xs text-zinc-500">
          {{ state.settings.storeName }} · {{ today }} · Rate 1 USD =
          {{ rate.toLocaleString() }} KHR
        </p>
      </div>
      <button
        @click="emit('navigate', 'pos')"
        class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738] whitespace-nowrap"
      >
        Open POS Counter
        <ArrowRight class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- 4-Column KPI Row -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs font-medium text-zinc-500">Today&apos;s Sales</div>
        <div class="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
          {{ formatUSD(metrics.revenueUSD) }}
        </div>
        <div class="mt-0.5 font-mono text-xs text-zinc-500 tabular-nums">
          {{ formatKHR(toKHR(metrics.revenueUSD, rate)) }}
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs font-medium text-zinc-500">Transactions</div>
        <div class="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
          {{ metrics.txCount }}
        </div>
        <div class="mt-0.5 text-xs text-zinc-500">Completed counter bills</div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs font-medium text-zinc-500">Average Basket</div>
        <div class="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
          {{ formatUSD(metrics.avgBasket) }}
        </div>
        <div class="mt-0.5 font-mono text-xs text-zinc-500 tabular-nums">
          Gross margin {{ metrics.grossMarginPct.toFixed(1) }}%
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-4">
        <div class="text-xs font-medium text-zinc-500">Active Cashier Shift</div>
        <template v-if="currentShift">
          <div class="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
            {{ formatUSD(currentShift.expectedCashUSD) }}
          </div>
          <div class="mt-0.5 text-xs text-emerald-700">
            {{ currentShift.cashierName }} · Drawer Open
          </div>
        </template>
        <template v-else>
          <div class="mt-1.5 text-lg font-semibold text-amber-700">Shift Closed</div>
          <button
            @click="emit('navigate', 'shifts')"
            class="mt-1 text-xs font-medium text-[#155E4B] hover:underline"
          >
            Open Shift →
          </button>
        </template>
      </div>
    </div>

    <!-- Main Split: Hourly Chart + Top Products -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-2">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900">Sales by Hour (Peak Times)</h2>
            <p class="text-xs text-zinc-500">Hourly revenue distribution from 08:00 to 20:00</p>
          </div>
          <TrendingUp class="h-4 w-4 text-zinc-400" />
        </div>

        <div class="mt-6 flex h-48 items-end gap-2 border-b border-zinc-200 pb-2">
          <div
            v-for="b in hourlyBuckets"
            :key="b.hour"
            class="group flex flex-1 flex-col items-center gap-1.5"
          >
            <div
              class="font-mono text-[10px] text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 tabular-nums"
            >
              {{ b.amount > 0 ? formatUSD(b.amount) : '' }}
            </div>
            <div class="flex h-36 w-full items-end">
              <div
                :style="{ height: `${Math.max(b.amount > 0 ? 10 : 2, b.pct)}%` }"
                :class="[
                  'w-full rounded-t transition-colors',
                  b.amount > 0 ? 'bg-[#155E4B] group-hover:bg-[#0F4738]' : 'bg-zinc-100',
                ]"
              />
            </div>
          </div>
        </div>
        <div class="mt-2 flex justify-between font-mono text-[10px] text-zinc-400">
          <span v-for="b in hourlyBuckets" :key="b.hour" class="flex-1 text-center">
            {{ b.hour % 2 === 0 ? `${b.hour}h` : '' }}
          </span>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-zinc-900">Top Products Today</h2>
          <Package class="h-4 w-4 text-zinc-400" />
        </div>
        <div class="mt-4 divide-y divide-zinc-100">
          <p v-if="topProducts.length === 0" class="py-8 text-center text-xs text-zinc-500">
            No sales recorded today yet.
          </p>
          <div
            v-else
            v-for="(tp, idx) in topProducts"
            :key="tp.sku"
            class="flex items-center justify-between py-2.5 text-xs"
          >
            <div class="min-w-0 pr-3">
              <div class="truncate font-medium text-zinc-900">{{ idx + 1 }}. {{ tp.name }}</div>
              <div class="text-[11px] text-zinc-500 tabular-nums">
                {{ tp.sku }} · {{ tp.qty }} unit(s) sold
              </div>
            </div>
            <div class="font-mono font-semibold text-zinc-900 tabular-nums">
              {{ formatUSD(tp.revenue) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Split: Low-Stock & Expiry FEFO Alerts -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="rounded-xl border border-zinc-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900">Low-Stock Reorder Alerts</h2>
            <p class="text-xs text-zinc-500">Products at or below safety threshold</p>
          </div>
          <button
            @click="emit('navigate', 'purchasing')"
            class="text-xs font-medium text-[#155E4B] hover:underline"
          >
            Create PO →
          </button>
        </div>
        <div class="mt-3 divide-y divide-zinc-100">
          <p v-if="lowStockAlerts.length === 0" class="py-6 text-center text-xs text-zinc-500">
            All products above reorder level.
          </p>
          <div
            v-else
            v-for="{ product, sum } in lowStockAlerts"
            :key="product.id"
            class="flex items-center justify-between py-2.5 text-xs"
          >
            <div>
              <div class="font-medium text-zinc-900">{{ product.name }}</div>
              <div class="text-[11px] text-zinc-500">
                {{ product.sku }} · Reorder threshold: {{ product.reorderLevel }}
              </div>
            </div>
            <div class="text-right font-mono tabular-nums">
              <span class="font-semibold text-amber-700">{{ sum.totalSellableQty }} left</span>
              <div class="text-[11px] text-zinc-400">
                Shelf {{ sum.shelfQty }} / Back {{ sum.backroomQty }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 bg-white p-5">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900">Expiring &amp; Expired Batches</h2>
            <p class="text-xs text-zinc-500">FEFO queue within 30 days or blocked at POS</p>
          </div>
          <button
            @click="emit('navigate', 'inventory')"
            class="text-xs font-medium text-[#155E4B] hover:underline"
          >
            Manage Batches →
          </button>
        </div>
        <div class="mt-3 divide-y divide-zinc-100">
          <p v-if="expiryAlerts.length === 0" class="py-6 text-center text-xs text-zinc-500">
            No batches expiring within 30 days.
          </p>
          <div
            v-else
            v-for="{ batch, product, days } in expiryAlerts"
            :key="batch.id"
            class="flex items-center justify-between py-2.5 text-xs"
          >
            <div class="flex items-start gap-2">
              <AlertTriangle
                v-if="days <= 0"
                class="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600"
              />
              <Clock v-else class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div>
                <div class="font-medium text-zinc-900">
                  {{ product?.name || batch.productId }}
                </div>
                <div class="font-mono text-[11px] text-zinc-500">
                  Batch {{ batch.batchNumber }} · Exp {{ batch.expiryDate }}
                </div>
              </div>
            </div>
            <div class="text-right font-mono tabular-nums">
              <span v-if="days <= 0" class="font-semibold text-red-600">
                Expired ({{ Math.abs(days) }}d)
              </span>
              <span v-else class="font-semibold text-amber-700">In {{ days }} days</span>
              <div class="text-[11px] text-zinc-400">
                {{ batch.shelfQty + batch.backroomQty }} units
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
