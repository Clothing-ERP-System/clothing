import { BUILT_IN_ROLES, ERP_MODULES, ROLE_ACTIONS } from '@/lib/role-definitions.js';

export { BUILT_IN_ROLES, ERP_MODULES, ROLE_ACTIONS };

const readModulesByRole = {
  GeneralManager: [
    'assets', 'crm', 'cutting', 'dashboard', 'design', 'dyeing', 'fabric',
    'finance', 'hr', 'pos', 'procurement', 'production', 'quality', 'reports',
    'sales', 'system', 'trims', 'warehouse',
  ],
  ProductionManager: ['dashboard', 'design', 'cutting', 'dyeing', 'fabric', 'production', 'quality', 'reports', 'system'],
  CuttingMaster: ['dashboard', 'design', 'cutting', 'fabric', 'system'],
  QualityInspector: ['dashboard', 'production', 'quality', 'system'],
  InventoryStorekeeper: ['assets', 'dashboard', 'fabric', 'procurement', 'reports', 'system', 'trims', 'warehouse'],
  Accountant: ['dashboard', 'fabric', 'finance', 'pos', 'procurement', 'production', 'reports', 'sales', 'system', 'trims'],
  POSCashier: ['dashboard', 'pos', 'system'],
  SalesOfficer: ['crm', 'dashboard', 'design', 'fabric', 'production', 'reports', 'sales', 'system', 'trims'],
  HROfficer: ['assets', 'dashboard', 'hr', 'system'],
};

const writeModulesByRole = {
  GeneralManager: readModulesByRole.GeneralManager,
  ProductionManager: ['design', 'cutting', 'dyeing', 'fabric', 'production', 'quality'],
  CuttingMaster: ['cutting'],
  QualityInspector: ['quality'],
  InventoryStorekeeper: ['assets', 'fabric', 'procurement', 'trims', 'warehouse'],
  Accountant: ['finance', 'pos', 'procurement', 'sales'],
  POSCashier: ['pos'],
  SalesOfficer: ['crm', 'design', 'sales'],
  HROfficer: ['hr'],
};
writeModulesByRole.GeneralManager = readModulesByRole.GeneralManager.filter(
  (module) => !['dashboard', 'reports', 'system'].includes(module)
);

readModulesByRole.Administrator = ['assets', 'crm', 'dashboard', 'reports', 'system'];
writeModulesByRole.Administrator = ['assets', 'crm'];
readModulesByRole.Manager = readModulesByRole.GeneralManager;
writeModulesByRole.Manager = ['crm', 'cutting', 'design', 'dyeing', 'fabric', 'production', 'quality', 'sales', 'warehouse'];
readModulesByRole.HR = readModulesByRole.HROfficer;
writeModulesByRole.HR = writeModulesByRole.HROfficer;
readModulesByRole.Storekeeper = readModulesByRole.InventoryStorekeeper;
writeModulesByRole.Storekeeper = writeModulesByRole.InventoryStorekeeper;
readModulesByRole['Production Staff'] = ['cutting', 'dashboard', 'design', 'fabric', 'production'];
writeModulesByRole['Production Staff'] = ['cutting', 'production'];
readModulesByRole['Sales Staff'] = ['crm', 'dashboard', 'pos', 'sales'];
writeModulesByRole['Sales Staff'] = ['crm', 'pos', 'sales'];
readModulesByRole['Quality Staff'] = readModulesByRole.QualityInspector;
writeModulesByRole['Quality Staff'] = writeModulesByRole.QualityInspector;

export const resourceForPath = {
  '/': 'dashboard',
  '/admin': 'administration',
  '/assets': 'assets',
  '/crm': 'crm',
  '/cutting': 'cutting',
  '/design': 'design',
  '/dyeing': 'dyeing',
  '/fabric': 'fabric',
  '/finance': 'finance',
  '/accounts': 'finance',
  '/accounts/expenses/new': 'finance',
  '/accounts/expenses': 'finance',
  '/accounts/income/new': 'finance',
  '/accounts/income': 'finance',
  '/accounts/banks': 'finance',
  '/accounts/opening-balance': 'finance',
  '/accounts/chart-of-accounts': 'finance',
  '/accounts/reports/transactions': 'finance',
  '/accounts/reports/statements': 'finance',
  '/accounts/reports/profit-loss': 'finance',
  '/accounts/reports/account-balance': 'finance',
  '/accounts/reports/income-by-customer': 'finance',
  '/accounts/reports/expense-by-supplier': 'finance',
  '/accounts/reports/sales-tax': 'finance',
  '/hr': 'hr',
  '/pos': 'pos',
  '/procurement': 'procurement',
  '/procurement/stock-alerts': 'procurement',
  '/procurement/returns': 'procurement',
  '/procurement/requisitions': 'procurement',
  '/procurement/rfq': 'procurement',
  '/procurement/quotations': 'procurement',
  '/procurement/supplier-invoices': 'procurement',
  '/procurement/residual-grni': 'procurement',
  '/procurement/historical-review': 'procurement',
  '/production': 'production',
  '/quality': 'quality',
  '/reports': 'reports',
  '/sales': 'sales',
  '/sales/quotations': 'sales',
  '/settings': 'system',
  '/onboarding': 'administration',
  '/trims': 'trims',
  '/warehouse': 'warehouse',
  '/warehouse/locations': 'warehouse',
};

export function permissionForAction(action, method = 'POST') {
  const normalized = String(action || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return 'view';
  if (method === 'DELETE' || /(^|_)(DELETE|VOID)(_|$)/.test(normalized)) return 'delete';
  if (/(^|_)(APPROVE|REJECT)(_|$)/.test(normalized)) return 'approve';
  if (/(^|_)(EXPORT)(_|$)/.test(normalized)) return 'export';
  if (/(^|_)(MANAGE)(_|$)/.test(normalized)) return 'manage';
  if (/(^|_)(UPDATE|EDIT|CANCEL|COMPLETE|CLOSE|ISSUE|TRANSFER|CONSUME|ADJUST|RECONCILE|REVERSE|REWORK|FINISH)(_|$)/.test(normalized)) {
    return 'edit';
  }
  if (method === 'PATCH' || method === 'PUT') return 'edit';
  return 'add';
}

function hasPermission(permissions, module, action) {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(`${module}:${action}`) ||
    (['add', 'edit', 'delete'].includes(action) && permissions.includes(`${module}:write`)) ||
    (['view', 'add', 'edit', 'delete'].includes(action) && permissions.includes(module));
}

export function canAccessModule(user, module, action = 'view') {
  if (!user || !module || !ROLE_ACTIONS.includes(action)) return false;
  if (user.role === 'SuperAdmin') return true;
  if (module === 'administration') return false;

  const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (hasPermission(userPermissions, module, action)) return true;

  if (BUILT_IN_ROLES.includes(user.role)) {
    const readModules = readModulesByRole[user.role] || [];
    const writeModules = writeModulesByRole[user.role] || [];
    if (action === 'view') return readModules.includes(module);
    if (['add', 'edit', 'delete'].includes(action)) return writeModules.includes(module);
    return false;
  }

  return false;
}
