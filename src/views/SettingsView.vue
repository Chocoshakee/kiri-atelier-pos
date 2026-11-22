<script setup lang="ts">
import { ref } from 'vue';
import { Check, Download, Plus, RotateCcw, Upload, UserCheck, X } from 'lucide-vue-next';
import { useStore } from '../composables/useStore';
import { LanguageMode, StaffMember, StaffRole } from '../types/pos';
import { PERMISSION_MATRIX, ROLE_LABELS } from '../utils/permissions';

const LANG_OPTIONS: { id: LanguageMode; label: string }[] = [
  { id: 'en', label: 'English Only' },
  { id: 'bilingual', label: 'Bilingual (EN + ខ្មែរ)' },
  { id: 'km', label: 'Khmer Priority (ខ្មែរ)' },
];

const {
  state,
  activeStaff,
  updateSettings,
  setActiveStaff,
  addStaffMember,
  updateStaffMember,
  importBackupJSON,
  resetDemoData,
} = useStore();

const exchangeRate = ref(String(state.value.settings.exchangeRateKHR));
const taxRate = ref(String(state.value.settings.taxRatePercent));
const abaId = ref(state.value.settings.abaMerchantId);
const abaName = ref(state.value.settings.abaMerchantName);
const notice = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Add User Modal state
const showAddUser = ref(false);
const newUserName = ref('');
const newUserRole = ref<StaffRole>('cashier');
const newUserPin = ref('');

// Inline PIN reset
const editingPinId = ref<string | null>(null);
const pinDraft = ref('');

function flash(msg: string) {
  notice.value = msg;
  setTimeout(() => {
    notice.value = null;
  }, 3500);
}

function handleSaveGeneral() {
  updateSettings({
    exchangeRateKHR: parseInt(exchangeRate.value, 10) || 4100,
    taxRatePercent: parseFloat(taxRate.value) || 0,
    abaMerchantId: abaId.value.trim(),
    abaMerchantName: abaName.value.trim(),
  });
  flash('Store currency, tax, and ABA KHQR settings saved.');
}

function handleAddUser() {
  if (!newUserName.value.trim() || newUserPin.value.trim().length < 4) return;
  const created = addStaffMember({
    name: newUserName.value.trim(),
    role: newUserRole.value,
    pin: newUserPin.value.trim(),
  });
  showAddUser.value = false;
  newUserName.value = '';
  newUserRole.value = 'cashier';
  newUserPin.value = '';
  flash(`Added ${created.name} as ${ROLE_LABELS[created.role]} (PIN ${created.pin}).`);
}

function savePinFor(m: StaffMember) {
  if (pinDraft.value.length >= 4) {
    updateStaffMember(m.id, { pin: pinDraft.value });
    flash(`Updated PIN for ${m.name}.`);
  }
  editingPinId.value = null;
}

function changeUserRole(m: StaffMember, nextRole: StaffRole) {
  updateStaffMember(m.id, { role: nextRole });
  flash(`Updated ${m.name} role to ${ROLE_LABELS[nextRole]}.`);
}

function switchToUser(m: StaffMember) {
  setActiveStaff(m.id);
  flash(`Switched active user to ${m.name} (${ROLE_LABELS[m.role]}).`);
}

