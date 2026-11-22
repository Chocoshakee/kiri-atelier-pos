<script setup lang="ts">
import { computed, ref } from 'vue';
import { Delete, Lock, ShieldCheck, UserCheck, X } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { StaffMember, StaffRole } from '../types/pos';
import { ROLE_LABELS } from '../utils/permissions';

const props = withDefaults(
  defineProps<{
    mode: 'switch' | 'override';
    locked?: boolean;
    title?: string;
    subtitle?: string;
    allowedRoles?: StaffRole[];
  }>(),
  {
    locked: false,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'authorized', staff: StaffMember): void;
}>();

const { state, activeStaff, setActiveStaff, verifyStaffPin } = useStore();

const eligibleUsers = computed(() =>
  state.value.staff.filter(
    (s) => s.active && (!props.allowedRoles || props.allowedRoles.includes(s.role))
  )
);

const selectedId = ref<string>(
  eligibleUsers.value.find((u) => u.id === activeStaff.value.id)?.id ||
    eligibleUsers.value[0]?.id ||
    ''
);
const pin = ref('');
const error = ref<string | null>(null);

const selectedUser = computed(
  () => eligibleUsers.value.find((u) => u.id === selectedId.value) || eligibleUsers.value[0]
);

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Del'];

function handleDigit(d: string) {
  error.value = null;
  if (pin.value.length < 6) {
    pin.value += d;
  }
}

function handleBackspace() {
  error.value = null;
  pin.value = pin.value.slice(0, -1);
}

function handleSubmit() {
  if (!selectedUser.value) return;

  if (props.mode === 'override') {
    const matched = verifyStaffPin(pin.value, props.allowedRoles || ['manager', 'admin']);
    if (!matched) {
      error.value = 'Invalid Manager or Admin PIN.';
      pin.value = '';
      return;
    }
    emit('authorized', matched);
    emit('close');
    return;
  }

  if (selectedUser.value.pin !== pin.value.trim()) {
    error.value = `Incorrect PIN for ${selectedUser.value.name}.`;
    pin.value = '';
    return;
  }

  setActiveStaff(selectedUser.value.id);
  emit('authorized', selectedUser.value);
  emit('close');
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-[2px]"
  >
    <div
      class="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div class="flex items-center gap-2.5">
          <Lock v-if="locked" class="h-4 w-4 text-[#155E4B]" />
          <ShieldCheck v-else-if="mode === 'override'" class="h-4 w-4 text-amber-700" />
          <UserCheck v-else class="h-4 w-4 text-[#155E4B]" />
          <div>
            <h3 class="text-sm font-semibold text-zinc-900">
              {{
                title || (locked ? 'Register Locked — Staff Sign In' : 'Switch POS Operator')
              }}
            </h3>
            <p class="text-xs text-zinc-500">
              {{ subtitle || 'Select Cashier, Manager, or Admin and enter 4-digit PIN' }}
            </p>
          </div>
        </div>
        <button
          v-if="!locked"
          @click="emit('close')"
          class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4 p-5">
        <!-- Staff Selector Grid -->
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            v-for="u in eligibleUsers"
            :key="u.id"
            @click="
              selectedId = u.id;
              pin = '';
              error = null;
            "
            :class="[
              'rounded-lg border px-3 py-2.5 text-left transition-colors',
              selectedUser?.id === u.id
                ? 'border-[#155E4B] bg-[#155E4B]/5 ring-1 ring-[#155E4B]/30'
                : 'border-zinc-200 bg-white hover:bg-zinc-50',
            ]"
          >
            <div class="truncate text-xs font-semibold text-zinc-900">{{ u.name }}</div>
            <div class="mt-0.5 flex items-center justify-between text-[11px]">
              <span
                :class="[
                  'font-medium',
                  u.role === 'admin'
                    ? 'text-[#155E4B]'
                    : u.role === 'manager'
                    ? 'text-amber-700'
                    : 'text-zinc-500',
                ]"
              >
                {{ ROLE_LABELS[u.role] }}
              </span>
              <span class="font-mono text-[10px] text-zinc-400">PIN {{ u.pin }}</span>
            </div>
          </button>
        </div>

        <!-- PIN Input Display -->
        <div>
          <label class="block text-xs font-medium text-zinc-700">
            Enter PIN for {{ selectedUser?.name }}
          </label>
          <input
            type="password"
            inputmode="numeric"
            autofocus
            :value="pin"
            @input="
              error = null;
              pin = ($event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
            "
            placeholder="••••"
            class="mt-1.5 w-full rounded-lg border border-zinc-200 bg-[#F8F8F7] px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-zinc-900 focus:border-[#155E4B] focus:bg-white focus:outline-none"
          />
          <p v-if="error" class="mt-1.5 text-xs font-medium text-red-600">{{ error }}</p>
        </div>

        <!-- Touch Keypad -->
        <div class="grid grid-cols-3 gap-2">
          <template v-for="k in KEYPAD" :key="k">
            <button
              v-if="k === 'Clear'"
              type="button"
              @click="
                pin = '';
                error = null;
              "
              class="rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </button>
            <button
              v-else-if="k === 'Del'"
              type="button"
              @click="handleBackspace"
              class="flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 text-zinc-600 hover:bg-zinc-100"
              aria-label="Backspace"
            >
              <Delete class="h-4 w-4" />
            </button>
            <button
              v-else
              type="button"
              @click="handleDigit(k)"
              class="rounded-lg border border-zinc-200 bg-white py-2.5 font-mono text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              {{ k }}
            </button>
          </template>
        </div>

        <button
          type="submit"
          :disabled="!pin"
          class="w-full rounded-lg bg-[#155E4B] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F4738] disabled:opacity-40"
        >
          {{
            mode === 'override'
              ? 'Authorize Action'
              : locked
              ? 'Unlock Register'
              : `Sign In as ${selectedUser?.name}`
          }}
        </button>
      </form>
    </div>
  </div>
</template>
