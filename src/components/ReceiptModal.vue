<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, MessageSquare, Printer, Send, X } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { Sale } from '../types/pos';
import { formatKHR, formatUSD } from '../utils/fefo';

const props = defineProps<{
  sale: Sale;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { state } = useStore();
const settings = computed(() => state.value.settings);
const sentNotice = ref<string | null>(null);

const totalDiscounts = computed(
  () =>
    props.sale.promoDiscountUSD +
    props.sale.voucherDiscountUSD +
    props.sale.pointsDiscountUSD
);

function handlePrint() {
  window.print();
}

function handleSend(channel: 'Telegram' | 'SMS') {
  sentNotice.value = `Receipt ${props.sale.receiptNo} queued via ${channel}`;
  setTimeout(() => {
    sentNotice.value = null;
  }, 3000);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatChangeKhr(changeUSD: number, rate: number) {
  return formatKHR(Math.round((changeUSD * rate) / 100) * 100);
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
  >
    <div
      class="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
        <div>
          <h3 class="text-base font-semibold text-zinc-900">
            Thermal Receipt Preview · 80mm
          </h3>
          <p class="text-xs text-zinc-500">
            Bilingual English / Khmer · Dual USD &amp; KHR
          </p>
        </div>
        <button
          @click="emit('close')"
          class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Close receipt"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Thermal Receipt Scroll Area -->
      <div class="flex-1 overflow-y-auto bg-zinc-100/70 p-5">
        <div
          id="printable-receipt"
          class="mx-auto w-full max-w-[320px] border border-zinc-200 bg-white p-5 font-mono text-[11px] leading-relaxed text-zinc-900 shadow-sm"
        >
          <!-- Store Header -->
          <div class="border-b border-dashed border-zinc-300 pb-3 text-center">
            <div class="text-sm font-bold tracking-tight">{{ settings.storeName }}</div>
            <div class="font-sans text-[11px] font-medium text-zinc-700">
              {{ settings.storeNameKm }}
            </div>
            <div class="mt-1 text-[10px] text-zinc-500">{{ settings.branchAddress }}</div>
            <div class="text-[10px] text-zinc-500">Tel: {{ settings.phone }}</div>
          </div>

          <!-- Meta Info -->
          <div class="space-y-0.5 border-b border-dashed border-zinc-300 py-2.5 text-[10px]">
            <div class="flex justify-between">
              <span class="text-zinc-500">វិក្កយបត្រ / Receipt:</span>
              <span class="font-semibold tabular-nums">{{ sale.receiptNo }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-zinc-500">កាលបរិច្ឆេទ / Date:</span>
              <span class="tabular-nums">{{ formatDateTime(sale.createdAt) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-zinc-500">អ្នកគិតប្រាក់ / Cashier:</span>
              <span>{{ sale.cashierName }}</span>
            </div>
            <div v-if="sale.customerName" class="flex justify-between">
              <span class="text-zinc-500">អតិថិជន / Member:</span>
              <span>{{ sale.customerName }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-zinc-500">អត្រាប្តូរប្រាក់ / Rate:</span>
              <span class="tabular-nums"
                >1 USD = {{ sale.exchangeRate.toLocaleString() }} KHR</span
              >
            </div>
          </div>

          <!-- Line Items -->
          <div class="border-b border-dashed border-zinc-300 py-2.5">
            <div class="mb-1.5 flex justify-between text-[10px] font-semibold text-zinc-500">
              <span>ទំនិញ / ITEM</span>
              <span>សរុប / AMT</span>
            </div>
            <div class="space-y-2">
              <div v-for="(item, idx) in sale.items" :key="`${item.productId}-${idx}`">
                <div class="flex justify-between gap-2 font-medium">
                  <span class="truncate">{{ item.productName }}</span>
                  <span class="shrink-0 tabular-nums">{{ formatUSD(item.lineTotalUSD) }}</span>
                </div>
                <div class="font-sans text-[10px] text-zinc-600">{{ item.productNameKm }}</div>
                <div class="flex justify-between text-[10px] text-zinc-500 tabular-nums">
                  <span>
                    {{ item.qty }} × {{ formatUSD(item.unitPrice) }} ({{ item.variant }})
                  </span>
                  <span v-if="item.lineDiscountUSD > 0">
                    -{{ formatUSD(item.lineDiscountUSD) }}
                  </span>
                </div>
                <div v-if="item.batchDeductions.length > 0" class="text-[9px] text-zinc-400">
                  FEFO:
                  {{
                    item.batchDeductions
                      .map((b) => `${b.batchNumber} (${b.expiryDate})`)
                      .join(', ')
                  }}
                </div>
              </div>
            </div>
          </div>

          <!-- Totals -->
          <div class="space-y-1 border-b border-dashed border-zinc-300 py-2.5 text-[11px]">
            <div class="flex justify-between">
              <span class="text-zinc-600">សរុបរង / Subtotal</span>
              <span class="tabular-nums">{{ formatUSD(sale.subtotalUSD) }}</span>
            </div>
            <div v-if="totalDiscounts > 0" class="flex justify-between text-emerald-700">
              <span>បញ្ចុះតម្លៃ / Discount</span>
              <span class="tabular-nums">-{{ formatUSD(totalDiscounts) }}</span>
            </div>
            <div v-if="sale.taxUSD > 0" class="flex justify-between">
              <span class="text-zinc-600">ពន្ធ / Tax</span>
              <span class="tabular-nums">{{ formatUSD(sale.taxUSD) }}</span>
            </div>
            <div class="flex justify-between pt-1 text-xs font-bold">
              <span>សរុប / TOTAL (USD)</span>
              <span class="tabular-nums">{{ formatUSD(sale.totalUSD) }}</span>
            </div>
            <div class="flex justify-between text-xs font-bold text-zinc-800">
              <span>សរុប / TOTAL (KHR)</span>
              <span class="tabular-nums">{{ formatKHR(sale.totalKHR) }}</span>
            </div>
          </div>

          <!-- Payment Breakdown -->
          <div class="space-y-0.5 border-b border-dashed border-zinc-300 py-2.5 text-[10px]">
            <div class="flex justify-between">
              <span class="text-zinc-500">វិធីបង់ / Method:</span>
              <span class="font-semibold uppercase">
                {{ sale.paymentMethod === 'aba_qr' ? 'ABA KHQR' : sale.paymentMethod }}
              </span>
            </div>
            <div v-if="sale.payment.cashUSD > 0" class="flex justify-between">
              <span class="text-zinc-500">Cash (USD):</span>
              <span class="tabular-nums">{{ formatUSD(sale.payment.cashUSD) }}</span>
            </div>
            <div v-if="sale.payment.cashKHR > 0" class="flex justify-between">
              <span class="text-zinc-500">Cash (KHR):</span>
              <span class="tabular-nums">{{ formatKHR(sale.payment.cashKHR) }}</span>
            </div>
            <div v-if="sale.payment.cardUSD > 0" class="flex justify-between">
              <span class="text-zinc-500">Card:</span>
              <span class="tabular-nums">{{ formatUSD(sale.payment.cardUSD) }}</span>
            </div>
            <div v-if="sale.payment.abaQrUSD > 0" class="flex justify-between">
              <span class="text-zinc-500">
                ABA KHQR {{ sale.payment.abaRef ? `(${sale.payment.abaRef})` : '' }}:
              </span>
              <span class="tabular-nums">{{ formatUSD(sale.payment.abaQrUSD) }}</span>
            </div>
            <div
              v-if="sale.payment.changeUSD > 0"
              class="flex justify-between font-semibold text-zinc-800"
            >
              <span>ប្រាក់អាប់ / Change:</span>
              <span class="tabular-nums">
                {{ formatUSD(sale.payment.changeUSD) }} ({{
                  formatChangeKhr(sale.payment.changeUSD, sale.exchangeRate)
                }})
              </span>
            </div>
            <div v-if="sale.pointsEarned > 0" class="flex justify-between pt-1 text-emerald-700">
              <span>ពិន្ទុទទួលបាន / Points Earned:</span>
              <span class="tabular-nums">+{{ sale.pointsEarned }} pts</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="pt-3 text-center text-[10px] text-zinc-600">
            <div class="font-semibold text-zinc-800">Thank you for glowing with us!</div>
            <div class="font-sans">សូមអរគុណសម្រាប់ការគាំទ្រ!</div>
            <div class="mt-1.5 text-[9px] text-zinc-500">{{ settings.receiptFooterEn }}</div>
            <div class="font-sans text-[9px] text-zinc-500">{{ settings.receiptFooterKm }}</div>
          </div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="border-t border-zinc-200 bg-white px-5 py-3.5">
        <div
          v-if="sentNotice"
          class="mb-2.5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
        >
          <Check class="h-3.5 w-3.5" />
          <span>{{ sentNotice }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="handlePrint"
            class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0F4738] whitespace-nowrap"
          >
            <Printer class="h-3.5 w-3.5" />
            Print Receipt
          </button>
          <button
            @click="handleSend('Telegram')"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
          >
            <Send class="h-3.5 w-3.5" />
            Telegram
          </button>
          <button
            @click="handleSend('SMS')"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
          >
            <MessageSquare class="h-3.5 w-3.5" />
            SMS
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
