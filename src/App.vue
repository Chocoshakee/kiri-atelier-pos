<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import {
  BarChart3,
  Boxes,
  Clock,
  LayoutDashboard,
  Lock,
  Package,
  Percent,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
} from 'lucide-vue-next';
import UserSwitchModal from './components/UserSwitchModal.vue';
import { useStore } from './composables/useStore';
import { LanguageMode, ModuleId } from './types/pos';
import { tr } from './utils/fefo';
import { canAccessModule, ROLE_LABELS } from './utils/permissions';
import CustomersView from './views/CustomersView.vue';
import DashboardView from './views/DashboardView.vue';
import InventoryView from './views/InventoryView.vue';
import PosView from './views/PosView.vue';
import ProductsView from './views/ProductsView.vue';
import PromotionsView from './views/PromotionsView.vue';
import PurchasingView from './views/PurchasingView.vue';
import ReportsView from './views/ReportsView.vue';
import SettingsView from './views/SettingsView.vue';
import ShiftsView from './views/ShiftsView.vue';

const NAV_ITEMS: { id: ModuleId; icon: Component }[] = [
  { id: 'pos', icon: ShoppingCart },
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'shifts', icon: Clock },
  { id: 'products', icon: Package },
  { id: 'inventory', icon: Boxes },
  { id: 'purchasing', icon: Truck },
  { id: 'customers', icon: Users },
  { id: 'promotions', icon: Percent },
  { id: 'reports', icon: BarChart3 },
  { id: 'settings', icon: Settings },
];

const { state, activeStaff, currentShift, updateSettings } = useStore();
const activeModule = ref<ModuleId>('pos');
const showUserSwitcher = ref(false);
const isLocked = ref(false);

const lang = computed(() => state.value.settings.language);
const visibleNavItems = computed(() =>
  NAV_ITEMS.filter((item) => canAccessModule(activeStaff.value.role, item.id))
);

// Redirect back to POS if active role loses access to current view
watch(
  [() => activeStaff.value.role, activeModule],
  ([role, mod]) => {
    if (!canAccessModule(role, mod)) {
      activeModule.value = 'pos';
    }
  },
  { immediate: true }
);

function onGlobalKeyDown(e: KeyboardEvent) {
  if (showUserSwitcher.value && !isLocked.value && e.key === 'Escape') {
    e.preventDefault();
    showUserSwitcher.value = false;
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeyDown);
});

function cycleLanguage() {
  const order: LanguageMode[] = ['bilingual', 'en', 'km'];
  const next = order[(order.indexOf(lang.value) + 1) % order.length];
  updateSettings({ language: next });
}
</script>

<template>
  <div class="flex min-h-screen bg-[#F8F8F7] text-zinc-900">
    <!-- Left 236px Sidebar Navigation -->
    <aside class="hidden w-[236px] shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
      <div class="flex h-[57px] items-center border-b border-zinc-200 px-5">
        <span class="font-display text-base font-bold tracking-tight text-zinc-900 whitespace-nowrap">
          Kiri Atelier POS
        </span>
      </div>

      <nav class="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        <button
          v-for="item in visibleNavItems"
          :key="item.id"
          @click="activeModule = item.id"
          :class="[
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors whitespace-nowrap',
            activeModule === item.id
              ? 'bg-[#155E4B] text-white'
              : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
          ]"
        >
          <component :is="item.icon" class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ tr(item.id, lang === 'km' ? 'km' : 'en') }}</span>
        </button>
      </nav>

      <!-- Active Staff User & Switch / Lock Controls -->
      <div class="space-y-2 border-t border-zinc-200 p-3">
        <div class="px-1">
          <div class="truncate text-xs font-semibold text-zinc-900">
            {{ activeStaff.name }}
          </div>
          <div class="text-[11px] text-zinc-500">
            {{ ROLE_LABELS[activeStaff.role] }} · {{ currentShift ? 'Shift Open' : 'Shift Closed' }}
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            @click="showUserSwitcher = true"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-[#F8F8F7] px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 whitespace-nowrap"
          >
            <UserCheck class="h-3.5 w-3.5" />
            Switch User
          </button>
          <button
            @click="isLocked = true"
            class="flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-100"
            title="Lock POS Register"
            aria-label="Lock POS Register"
          >
            <Lock class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Top Bar Contract: Breadcrumb on Left, Language + Operator Switcher on Right -->
      <header class="flex h-[57px] items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5">
        <div class="flex items-center gap-3 overflow-x-auto">
          <!-- Mobile compact module selector -->
          <select
            v-model="activeModule"
            class="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold md:hidden"
            aria-label="Select module"
          >
            <option v-for="item in visibleNavItems" :key="item.id" :value="item.id">
              {{ tr(item.id, 'en') }}
            </option>
          </select>

          <div class="hidden items-center gap-2 text-xs md:flex">
            <span class="text-zinc-400">Kiri Atelier · BKK1</span>
            <span class="text-zinc-300">/</span>
            <span class="font-semibold text-zinc-900">{{ tr(activeModule, lang) }}</span>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2.5">
          <span class="hidden font-mono text-[11px] text-zinc-500 lg:inline tabular-nums">
            1 USD = {{ state.settings.exchangeRateKHR.toLocaleString() }} KHR
          </span>
          <button
            @click="cycleLanguage"
            class="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
            title="Switch English / Bilingual / Khmer"
          >
            {{ lang === 'bilingual' ? 'EN / ខ្មែរ' : lang === 'km' ? 'ខ្មែរ' : 'English' }}
          </button>
          <button
            @click="showUserSwitcher = true"
            class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-[#F8F8F7] px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 whitespace-nowrap"
          >
            <UserCheck class="h-3.5 w-3.5 text-[#155E4B]" />
            <span>{{ activeStaff.name }}</span>
            <span class="text-zinc-400">·</span>
            <span class="text-[#155E4B]">{{ ROLE_LABELS[activeStaff.role] }}</span>
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <PosView
          v-if="activeModule === 'pos'"
          :shortcutsDisabled="showUserSwitcher || isLocked"
        />
        <DashboardView
          v-else-if="activeModule === 'dashboard'"
          @navigate="(mod) => (activeModule = mod)"
        />
        <ShiftsView v-else-if="activeModule === 'shifts'" />
        <ProductsView v-else-if="activeModule === 'products'" />
        <InventoryView v-else-if="activeModule === 'inventory'" />
        <PurchasingView v-else-if="activeModule === 'purchasing'" />
        <CustomersView v-else-if="activeModule === 'customers'" />
        <PromotionsView v-else-if="activeModule === 'promotions'" />
        <ReportsView v-else-if="activeModule === 'reports'" />
        <SettingsView v-else-if="activeModule === 'settings'" />
      </main>
    </div>

    <!-- Staff PIN Switcher Modal -->
    <UserSwitchModal
      v-if="showUserSwitcher"
      mode="switch"
      @close="showUserSwitcher = false"
    />

    <!-- Full-Screen Register Lock Screen -->
    <UserSwitchModal
      v-if="isLocked"
      mode="switch"
      :locked="true"
      @authorized="isLocked = false"
    />
  </div>
</template>
