<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDownLeft, ArrowUpRight, Lock, Printer, Unlock } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { formatKHR, formatUSD, toKHR } from '../utils/fefo';

const { state, currentShift, activeStaff, openShift, addCashMovement, closeShift } = useStore();
const rate = computed(() => state.value.settings.exchangeRateKHR);

const openCashierId = ref(activeStaff.value.id);
const openingUSD = ref('150');
const openingKHR = ref('200000');

const moveType = ref<'in' | 'out'>('out');
const moveUSD = ref('');
const moveKHR = ref('0');
const moveReason = ref('');

const countedCashUSD = ref('');
const closeNotes = ref('');

const shiftSales = computed(() => {
  if (!currentShift.value) return [];
  return state.value.sales.filter(
    (s) => s.shiftId === currentShift.value!.id && s.status !== 'returned'
  );
});

const shiftTotals = computed(() => {
  let cashUSD = 0;
  let cardUSD = 0;
  let abaUSD = 0;
  for (const s of shiftSales.value) {
    cashUSD += s.payment.cashUSD + s.payment.cashKHR / rate.value;
    cardUSD += s.payment.cardUSD;
    abaUSD += s.payment.abaQrUSD;
  }
  const totalSales = cashUSD + cardUSD + abaUSD;
  return { cashUSD, cardUSD, abaUSD, totalSales };
});

const currentMovements = computed(() => {
  if (!currentShift.value) return [];
  return state.value.cashMovements.filter((m) => m.shiftId === currentShift.value!.id);
});

const previewVariance = computed(() => {
  if (!currentShift.value || countedCashUSD.value === '') return null;
  return Number(
    ((parseFloat(countedCashUSD.value) || 0) - currentShift.value.expectedCashUSD).toFixed(2)
  );
});

function handleOpenShift() {
  openShift(openCashierId.value, parseFloat(openingUSD.value) || 0, parseFloat(openingKHR.value) || 0);
}

function handleCashMovement() {
  if (!moveReason.value.trim()) return;
  addCashMovement(
    moveType.value,
    parseFloat(moveUSD.value) || 0,
    parseFloat(moveKHR.value) || 0,
    moveReason.value.trim()
  );
  moveUSD.value = '';
  moveKHR.value = '0';
  moveReason.value = '';
}

function handleCloseShift() {
  const counted = parseFloat(countedCashUSD.value);
  if (isNaN(counted)) return;
  closeShift(counted, closeNotes.value.trim() || undefined);
  countedCashUSD.value = '';
  closeNotes.value = '';
}

