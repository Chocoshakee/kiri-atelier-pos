<script setup lang="ts">
import { computed, ref } from 'vue';
import { Barcode, Edit3, Plus, Printer, Search, X } from 'lucide-vue-next';
import ProductImage from '../components/ProductImage.vue';
import { useStore } from '../composables/useStore';
import { Product, ProductCategory, SkinConcern } from '../types/pos';
import {
  formatKHR,
  formatUSD,
  getProductStockSummary,
  getTodayDateStr,
  toKHR,
} from '../utils/fefo';
import { canEditCatalog } from '../utils/permissions';

const ALL_CATEGORIES: ProductCategory[] = [
  'Cleanser',
  'Serum',
  'Sunscreen',
  'Moisturizer',
  'Toner',
  'Set',
];

const ALL_CONCERNS: SkinConcern[] = [
  'Hydration',
  'Acne',
  'Brightening',
  'Anti-Aging',
  'Sensitive',
  'SPF Protection',
];

const { state, activeStaff, addProduct, updateProduct } = useStore();
const canEdit = computed(() => canEditCatalog(activeStaff.value.role));
const rate = computed(() => state.value.settings.exchangeRateKHR);
const today = getTodayDateStr();

const search = ref('');
const catFilter = ref<'All' | ProductCategory>('All');
const concernFilter = ref<'All' | SkinConcern>('All');

const editingProduct = ref<Product | null>(null);
const showAddModal = ref(false);
const labelProduct = ref<Product | null>(null);

