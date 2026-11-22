<script setup lang="ts">
import { ref } from 'vue';
import { Calendar, Plus, Tag, X } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { ProductCategory, Promotion } from '../types/pos';
import { addDays, formatUSD, getTodayDateStr } from '../utils/fefo';

const CATEGORIES: ProductCategory[] = [
  'Cleanser',
  'Serum',
  'Sunscreen',
  'Moisturizer',
  'Toner',
  'Set',
];

const { state, addPromotion, togglePromotion } = useStore();
const today = getTodayDateStr();

const showAdd = ref(false);
const name = ref('');
const nameKm = ref('');
const type = ref<Promotion['type']>('percent_category');
const targetCategory = ref<ProductCategory>('Serum');
const discountPercent = ref('15');
const bundlePriceUSD = ref('39');
const startDate = ref(today);
const endDate = ref(addDays(today, 14));

function handleAdd() {
  addPromotion({
    name: name.value.trim(),
    nameKm: nameKm.value.trim() || name.value.trim(),
    type: type.value,
    targetCategory:
      type.value === 'percent_category' || type.value === 'bogo'
        ? targetCategory.value
        : undefined,
    targetProductIds:
      type.value === 'bundle'
        ? [state.value.products[0]?.id, state.value.products[2]?.id]
        : undefined,
    discountPercent:
      type.value === 'percent_category' ? parseFloat(discountPercent.value) || 10 : undefined,
    bundlePriceUSD: type.value === 'bundle' ? parseFloat(bundlePriceUSD.value) || 40 : undefined,
    startDate: startDate.value,
    endDate: endDate.value,
    active: true,
  });
  showAdd.value = false;
  name.value = '';
  nameKm.value = '';
}

function getBundleSkus(ids?: string[]) {
  return (ids || [])
    .map((id) => state.value.products.find((pr) => pr.id === id)?.sku)
    .join(' + ');
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">
          Promotions & Bundles
        </h1>
        <p class="text-xs text-zinc-500">
          Scheduled category discounts, Buy 1 Get 1 offers, and skincare bundle sets auto-applied at POS
        </p>
      </div>
      <button
        @click="showAdd = true"
        class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
      >
        <Plus class="h-3.5 w-3.5" />
        New Promotion
      </button>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="p in state.promotions"
        :key="p.id"
        class="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5"
      >
        <div>
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Tag class="h-3.5 w-3.5 text-[#155E4B]" />
              <span class="uppercase">{{ p.type.replace('_', ' ') }}</span>
            </div>
            <button
              @click="togglePromotion(p.id)"
              :class="[
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                p.active
                  ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200',
              ]"
            >
              {{ p.active ? 'Active' : 'Paused' }}
            </button>
          </div>

          <h3 class="mt-2.5 text-sm font-bold text-zinc-900">{{ p.name }}</h3>
          <p class="text-xs text-zinc-500">{{ p.nameKm }}</p>

          <div class="mt-3 rounded-lg bg-[#F8F8F7] px-3 py-2 text-xs text-zinc-700">
            <span v-if="p.type === 'percent_category'">
              <strong>{{ p.discountPercent }}% off</strong> all
              <strong>{{ p.targetCategory }}</strong> items
            </span>
            <span v-else-if="p.type === 'bogo'">
              <strong>Buy 1 Get 1</strong> on <strong>{{ p.targetCategory }}</strong>
            </span>
            <span v-else-if="p.type === 'bundle'">
              Bundle set for
              <strong class="font-mono">{{ formatUSD(p.bundlePriceUSD || 0) }}</strong> ({{
                getBundleSkus(p.targetProductIds)
              }})
            </span>
          </div>
        </div>

        <div
          class="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 font-mono text-[11px] text-zinc-500"
        >
          <span class="inline-flex items-center gap-1">
            <Calendar class="h-3 w-3" />
            {{ p.startDate }} → {{ p.endDate }}
          </span>
          <span :class="p.startDate <= today && p.endDate >= today ? 'text-emerald-700' : 'text-zinc-400'">
            {{ p.startDate <= today && p.endDate >= today ? 'In window' : 'Scheduled' }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="showAdd"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleAdd"
        class="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">Create Promotion</h3>
          <button
            type="button"
            @click="showAdd = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="mt-4 space-y-3">
          <div>
            <label class="block text-xs font-medium text-zinc-700">Promotion Title</label>
            <input
              required
              v-model="name"
              placeholder="e.g. Weekend Sunscreen 15% Off"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Khmer Label</label>
            <input
              v-model="nameKm"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-700">Rule Type</label>
              <select
                v-model="type"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              >
                <option value="percent_category">Category % Discount</option>
                <option value="bogo">Buy 1 Get 1 (Category)</option>
                <option value="bundle">Serum + SPF Bundle</option>
              </select>
            </div>
            <div v-if="type !== 'bundle'">
              <label class="block text-xs font-medium text-zinc-700">Category</label>
              <select
                v-model="targetCategory"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              >
                <option v-for="c in CATEGORIES" :key="c" :value="c">
                  {{ c }}
                </option>
              </select>
            </div>
            <div v-else>
              <label class="block text-xs font-medium text-zinc-700">Bundle Price ($)</label>
              <input
                type="number"
                v-model="bundlePriceUSD"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
              />
            </div>
          </div>
          <div v-if="type === 'percent_category'">
            <label class="block text-xs font-medium text-zinc-700">Discount (%)</label>
            <input
              type="number"
              min="1"
              max="90"
              v-model="discountPercent"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-700">Start Date</label>
              <input
                type="date"
                v-model="startDate"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-700">End Date</label>
              <input
                type="date"
                v-model="endDate"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
              />
            </div>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            @click="showAdd = false"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            Save Promotion
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
