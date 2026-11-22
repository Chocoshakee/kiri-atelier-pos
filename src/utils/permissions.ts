import { ModuleId, StaffRole } from '../types/pos';

export const ROLE_LABELS: Record<StaffRole, string> = {
  cashier: 'Cashier',
  manager: 'Manager',
  admin: 'Admin',
};

export const ROLE_ALLOWED_MODULES: Record<StaffRole, ModuleId[]> = {
  cashier: ['pos', 'shifts', 'products', 'customers'],
  manager: [
    'pos',
    'dashboard',
    'shifts',
    'products',
    'inventory',
    'purchasing',
    'customers',
    'promotions',
    'reports',
  ],
  admin: [
    'pos',
    'dashboard',
    'shifts',
    'products',
    'inventory',
    'purchasing',
    'customers',
    'promotions',
    'reports',
    'settings',
  ],
};

export function canAccessModule(role: StaffRole, moduleId: ModuleId): boolean {
  return ROLE_ALLOWED_MODULES[role].includes(moduleId);
}

export function canEditCatalog(role: StaffRole): boolean {
  return role === 'manager' || role === 'admin';
}

export function canApproveReturnsOrHighDiscount(role: StaffRole): boolean {
  return role === 'manager' || role === 'admin';
}

export function canManageUsersAndSettings(role: StaffRole): boolean {
  return role === 'admin';
}

export const PERMISSION_MATRIX: {
  capability: string;
  cashier: string;
  manager: string;
  admin: string;
}[] = [
  {
    capability: 'POS Counter Checkout & Hold',
    cashier: 'Allowed',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Line Item Discounts',
    cashier: 'Up to 10%',
    manager: 'Unlimited',
    admin: 'Unlimited',
  },
  {
    capability: 'Returns & Exchanges',
    cashier: 'Manager PIN',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Cash Drawer & Shift Open/Close',
    cashier: 'Allowed',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Customers & Refill Reminders',
    cashier: 'Allowed',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Products & Price Edits',
    cashier: 'View + Labels',
    manager: 'Full Edit',
    admin: 'Full Edit',
  },
  {
    capability: 'Inventory, Stocktake & FEFO',
    cashier: '—',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Purchasing & Suppliers',
    cashier: '—',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Promotions & Analytics Reports',
    cashier: '—',
    manager: 'Allowed',
    admin: 'Allowed',
  },
  {
    capability: 'Users, Roles, Currency & Backup',
    cashier: '—',
    manager: '—',
    admin: 'Allowed',
  },
];