function printReport() {
  window.print();
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] space-y-6 p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-zinc-900">Cash &amp; Shifts</h1>
        <p class="text-xs text-zinc-500">
          Drawer float management, petty cash in/out, reconciliation, and daily Z-Report
        </p>
      </div>
      <button
        @click="printReport"
        class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <Printer class="h-3.5 w-3.5" />
        Print Z-Report
      </button>
    </div>

    <form
      v-if="!currentShift"
      @submit.prevent="handleOpenShift"
      class="max-w-lg rounded-xl border border-zinc-200 bg-white p-6"
    >
      <div class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Unlock class="h-4 w-4 text-[#155E4B]" />
        Open New Cashier Shift
      </div>
      <p class="mt-1 text-xs text-zinc-500">
        Count the starting drawer float in USD and KHR before ringing up POS sales.
      </p>
      <div class="mt-4 space-y-3">
        <div>
          <label class="block text-xs font-medium text-zinc-700">Cashier</label>
          <select
            v-model="openCashierId"
            class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          >
            <option v-for="s in state.staff" :key="s.id" :value="s.id">
              {{ s.name }} ({{ s.role }})
            </option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-700">Opening Float (USD)</label>
            <input
              type="number"
              step="0.5"
              v-model="openingUSD"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs tabular-nums"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Opening Float (KHR)</label>
            <input
              type="number"
              step="1000"
              v-model="openingKHR"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs tabular-nums"
            />
          </div>
        </div>
      </div>
      <button
        type="submit"
        class="mt-5 rounded-lg bg-[#155E4B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
      >
        Open Shift &amp; Unlock Drawer
      </button>
    </form>

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Active Shift Z-Report Summary -->
      <div id="printable-zreport" class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-2">
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900">
              Current Shift Summary · {{ currentShift.cashierName }}
            </h2>
            <p class="font-mono text-[11px] text-zinc-500">
              Opened {{ new Date(currentShift.openedAt).toLocaleString() }}
            </p>
          </div>
          <span class="text-xs font-semibold text-emerald-700">Shift Open</span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div class="text-[11px] text-zinc-500">Opening Float</div>
            <div class="mt-0.5 font-mono text-sm font-bold text-zinc-900 tabular-nums">
              {{ formatUSD(currentShift.openingCashUSD) }}
            </div>
            <div class="font-mono text-[11px] text-zinc-500 tabular-nums">
              +{{ formatKHR(currentShift.openingCashKHR) }}
            </div>
          </div>
          <div>
            <div class="text-[11px] text-zinc-500">Cash Sales</div>
            <div class="mt-0.5 font-mono text-sm font-bold text-zinc-900 tabular-nums">
              {{ formatUSD(shiftTotals.cashUSD) }}
            </div>
          </div>
          <div>
            <div class="text-[11px] text-zinc-500">ABA KHQR Sales</div>
            <div class="mt-0.5 font-mono text-sm font-bold text-zinc-900 tabular-nums">
              {{ formatUSD(shiftTotals.abaUSD) }}
            </div>
          </div>
          <div>
            <div class="text-[11px] text-zinc-500">Card Sales</div>
            <div class="mt-0.5 font-mono text-sm font-bold text-zinc-900 tabular-nums">
              {{ formatUSD(shiftTotals.cardUSD) }}
            </div>
          </div>
        </div>

        <div class="mt-5 rounded-lg border border-zinc-200 bg-[#F8F8F7] p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-zinc-700">
              Expected Cash in Drawer (Float + Cash Sales ± Cash In/Out)
            </span>
            <div class="text-right font-mono">
              <div class="text-base font-bold text-zinc-900 tabular-nums">
                {{ formatUSD(currentShift.expectedCashUSD) }}
              </div>
              <div class="text-[11px] text-zinc-500 tabular-nums">
                {{ formatKHR(toKHR(currentShift.expectedCashUSD, rate)) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Petty Cash In / Out Log -->
        <div class="mt-5">
          <h3 class="text-xs font-semibold text-zinc-800">Cash In / Cash Out Log</h3>
          <form @submit.prevent="handleCashMovement" class="mt-2.5 flex flex-wrap items-center gap-2">
            <select
              v-model="moveType"
              class="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium"
            >
              <option value="out">Cash Out</option>
              <option value="in">Cash In</option>
            </select>
            <input
              type="number"
              step="0.5"
              v-model="moveUSD"
              placeholder="USD"
              class="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 font-mono text-xs tabular-nums"
            />
            <input
              type="number"
              step="1000"
              v-model="moveKHR"
              placeholder="KHR"
              class="w-28 rounded-lg border border-zinc-200 px-2.5 py-1.5 font-mono text-xs tabular-nums"
            />
            <input
              required
              v-model="moveReason"
              placeholder="Reason (e.g. Grab courier, safe drop)"
              class="min-w-[180px] flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              class="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            >
              Record
            </button>
          </form>

          <div class="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            <p v-if="currentMovements.length === 0" class="py-4 text-center text-xs text-zinc-400">
              No petty cash movements in this shift.
            </p>
            <div
              v-else
              v-for="m in currentMovements"
              :key="m.id"
              class="flex items-center justify-between px-3 py-2 text-xs"
            >
              <div class="flex items-center gap-2">
                <ArrowDownLeft v-if="m.type === 'in'" class="h-3.5 w-3.5 text-emerald-700" />
                <ArrowUpRight v-else class="h-3.5 w-3.5 text-amber-700" />
                <div>
                  <span class="font-medium text-zinc-900">{{ m.reason }}</span>
                  <span class="ml-2 text-[11px] text-zinc-400">by {{ m.staffName }}</span>
                </div>
              </div>
              <span
                :class="[
                  'font-mono font-semibold tabular-nums',
                  m.type === 'in' ? 'text-emerald-700' : 'text-amber-700',
                ]"
              >
                {{ m.type === 'in' ? '+' : '-' }}{{ formatUSD(m.amountUSD) }}
                {{ m.amountKHR > 0 ? ` / ${formatKHR(m.amountKHR)}` : '' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Close Shift Reconciliation Card -->
      <form
        @submit.prevent="handleCloseShift"
        class="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5"
      >
        <div>
          <div class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Lock class="h-4 w-4 text-zinc-700" />
            Close Shift &amp; Reconcile
          </div>
          <p class="mt-1 text-xs text-zinc-500">
            Count physical cash in drawer (combine USD + KHR converted value) to lock the shift.
          </p>

          <div class="mt-4 space-y-3">
            <div class="flex justify-between text-xs">
              <span class="text-zinc-500">Expected Cash</span>
              <span class="font-mono font-semibold text-zinc-900 tabular-nums">
                {{ formatUSD(currentShift.expectedCashUSD) }}
              </span>
            </div>

            <div>
              <label class="block text-xs font-medium text-zinc-700">
                Counted Drawer Cash (Total USD Eq.)
              </label>
              <input
                required
                type="number"
                step="0.01"
                v-model="countedCashUSD"
                :placeholder="currentShift.expectedCashUSD.toFixed(2)"
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm font-semibold tabular-nums focus:border-[#155E4B] focus:outline-none"
              />
            </div>

            <div
              v-if="previewVariance !== null"
              class="flex items-center justify-between rounded-lg border border-zinc-200 bg-[#F8F8F7] px-3 py-2 text-xs"
            >
              <span class="text-zinc-600">Cash Variance</span>
              <span
                :class="[
                  'font-mono font-bold tabular-nums',
                  previewVariance === 0
                    ? 'text-emerald-700'
                    : previewVariance > 0
                    ? 'text-blue-700'
                    : 'text-red-600',
                ]"
              >
                {{ previewVariance >= 0 ? '+' : '' }}{{ formatUSD(previewVariance) }}
              </span>
            </div>

            <div>
              <label class="block text-xs font-medium text-zinc-700">Closing Notes</label>
              <textarea
                rows="2"
                v-model="closeNotes"
                placeholder="Optional variance note..."
                class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:border-[#155E4B] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          class="mt-5 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          Close Shift &amp; Save Report
        </button>
      </form>
    </div>

    <!-- Historical Shift Log -->
    <div class="rounded-xl border border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 px-5 py-3.5">
        <h2 class="text-sm font-semibold text-zinc-900">Shift History</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-zinc-100 text-zinc-500">
              <th class="px-5 py-2.5 font-medium">Cashier</th>
              <th class="px-5 py-2.5 font-medium">Opened</th>
              <th class="px-5 py-2.5 font-medium">Closed</th>
              <th class="px-5 py-2.5 text-right font-medium">Opening</th>
              <th class="px-5 py-2.5 text-right font-medium">Expected</th>
              <th class="px-5 py-2.5 text-right font-medium">Counted</th>
              <th class="px-5 py-2.5 text-right font-medium">Variance</th>
              <th class="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr v-for="sh in state.shifts" :key="sh.id" class="hover:bg-zinc-50">
              <td class="px-5 py-3 font-medium text-zinc-900">{{ sh.cashierName }}</td>
              <td class="px-5 py-3 font-mono text-zinc-500 tabular-nums">
                {{
                  new Date(sh.openedAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </td>
              <td class="px-5 py-3 font-mono text-zinc-500 tabular-nums">
                {{
                  sh.closedAt
                    ? new Date(sh.closedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'
                }}
              </td>
              <td class="px-5 py-3 text-right font-mono tabular-nums">
                {{ formatUSD(sh.openingCashUSD) }}
              </td>
              <td class="px-5 py-3 text-right font-mono tabular-nums">
                {{ formatUSD(sh.expectedCashUSD) }}
              </td>
              <td class="px-5 py-3 text-right font-mono tabular-nums">
                {{ sh.countedCashUSD !== undefined ? formatUSD(sh.countedCashUSD) : '—' }}
              </td>
              <td class="px-5 py-3 text-right font-mono tabular-nums">
                <span
                  v-if="sh.varianceUSD !== undefined"
                  :class="
                    sh.varianceUSD === 0 ? 'text-emerald-700' : 'font-semibold text-amber-700'
                  "
                >
                  {{ sh.varianceUSD >= 0 ? '+' : '' }}{{ formatUSD(sh.varianceUSD) }}
                </span>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3">
                <span
                  :class="['font-medium', sh.status === 'open' ? 'text-emerald-700' : 'text-zinc-500']"
                >
                  {{ sh.status === 'open' ? 'Open' : 'Closed' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
