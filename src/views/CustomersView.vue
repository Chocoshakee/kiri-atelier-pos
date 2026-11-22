<script setup lang="ts">
import { computed, ref } from 'vue';
import { Bell, Check, Gift, MessageSquare, Plus, Send, UserPlus, X } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { Customer } from '../types/pos';
import { addDays, daysUntil, formatUSD, getTodayDateStr } from '../utils/fefo';

type CustTab = 'profiles' | 'reminders' | 'vouchers';

const { state, addCustomer, logReminderSent, issueCustomerVoucher } = useStore();
const today = getTodayDateStr();

const tab = ref<CustTab>('profiles');
const search = ref('');
const selectedCustId = ref<string>(state.value.customers[0]?.id || '');
const showAdd = ref(false);
const notice = ref<string | null>(null);

// Add customer state
const name = ref('');
const phone = ref('');
const telegram = ref('');
const skinType = ref<Customer['skinType']>('Combination');
const allergies = ref('');
const birthday = ref('06-15');

const filteredCustomers = computed(() => {
  const q = search.value.trim().toLowerCase();
  return state.value.customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.replace(/\s+/g, '').includes(q.replace(/\s+/g, ''))
  );
});

const selectedCustomer = computed(
  () =>
    state.value.customers.find((c) => c.id === selectedCustId.value) ||
    filteredCustomers.value[0]
);

const customerHistory = computed(() => {
  if (!selectedCustomer.value) return [];
  return state.value.sales.filter((s) => s.customerId === selectedCustomer.value?.id);
});

// Repurchase Reminder Rule Engine
const dueReminders = computed(() => {
  const latestMap = new Map<
    string,
    {
      customer: Customer;
      productId: string;
      productName: string;
      variant: string;
      usageDays: number;
      purchasedOn: string;
    }
  >();

  for (const s of state.value.sales) {
    if (!s.customerId || s.status === 'returned') continue;
    const cust = state.value.customers.find((c) => c.id === s.customerId);
    if (!cust) continue;
    const saleDate = s.createdAt.slice(0, 10);

    for (const item of s.items) {
      const prod = state.value.products.find((p) => p.id === item.productId);
      if (!prod) continue;
      const key = `${cust.id}::${prod.id}`;
      const existing = latestMap.get(key);
      if (!existing || saleDate > existing.purchasedOn) {
        latestMap.set(key, {
          customer: cust,
          productId: prod.id,
          productName: prod.name,
          variant: prod.variant,
          usageDays: prod.usageDays,
          purchasedOn: saleDate,
        });
      }
    }
  }

  const list = [];
  for (const entry of latestMap.values()) {
    const estimatedRunoutDate = addDays(entry.purchasedOn, entry.usageDays);
    const daysUntilEmpty = daysUntil(estimatedRunoutDate, today);
    if (daysUntilEmpty <= 5) {
      const alreadySent = state.value.reminderLogs.some(
        (r) =>
          r.customerId === entry.customer.id &&
          r.productId === entry.productId &&
          r.sentAt.slice(0, 10) === today
      );
      list.push({
        ...entry,
        estimatedRunoutDate,
        daysUntilEmpty,
        alreadySent,
      });
    }
  }

  return list.sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);
});

const tabs = computed(() => [
  { id: 'profiles' as const, label: `Customer Profiles (${state.value.customers.length})` },
  { id: 'reminders' as const, label: `Repurchase Reminders (${dueReminders.value.length} due)` },
  { id: 'vouchers' as const, label: 'Vouchers & Birthdays' },
]);

function handleAddCustomer() {
  const created = addCustomer({
    name: name.value.trim(),
    phone: phone.value.trim(),
    telegram: telegram.value.trim() || undefined,
    skinType: skinType.value,
    allergies: allergies.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    birthday: birthday.value.trim() || undefined,
  });
  selectedCustId.value = created.id;
  showAdd.value = false;
  name.value = '';
  phone.value = '';
  telegram.value = '';
  allergies.value = '';
}

function handleSendReminder(
  customerId: string,
  customerName: string,
  productId: string,
  productName: string,
  channel: 'Telegram' | 'SMS'
) {
  logReminderSent(customerId, productId, channel);
  notice.value = `Sent ${channel} refill reminder to ${customerName} for ${productName}.`;
  setTimeout(() => {
    notice.value = null;
  }, 3500);
}