function handleExportBackup() {
  const blob = new Blob([JSON.stringify(state.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kiri-pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  flash('Exported full store backup JSON.');
}

function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const res = importBackupJSON(String(reader.result || ''));
    if (res.ok) {
      flash('Backup restored successfully.');
    } else {
      flash(res.error || 'Import failed.');
    }
  };
  reader.readAsText(file);
}

function handleResetDemo() {
  resetDemoData();
  flash('Store data restored to initial sample state.');
}
</script>

<template>
  <div class="mx-auto max-w-[1200px] space-y-6 p-6">
    <div>
      <h1 class="text-xl font-bold tracking-tight text-zinc-900">
        Store Settings & User Access
      </h1>
      <p class="text-xs text-zinc-500">
        Manage Cashier, Manager, and Admin users, role permissions, USD/KHR currency, hardware, and backups
      </p>
    </div>

    <div
      v-if="notice"
      class="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900"
    >
      <Check class="h-4 w-4 shrink-0" />
      <span>{{ notice }}</span>
    </div>

    <!-- Full-Width User Management & Role Permissions -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-900">
              Users · Cashier, Manager & Admin
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500">
              Create staff accounts, assign roles, reset 4-digit PINs, or switch active operator
            </p>
          </div>
          <button
            @click="showAddUser = true"
            class="flex items-center gap-1.5 rounded-lg bg-[#155E4B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F4738] whitespace-nowrap"
          >
            <Plus class="h-3.5 w-3.5" />
            Add User
          </button>
        </div>

        <div class="mt-4 divide-y divide-zinc-100">
          <div
            v-for="m in state.staff"
            :key="m.id"
            class="flex flex-wrap items-center justify-between gap-3 py-3 text-xs"
          >
            <div>
              <div class="flex items-center gap-2 font-semibold text-zinc-900">
                <span>{{ m.name }}</span>
                <span v-if="activeStaff.id === m.id" class="font-medium text-[#155E4B]">
                  · Signed In
                </span>
                <span v-if="!m.active" class="font-medium text-red-600">· Deactivated</span>
              </div>
              <div class="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                <span v-if="editingPinId === m.id" class="inline-flex items-center gap-1.5">
                  <input
                    :value="pinDraft"
                    @input="
                      pinDraft = ($event.target as HTMLInputElement).value
                        .replace(/\D/g, '')
                        .slice(0, 6)
                    "
                    placeholder="New PIN"
                    class="w-20 rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-[11px]"
                  />
                  <button
                    @click="savePinFor(m)"
                    class="font-sans font-semibold text-[#155E4B] hover:underline"
                  >
                    Save
                  </button>
                  <button
                    @click="editingPinId = null"
                    class="font-sans text-zinc-400 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                </span>
                <template v-else>
                  <span>PIN: {{ m.pin }}</span>
                  <span>·</span>
                  <button
                    @click="
                      editingPinId = m.id;
                      pinDraft = m.pin;
                    "
                    class="font-sans text-zinc-600 hover:text-zinc-900 hover:underline"
                  >
                    Reset PIN
                  </button>
                </template>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <select
                :value="m.role"
                @change="changeUserRole(m, ($event.target as HTMLSelectElement).value as StaffRole)"
                class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium"
                :aria-label="`Role for ${m.name}`"
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>

              <button
                v-if="activeStaff.id !== m.id"
                @click="updateStaffMember(m.id, { active: !m.active })"
                class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                {{ m.active ? 'Disable' : 'Enable' }}
              </button>

              <button
                v-if="activeStaff.id !== m.id && m.active"
                @click="switchToUser(m)"
                class="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
              >
                <UserCheck class="h-3 w-3" />
                Switch
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Role Permissions Matrix -->
      <div class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-2">
        <h2 class="text-sm font-semibold text-zinc-900">Role Access Matrix</h2>
        <p class="mt-0.5 text-xs text-zinc-500">
          Capabilities enforced automatically per active user role
        </p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-zinc-200 text-zinc-500">
                <th class="py-2 pr-2 font-medium">Capability</th>
                <th class="px-1.5 py-2 text-center font-medium">Cashier</th>
                <th class="px-1.5 py-2 text-center font-medium">Manager</th>
                <th class="py-2 pl-1.5 text-center font-medium">Admin</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr v-for="row in PERMISSION_MATRIX" :key="row.capability">
                <td class="py-2 pr-2 text-zinc-800">{{ row.capability }}</td>
                <td class="px-1.5 py-2 text-center text-zinc-500">{{ row.cashier }}</td>
                <td class="px-1.5 py-2 text-center font-medium text-zinc-800">
                  {{ row.manager }}
                </td>
                <td class="py-2 pl-1.5 text-center font-semibold text-[#155E4B]">
                  {{ row.admin }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Currency, Bilingual & ABA KHQR -->
      <form
        @submit.prevent="handleSaveGeneral"
        class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5"
      >
        <h2 class="text-sm font-semibold text-zinc-900">Currency, Tax & ABA KHQR</h2>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-700">
              Exchange Rate (KHR per 1 USD)
            </label>
            <input
              type="number"
              v-model="exchangeRate"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Tax / VAT (%)</label>
            <input
              type="number"
              step="0.5"
              v-model="taxRate"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs tabular-nums"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-zinc-700">
            POS & Receipt Language Mode
          </label>
          <div class="mt-1.5 flex gap-1.5">
            <button
              type="button"
              v-for="l in LANG_OPTIONS"
              :key="l.id"
              @click="updateSettings({ language: l.id })"
              :class="[
                'flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
                state.settings.language === l.id
                  ? 'border-[#155E4B] bg-[#155E4B] text-white'
                  : 'border-zinc-200 bg-white text-zinc-700',
              ]"
            >
              {{ l.label }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-700">ABA Merchant ID</label>
            <input
              v-model="abaId"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">KHQR Display Name</label>
            <input
              v-model="abaName"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs"
            />
          </div>
        </div>

        <button
          type="submit"
          class="rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
        >
          Save Financial Settings
        </button>
      </form>

      <!-- Hardware & Backup -->
      <div class="space-y-6">
        <div class="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-sm font-semibold text-zinc-900">Counter Hardware</h2>
          <div class="flex items-center justify-between text-xs">
            <span class="text-zinc-600">Barcode Scanner Input</span>
            <select
              :value="state.settings.hardware.scannerMode"
              @change="
                updateSettings({
                  hardware: {
                    ...state.settings.hardware,
                    scannerMode: ($event.target as HTMLSelectElement).value as
                      | 'keyboard_wedge'
                      | 'usb_hid',
                  },
                })
              "
              class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs"
            >
              <option value="keyboard_wedge">USB Keyboard Wedge (Auto-Enter)</option>
              <option value="usb_hid">USB HID Direct</option>
            </select>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-zinc-600">Thermal Receipt Width</span>
            <select
              :value="state.settings.hardware.printerWidth"
              @change="
                updateSettings({
                  hardware: {
                    ...state.settings.hardware,
                    printerWidth: ($event.target as HTMLSelectElement).value as '80mm' | '58mm',
                  },
                })
              "
              class="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs"
            >
              <option value="80mm">80mm Thermal Roll</option>
              <option value="58mm">58mm Compact Roll</option>
            </select>
          </div>
          <label class="flex items-center justify-between pt-1 text-xs">
            <span class="text-zinc-600">Auto-Kick Cash Drawer on Cash Sale</span>
            <input
              type="checkbox"
              :checked="state.settings.hardware.autoOpenDrawer"
              @change="
                updateSettings({
                  hardware: {
                    ...state.settings.hardware,
                    autoOpenDrawer: ($event.target as HTMLInputElement).checked,
                  },
                })
              "
              class="rounded border-zinc-300 text-[#155E4B]"
            />
          </label>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="text-sm font-semibold text-zinc-900">Backup, Import & Reset</h2>
          <p class="mt-1 text-xs text-zinc-500">
            Export all products, FEFO batches, sales, shifts, users, and customer loyalty data.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              @click="handleExportBackup"
              class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Download class="h-3.5 w-3.5" />
              Export JSON Backup
            </button>
            <button
              @click="fileInputRef?.click()"
              class="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Upload class="h-3.5 w-3.5" />
              Import Backup
            </button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".json"
              @change="handleImportFile"
              class="hidden"
            />
            <button
              @click="handleResetDemo"
              class="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <RotateCcw class="h-3.5 w-3.5" />
              Reset Sample Data
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add User Modal -->
    <div
      v-if="showAddUser"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]"
    >
      <form
        @submit.prevent="handleAddUser"
        class="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 class="text-base font-semibold text-zinc-900">Add Staff User</h3>
          <button
            type="button"
            @click="showAddUser = false"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="block text-xs font-medium text-zinc-700">Full Name</label>
            <input
              required
              v-model="newUserName"
              placeholder="e.g. Virak Chea"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">Role</label>
            <select
              v-model="newUserRole"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
            >
              <option value="cashier">Cashier (POS, Shifts, Customers)</option>
              <option value="manager">Manager (Operations, Inventory, Reports)</option>
              <option value="admin">Admin (Full Access & Settings)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-700">4–6 Digit PIN</label>
            <input
              required
              minlength="4"
              maxlength="6"
              :value="newUserPin"
              @input="newUserPin = ($event.target as HTMLInputElement).value.replace(/\D/g, '')"
              placeholder="e.g. 4455"
              class="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs tracking-widest"
            />
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            @click="showAddUser = false"
            class="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-lg bg-[#155E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F4738]"
          >
            Create User
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