// Add/Edit form state
const formName = ref('');
const formNameKm = ref('');
const formBrand = ref('Sora Lab');
const formSku = ref('');
const formBarcode = ref('');
const formCat = ref<ProductCategory>('Serum');
const formVariant = ref('30ml');
const formRetail = ref('24.00');
const formCost = ref('12.00');
const formReorder = ref('8');
const formUsageDays = ref('30');
const formConcerns = ref<SkinConcern[]>(['Hydration']);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return state.value.products.filter((p) => {
    if (catFilter.value !== 'All' && p.category !== catFilter.value) return false;
    if (concernFilter.value !== 'All' && !p.concerns.includes(concernFilter.value)) return false;
    if (q) {
      const hay = `${p.name} ${p.nameKm} ${p.sku} ${p.barcode} ${p.brand}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

function openEdit(p: Product) {
  editingProduct.value = p;
  formName.value = p.name;
  formNameKm.value = p.nameKm;
  formBrand.value = p.brand;
  formSku.value = p.sku;
  formBarcode.value = p.barcode;
  formCat.value = p.category;
  formVariant.value = p.variant;
  formRetail.value = p.retailPrice.toFixed(2);
  formCost.value = p.costPrice.toFixed(2);
  formReorder.value = String(p.reorderLevel);
  formUsageDays.value = String(p.usageDays);
  formConcerns.value = [...p.concerns];
  showAddModal.value = true;
}

function openNew() {
  editingProduct.value = null;
  formName.value = '';
  formNameKm.value = '';
  formBrand.value = 'Sora Lab';
  formSku.value = `SL-NEW-${state.value.products.length + 1}`;
  formBarcode.value = `8850123400${String(100 + state.value.products.length + 1)}`;
  formCat.value = 'Serum';
  formVariant.value = '30ml';
  formRetail.value = '24.00';
  formCost.value = '12.00';
  formReorder.value = '8';
  formUsageDays.value = '30';
  formConcerns.value = ['Hydration'];
  showAddModal.value = true;
}

function handleSaveProduct() {
  const defaultImage =
    state.value.products.find((p) => p.category === formCat.value)?.image ||
    state.value.products[0]?.image ||
    '';

  const payload = {
    name: formName.value.trim(),
    nameKm: formNameKm.value.trim() || formName.value.trim(),
    brand: formBrand.value.trim(),
    sku: formSku.value.trim(),
    barcode: formBarcode.value.trim(),
    category: formCat.value,
    variant: formVariant.value.trim(),
    concerns: formConcerns.value,
    retailPrice: parseFloat(formRetail.value) || 0,
    costPrice: parseFloat(formCost.value) || 0,
    reorderLevel: parseInt(formReorder.value, 10) || 5,
    usageDays: parseInt(formUsageDays.value, 10) || 30,
    image: editingProduct.value?.image || defaultImage,
    allergens: editingProduct.value?.allergens || [],
    active: true,
  };

  if (editingProduct.value) {
    updateProduct({ ...editingProduct.value, ...payload });
  } else {
    addProduct(payload);
  }
  showAddModal.value = false;
}

function toggleConcern(c: SkinConcern) {
  formConcerns.value = formConcerns.value.includes(c)
    ? formConcerns.value.filter((x) => x !== c)
    : [...formConcerns.value, c];
}

function getStock(productId: string) {
  return getProductStockSummary(state.value.batches, productId, today);
}

function getMarginPct(p: Product) {
  return p.retailPrice > 0 ? ((p.retailPrice - p.costPrice) / p.retailPrice) * 100 : 0;
}

function triggerPrint() {
  window.print();
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">Products & Pricing</h1>
        <p class="text-xs text-zinc-500">
          SKUs, variants, skin-concern tags, retail/cost margins, and shelf barcode labels
        </p>
      </div>
      <button
        v-if="canEdit"
        @click="openNew"
        class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738] whitespace-nowrap"
      >
        <Plus class="h-3.5 w-3.5" />
        Add Product
      </button>
      <span v-else class="text-xs text-zinc-500">
        Read-only catalog (Manager/Admin to edit)
      </span>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3.5">
      <div class="relative min-w-[240px] flex-1">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
        />
        <input
          v-model="search"
          placeholder="Search product name, SKU, barcode, brand..."
          class="w-full rounded-lg border border-zinc-200 bg-[#F8F8F7] py-1.5 pl-8 pr-3 text-xs focus:border-[#155E4B] focus:bg-white focus:outline-none"
        />
      </div>
      <select
        v-model="catFilter"
        class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium"
      >
        <option value="All">All Categories</option>
        <option v-for="c in ALL_CATEGORIES" :key="c" :value="c">
          {{ c }}
        </option>
      </select>
      <select
        v-model="concernFilter"
        class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium"
      >
        <option value="All">All Skin Concerns</option>
        <option v-for="c in ALL_CONCERNS" :key="c" :value="c">
          {{ c }}
        </option>
      </select>
    </div>

    <!-- Product Table -->
    <div class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-200 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-3 font-medium">Product</th>
              <th class="px-4 py-3 font-medium">SKU / Barcode</th>
              <th class="px-4 py-3 font-medium">Category & Concerns</th>
              <th class="px-4 py-3 text-right font-medium">Cost</th>
              <th class="px-4 py-3 text-right font-medium">Retail (USD / KHR)</th>
              <th class="px-4 py-3 text-right font-medium">Margin</th>
              <th class="px-4 py-3 text-right font-medium">Sellable Stock</th>
              <th class="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="p in filtered" :key="p.id" class="hover:bg-zinc-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <ProductImage
                    :src="p.image"
                    :alt="p.name"
                    className="h-10 w-12 shrink-0 rounded-md border border-zinc-200"
                  />
                  <div>
                    <div class="font-semibold text-zinc-900">{{ p.name }}</div>
                    <div class="text-[11px] text-zinc-500">
                      {{ p.brand }} · {{ p.variant }} · Refill {{ p.usageDays }}d
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 font-mono text-[11px] text-zinc-600 tabular-nums">
                <div>{{ p.sku }}</div>
                <div class="text-zinc-400">{{ p.barcode }}</div>
              </td>
              <td class="px-4 py-3 text-zinc-600">
                <div class="font-medium text-zinc-800">{{ p.category }}</div>
                <div class="text-[11px] text-zinc-500">{{ p.concerns.join(' · ') }}</div>
              </td>
              <td class="px-4 py-3 text-right font-mono text-zinc-600 tabular-nums">
                {{ formatUSD(p.costPrice) }}
              </td>
              <td class="px-4 py-3 text-right font-mono tabular-nums">
                <div class="font-semibold text-zinc-900">
                  {{ formatUSD(p.retailPrice) }}
                </div>
                <div class="text-[11px] text-zinc-500">
                  {{ formatKHR(toKHR(p.retailPrice, rate)) }}
                </div>
              </td>
              <td class="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                {{ getMarginPct(p).toFixed(1) }}%
              </td>
              <td class="px-4 py-3 text-right font-mono tabular-nums">
                <span
                  :class="
                    getStock(p.id).totalSellableQty <= p.reorderLevel
                      ? 'font-semibold text-amber-700'
                      : 'text-zinc-800'
                  "
                >
                  {{ getStock(p.id).totalSellableQty }}
                </span>
                <div class="text-[10px] text-zinc-400">
                  S:{{ getStock(p.id).shelfQty }} / B:{{ getStock(p.id).backroomQty }}
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="inline-flex items-center gap-1">
                  <button
                    @click="labelProduct = p"
                    class="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                    title="Print Shelf Barcode Label"
                  >
                    <Barcode class="inline h-3.5 w-3.5" />
                  </button>
                  <button
                    v-if="canEdit"
                    @click="openEdit(p)"
                    class="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                    title="Edit Product & Price"
                  >
                    <Edit3 class="inline h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add / Edit Product Modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleSaveProduct"
        class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">
            {{ editingProduct ? `Edit ${editingProduct.name}` : 'Add Skincare Product' }}
          </h3>
          <button
            type="button"
            @click="showAddModal = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="block text-xs font-medium text-zinc-700">Product Name (EN)</label>
            <input
              required
              v-model="formName"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div class="sm:col-span-2">
            <label class="block text-xs font-medium text-zinc-700">Product Name (Khmer)</label>
            <input
              v-model="formNameKm"
              placeholder="Optional Khmer label for receipts"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Brand</label>
            <input
              required
              v-model="formBrand"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Category</label>
            <select
              v-model="formCat"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            >
              <option v-for="c in ALL_CATEGORIES" :key="c" :value="c">
                {{ c }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">SKU</label>
            <input
              required
              v-model="formSku"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Barcode (EAN-13)</label>
            <input
              required
              v-model="formBarcode"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Variant (Size / Shade)</label>
            <input
              required
              v-model="formVariant"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">
              Est. Usage Duration (Days)
            </label>
            <input
              type="number"
              v-model="formUsageDays"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Cost Price (USD)</label>
            <input
              required
              type="number"
              step="0.01"
              v-model="formCost"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Retail Price (USD)</label>
            <input
              required
              type="number"
              step="0.01"
              v-model="formRetail"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Reorder Threshold</label>
            <input
              type="number"
              v-model="formReorder"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums"
            />
          </div>
          <div class="sm:col-span-2">
            <label class="block text-xs font-medium text-zinc-700">Skin Concerns</label>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                v-for="c in ALL_CONCERNS"
                :key="c"
                @click="toggleConcern(c)"
                :class="[
                  'rounded-md border px-2.5 py-1 text-xs font-medium',
                  formConcerns.includes(c)
                    ? 'border-[#155E4B] bg-[#155E4B] text-white'
                    : 'border-zinc-200 bg-white text-zinc-600',
                ]"
              >
                {{ c }}
              </button>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            @click="showAddModal = false"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-[#155E4B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            Save Product
          </button>
        </div>
      </form>
    </div>

    <!-- Barcode / Shelf Label Preview Modal -->
    <div
      v-if="labelProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <div class="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-sm font-semibold text-zinc-900">Shelf & Barcode Label</h3>
          <button
            @click="labelProduct = null"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div
          id="printable-label"
          class="mt-4 rounded-lg border-2 border-zinc-900 bg-white p-4 text-center"
        >
          <div class="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {{ labelProduct.brand }} · {{ labelProduct.variant }}
          </div>
          <div class="mt-0.5 text-sm font-bold text-zinc-900">{{ labelProduct.name }}</div>
          <div class="text-xs text-zinc-600">{{ labelProduct.nameKm }}</div>

          <div class="mt-2 flex items-baseline justify-center gap-3 font-mono">
            <span class="text-xl font-bold text-zinc-900 tabular-nums">
              {{ formatUSD(labelProduct.retailPrice) }}
            </span>
            <span class="text-xs text-zinc-600 tabular-nums">
              {{ formatKHR(toKHR(labelProduct.retailPrice, rate)) }}
            </span>
          </div>

          <!-- Clean Barcode Vector -->
          <div
            class="mx-auto mt-3 flex h-12 w-48 items-stretch justify-center gap-[2px] border-t border-zinc-200 pt-2"
          >
            <template v-for="(ch, idx) in labelProduct.barcode.split('')" :key="idx">
              <div
                class="bg-zinc-900"
                :style="{ width: `${((parseInt(ch, 10) || 1) % 3) + 1}px` }"
              />
              <div class="w-[1px] bg-white" />
            </template>
          </div>
          <div class="mt-1 font-mono text-[10px] tracking-[0.2em] text-zinc-700">
            {{ labelProduct.barcode }}
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            @click="labelProduct = null"
            class="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700"
          >
            Close
          </button>
          <button
            @click="triggerPrint"
            class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            <Printer class="h-3.5 w-3.5" />
            Print Label
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