function handleIssueVoucher(customer: Customer) {
  issueCustomerVoucher(customer.id, 'VIP Skincare $5 Treat', 5, 20);
  notice.value = `Issued new $5 voucher to ${customer.name}.`;
  setTimeout(() => {
    notice.value = null;
  }, 3000);
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-5 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">
          Customers, Loyalty & Repurchase Rules
        </h1>
        <p class="text-xs text-zinc-500">
          Skin profiles, allergy alerts, membership tiers, birthday vouchers, and automated refill reminders
        </p>
      </div>
      <button
        @click="showAdd = true"
        class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
      >
        <UserPlus class="h-3.5 w-3.5" />
        Add Customer
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-1.5">
      <button
        v-for="t in tabs"
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

    <!-- TAB 1: PROFILES -->
    <div v-if="tab === 'profiles'" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="rounded-xl border border-zinc-200 bg-white lg:col-span-2">
        <div class="border-b border-zinc-200 p-3.5">
          <input
            v-model="search"
            placeholder="Search customer by name or phone..."
            class="w-full rounded-lg border border-zinc-200 bg-[#F8F8F7] px-3 py-1.5 text-xs focus:border-[#155E4B] focus:bg-white focus:outline-none"
          />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
                <th class="px-4 py-2.5 font-medium">Customer</th>
                <th class="px-4 py-2.5 font-medium">Skin & Allergies</th>
                <th class="px-4 py-2.5 font-medium">Tier</th>
                <th class="px-4 py-2.5 text-right font-medium">Points</th>
                <th class="px-4 py-2.5 text-right font-medium">Lifetime Spent</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr
                v-for="c in filteredCustomers"
                :key="c.id"
                @click="selectedCustId = c.id"
                :class="[
                  'cursor-pointer hover:bg-zinc-50',
                  selectedCustomer?.id === c.id ? 'bg-emerald-50/40' : '',
                ]"
              >
                <td class="px-4 py-3">
                  <div class="font-semibold text-zinc-900">{{ c.name }}</div>
                  <div class="font-mono text-[11px] text-zinc-500">{{ c.phone }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-zinc-800">{{ c.skinType }}</div>
                  <div class="text-[11px] text-amber-700">
                    {{ c.allergies.length > 0 ? `Avoid: ${c.allergies.join(', ')}` : 'No allergies' }}
                  </div>
                </td>
                <td class="px-4 py-3 font-medium text-zinc-700">{{ c.tier }}</td>
                <td class="px-4 py-3 text-right font-mono font-semibold text-[#155E4B] tabular-nums">
                  {{ c.points }}
                </td>
                <td class="px-4 py-3 text-right font-mono tabular-nums">
                  {{ formatUSD(c.totalSpentUSD) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detail Panel -->
      <div
        v-if="selectedCustomer"
        class="rounded-xl border border-zinc-200 bg-white p-5"
      >
        <div class="border-b border-zinc-100 pb-3">
          <div class="text-base font-bold text-zinc-900">{{ selectedCustomer.name }}</div>
          <div class="mt-0.5 font-mono text-xs text-zinc-500">
            {{ selectedCustomer.phone }}
            {{ selectedCustomer.telegram ? ` · ${selectedCustomer.telegram}` : '' }}
          </div>
        </div>

        <div class="mt-3 space-y-2 text-xs">
          <div class="flex justify-between">
            <span class="text-zinc-500">Tier & Points</span>
            <span class="font-mono font-semibold text-zinc-900 tabular-nums">
              {{ selectedCustomer.tier }} · {{ selectedCustomer.points }} pts
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-500">Skin Profile</span>
            <span class="font-medium text-zinc-900">{{ selectedCustomer.skinType }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-500">Allergies</span>
            <span class="font-medium text-amber-700">
              {{ selectedCustomer.allergies.join(', ') || 'None' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-500">Visits</span>
            <span class="font-mono tabular-nums">{{ selectedCustomer.visitCount }}</span>
          </div>
        </div>

        <div class="mt-4 border-t border-zinc-100 pt-3">
          <h3 class="text-xs font-semibold text-zinc-800">Purchase History</h3>
          <div class="mt-2 max-h-56 space-y-2 overflow-y-auto">
            <p v-if="customerHistory.length === 0" class="text-xs text-zinc-400">
              No recorded purchases yet.
            </p>
            <div
              v-else
              v-for="s in customerHistory"
              :key="s.id"
              class="rounded-lg border border-zinc-200 p-2.5 text-xs"
            >
              <div class="flex justify-between font-mono">
                <span class="font-semibold text-zinc-900">{{ s.receiptNo }}</span>
                <span class="font-semibold tabular-nums">{{ formatUSD(s.totalUSD) }}</span>
              </div>
              <div class="mt-0.5 text-[11px] text-zinc-500">
                {{ s.createdAt.slice(0, 10) }} ·
                {{ s.items.map((i) => `${i.productName} (×${i.qty})`).join(', ') }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: REPURCHASE REMINDERS -->
    <div v-if="tab === 'reminders'" class="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
        <div>
          <h2 class="text-sm font-semibold text-zinc-900">
            Automated Repurchase Reminder Queue
          </h2>
          <p class="text-xs text-zinc-500">
            Rule: Flag customers when <span class="font-mono">purchaseDate + product.usageDays</span>
            is within 5 days or overdue
          </p>
        </div>
        <Bell class="h-4 w-4 text-zinc-400" />
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 bg-[#F8F8F7] text-zinc-500">
              <th class="px-4 py-3 font-medium">Customer</th>
              <th class="px-4 py-3 font-medium">Product Purchased</th>
              <th class="px-4 py-3 font-mono font-medium">Last Bought</th>
              <th class="px-4 py-3 font-mono font-medium">Est. Empty Date</th>
              <th class="px-4 py-3 text-right font-medium">Status</th>
              <th class="px-4 py-3 text-right font-medium">Send Refill Reminder</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-if="dueReminders.length === 0">
              <td colspan="6" class="py-10 text-center text-xs text-zinc-400">
                No customers are currently due for a product refill.
              </td>
            </tr>
            <tr
              v-else
              v-for="r in dueReminders"
              :key="`${r.customer.id}-${r.productId}`"
              class="hover:bg-zinc-50"
            >
              <td class="px-4 py-3">
                <div class="font-semibold text-zinc-900">{{ r.customer.name }}</div>
                <div class="font-mono text-[11px] text-zinc-500">{{ r.customer.phone }}</div>
              </td>
              <td class="px-4 py-3">
                <div class="font-medium text-zinc-800">{{ r.productName }}</div>
                <div class="text-[11px] text-zinc-500">
                  {{ r.variant }} · {{ r.usageDays }}-day cycle
                </div>
              </td>
              <td class="px-4 py-3 font-mono text-zinc-600 tabular-nums">
                {{ r.purchasedOn }}
              </td>
              <td class="px-4 py-3 font-mono text-zinc-800 tabular-nums">
                {{ r.estimatedRunoutDate }}
              </td>
              <td class="px-4 py-3 text-right font-mono tabular-nums">
                <span v-if="r.daysUntilEmpty < 0" class="font-semibold text-amber-700">
                  {{ Math.abs(r.daysUntilEmpty) }}d overdue
                </span>
                <span v-else-if="r.daysUntilEmpty === 0" class="font-semibold text-amber-700">
                  Finishes today
                </span>
                <span v-else class="text-zinc-600">In {{ r.daysUntilEmpty }}d</span>
              </td>
              <td class="px-4 py-3 text-right">
                <span
                  v-if="r.alreadySent"
                  class="inline-flex items-center gap-1 font-medium text-emerald-700"
                >
                  <Check class="h-3.5 w-3.5" />
                  Sent today
                </span>
                <div v-else class="inline-flex items-center gap-1.5">
                  <button
                    @click="
                      handleSendReminder(
                        r.customer.id,
                        r.customer.name,
                        r.productId,
                        r.productName,
                        'Telegram'
                      )
                    "
                    class="inline-flex items-center gap-1 rounded-md bg-[#155E4B] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#0F4738]"
                  >
                    <Send class="h-3 w-3" />
                    Telegram
                  </button>
                  <button
                    @click="
                      handleSendReminder(
                        r.customer.id,
                        r.customer.name,
                        r.productId,
                        r.productName,
                        'SMS'
                      )
                    "
                    class="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    <MessageSquare class="h-3 w-3" />
                    SMS
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: VOUCHERS & BIRTHDAYS -->
    <div v-if="tab === 'vouchers'" class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div
        v-for="c in state.customers"
        :key="c.id"
        class="rounded-xl border border-zinc-200 bg-white p-4"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-zinc-900">{{ c.name }}</div>
            <div class="text-xs text-zinc-500">
              {{ c.tier }} · Birthday: {{ c.birthday || 'Not set' }} · {{ c.points }} pts
            </div>
          </div>
          <button
            @click="handleIssueVoucher(c)"
            class="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Gift class="h-3 w-3 text-[#155E4B]" />
            Issue $5 Voucher
          </button>
        </div>
        <div class="mt-3 space-y-1.5">
          <p v-if="c.vouchers.length === 0" class="text-xs text-zinc-400">No active vouchers.</p>
          <div
            v-else
            v-for="v in c.vouchers"
            :key="v.code"
            class="flex items-center justify-between rounded-lg border border-zinc-100 bg-[#F8F8F7] px-3 py-2 text-xs"
          >
            <div>
              <span class="font-mono font-bold text-zinc-900">{{ v.code }}</span>
              <span class="ml-2 text-zinc-600">{{ v.title }}</span>
            </div>
            <span
              :class="[
                'font-mono text-[11px] font-medium',
                v.used ? 'text-zinc-400 line-through' : 'text-emerald-700',
              ]"
            >
              {{
                v.used
                  ? 'Redeemed'
                  : `${formatUSD(v.discountUSD)} off (min ${formatUSD(v.minSpendUSD)})`
              }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ADD CUSTOMER MODAL -->
    <div
      v-if="showAdd"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleAddCustomer"
        class="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">New Customer Profile</h3>
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
            <label class="block text-xs font-medium text-zinc-700">Name</label>
            <input
              required
              v-model="name"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-700">Phone</label>
              <input
                required
                v-model="phone"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-700">Telegram</label>
              <input
                v-model="telegram"
                placeholder="@username"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-700">Skin Type</label>
              <select
                v-model="skinType"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
              >
                <option value="Normal">Normal</option>
                <option value="Dry">Dry</option>
                <option value="Oily">Oily</option>
                <option value="Combination">Combination</option>
                <option value="Sensitive">Sensitive</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-700">Birthday (MM-DD)</label>
              <input
                v-model="birthday"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">
              Allergies / Avoid (comma separated)
            </label>
            <input
              v-model="allergies"
              placeholder="Fragrance, Retinol..."
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
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
            class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            <Plus class="h-3.5 w-3.5" />
            Save Profile
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
