import { connectDB, pool, runInTransaction, taintConnection, transactionStorage } from '@/lib/db.js';
import Role from '@/models/Role.js';
import Company from '@/models/Company.js';
import { AccountHead } from '@/models/Accounting.js';
import User from '@/models/User.js';
import MasterData from '@/models/MasterData.js';
import AuditLog from '@/models/AuditLog.js';
import { hashPassword } from '@/lib/auth.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { deleteRecord, pickFields, updateRecord } from '@/lib/query.js';
import { publicUser, withAuthorization } from '@/lib/authorization.js';
import { BUILT_IN_ROLES, ERP_MODULES, ROLE_ACTIONS } from '@/lib/role-definitions.js';
import { evaluatePasswordStrength } from '@/lib/password-policy.js';

const rolePermissionKeys = new Set(
  ERP_MODULES.flatMap((module) => ROLE_ACTIONS.map((permission) => `${module}:${permission}`))
    .filter((permission) => !permission.startsWith('administration:') &&
      !/^system:(add|edit|delete|approve|export|manage)$/.test(permission))
);

// Tracks which physical transaction connections successfully acquired the
// erp_company_create advisory lock. Per-connection state avoids races between
// concurrent requests that share the same module-level handler.
const lockHeldConnections = new WeakSet();

function validRolePermissions(permissions) {
  return Array.isArray(permissions) &&
    permissions.every((permission) => typeof permission === 'string' && rolePermissionKeys.has(permission)) &&
    new Set(permissions).size === permissions.length;
}

async function roleExists(roleName) {
  return BUILT_IN_ROLES.includes(roleName) || Boolean(await Role.findOne({ name: roleName }));
}

async function getAdministration(_request, user) {
  try {
    await connectDB();
    const company = (await Company.findOne({})) || {};
    if (user.role !== 'SuperAdmin') {
      return successResponse({ company, users: [], masterData: {}, auditLogs: [] });
    }
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    const roles = await Role.find({}).sort({ name: 1 });
    const masterData = (await MasterData.findOne({})) || {};
    const auditLogs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(50);
    const financialAccounts = await AccountHead.find({}).sort({ code: 1 });

    return successResponse({
      company,
      users,
      roles,
      masterData,
      auditLogs,
      financialAccounts: financialAccounts.map(({ code, name, type, balance }) => ({ code, name, type, balance })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function handleUpdateCompany(request, actor, body) {
  const payload = {};
  const companyName = body.companyName ?? body.name;
  const legalName = body.legalName ?? body.registrationNumber;
  const ntnNumber = body.ntnNumber ?? body.taxId;
  if (companyName !== undefined) {
    const normalizedName = String(companyName).trim();
    if (!normalizedName) return errorResponse('Company name cannot be empty', 400);
    payload.companyName = normalizedName;
    payload.name = normalizedName;
  }
  if (legalName !== undefined) {
    payload.legalName = String(legalName).trim();
    payload.registrationNumber = payload.legalName;
  }
  if (ntnNumber !== undefined) {
    payload.ntnNumber = String(ntnNumber).trim();
    payload.taxId = payload.ntnNumber;
  }
  for (const field of [
    'strnNumber', 'address', 'phone', 'email', 'currency', 'currencySymbol',
    'branches', 'locations', 'developerAttribution', 'accountingMappings',
    'financialYearStart', 'financialYearEnd', 'taxSettings', 'onboardingCompleted',
  ]) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (payload.email !== undefined &&
    payload.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) {
    return errorResponse('Enter a valid company email address', 400);
  }
  if (payload.branches !== undefined && !Array.isArray(payload.branches) ||
    payload.locations !== undefined && !Array.isArray(payload.locations)) {
    return errorResponse('Company branches and warehouse locations must be lists', 400);
  }
  // Validate accounting mappings: referenced accounts must exist with compatible types
  if (payload.accountingMappings !== undefined) {
    const mappings = payload.accountingMappings;
    const expectedTypes = {
      grniAccountCode: 'Liability',
      inputTaxAccountCode: 'Asset',
      payableAccountCode: 'Liability',
      inventoryAccountCode: 'Asset',
      cogsAccountCode: 'CostOfGoodsSold',
      expenseAccountCode: 'OperatingExpense',
      salesRevenueAccountCode: 'Revenue',
      bankAccountCode: 'Asset',
      cashAccountCode: 'Asset',
      openingBalanceEquityAccountCode: 'Equity',
    };
    for (const [mappingKey, expectedType] of Object.entries(expectedTypes)) {
      const code = mappings[mappingKey];
      if (code === undefined || code === null || code === '') continue;
      const account = await AccountHead.findOne({ code: String(code).trim() });
      if (!account) {
        return errorResponse(`Accounting mapping ${mappingKey}: account ${code} does not exist`, 400);
      }
      if (account.type !== expectedType) {
        return errorResponse(`Accounting mapping ${mappingKey}: account ${code} must be type ${expectedType}`, 400);
      }
    }
  }

  // Server-side onboarding completion validation: never trust onboardingCompleted from client.
  // Reject completion if mandatory company settings are missing or incomplete.
  if (payload.onboardingCompleted === true) {
    const allCompanies = await Company.find({});
    const companyExists = allCompanies.length > 0 ? allCompanies[0] : null;
    const currentMappings = companyExists && companyExists.accountingMappings
      ? companyExists.accountingMappings
      : {};
    const mergedMappings = payload.accountingMappings || currentMappings || {};

    const missingFields = [];
    if (!payload.companyName && !companyExists?.companyName) missingFields.push('Company name');
    if (!payload.financialYearStart && !companyExists?.financialYearStart) missingFields.push('Financial year start');
    if (!payload.financialYearEnd && !companyExists?.financialYearEnd) missingFields.push('Financial year end');
    if (!payload.currency && !companyExists?.currency) missingFields.push('Base currency');

    // Mandatory accounting mappings must all be configured before onboarding can complete
    const mandatoryMappings = [
      'grniAccountCode',
      'inputTaxAccountCode',
      'payableAccountCode',
      'inventoryAccountCode',
      'salesRevenueAccountCode',
      'salesReceivableAccountCode',
      'openingBalanceEquityAccountCode',
    ];
    for (const key of mandatoryMappings) {
      const code = mergedMappings[key];
      if (!code) {
        missingFields.push(`Account mapping: ${key}`);
      } else {
        const account = await AccountHead.findOne({ code: String(code).trim() });
        if (!account) {
          missingFields.push(`Account mapping ${key}: account ${code} does not exist`);
        }
      }
    }

    // At least one location must exist
    const locations = payload.locations || companyExists?.locations || [];
    if (!Array.isArray(locations) || locations.length === 0) {
      missingFields.push('At least one warehouse location');
    }

    // Tax settings must exist
    const taxSettings = payload.taxSettings || companyExists?.taxSettings;
    if (!taxSettings || !taxSettings.taxName) {
      missingFields.push('Tax settings (tax name)');
    }

    if (missingFields.length > 0) {
      return errorResponse(
        `Onboarding cannot be completed. Missing required configuration: ${missingFields.join(', ')}`,
        400
      );
    }
  }
  if (Object.keys(payload).length === 0) {
    return errorResponse('Provide at least one company setting to update', 400);
  }
  // Single-company enforcement: count all company records and reject duplicates.
  const allCompanies = await Company.find({});
  if (allCompanies.length > 1) {
    return errorResponse(
      `Multiple company records found (${allCompanies.length}). Single-company database required. ` +
      'Contact system administrator to remove duplicate company records before proceeding.',
      409,
    );
  }
  let company;
  if (allCompanies.length === 1) {
    // Lock the existing company row for update within this transaction.
    const locked = await Company.findByIdForUpdate(allCompanies[0]._id);
    if (!locked) {
      return errorResponse('Company record could not be locked for update', 409);
    }
    company = locked;
    Object.assign(company, payload);
    await company.save();
  } else {
    // No company exists: use an advisory lock to prevent concurrent first-time creation.
    const txConn = transactionStorage.getStore();
    if (!txConn) {
      return errorResponse('Database transaction required for company setup', 500);
    }
    const [lockRows] = await txConn.execute(
      "SELECT GET_LOCK('erp_company_create', 10) AS lockResult",
    );
    const lockAcquired =
      lockRows && lockRows[0] && lockRows[0].lockResult === 1;
    if (lockAcquired) {
      lockHeldConnections.add(txConn);
    }
    if (!lockAcquired) {
      return errorResponse(
        'Could not acquire company creation lock. Another setup may be in progress. Please try again.',
        409,
      );
    }
    // Re-check after acquiring the lock - another request may have created it.
    const companiesAgain = await Company.find({});
    if (companiesAgain.length > 0) {
      const locked = await Company.findByIdForUpdate(companiesAgain[0]._id);
      if (!locked) {
        return errorResponse('Company record could not be locked for update', 409);
      }
      company = locked;
      Object.assign(company, payload);
      await company.save();
    } else {
      company = await Company.create({
        companyName: payload.companyName || '',
        legalName: payload.legalName || '',
        ntnNumber: payload.ntnNumber || '',
        strnNumber: payload.strnNumber || '',
        address: payload.address || '',
        phone: payload.phone || '',
        email: payload.email || '',
        currency: payload.currency || 'PKR',
        currencySymbol: payload.currencySymbol || 'Rs.',
        branches: payload.branches || [],
        locations: payload.locations || [],
        developerAttribution: payload.developerAttribution || '',
        financialYearStart: payload.financialYearStart || '',
        financialYearEnd: payload.financialYearEnd || '',
        taxSettings: payload.taxSettings || { defaultTaxRate: 0, taxName: 'Sales Tax', taxRegistrationNumber: '' },
        accountingMappings: payload.accountingMappings || {},
        onboardingCompleted: payload.onboardingCompleted === true,
      });
    }
  }

  await AuditLog.create({
    userName: actor.name || '',
    action: 'UPDATE',
    module: 'Administration',
    recordId: company._id.toString(),
    description: `Updated company profile settings`,
  });

  return successResponse({ company }, 'Company settings updated');
}

async function postAdministration(request, actor) {
  try {
    if (actor?.role !== 'SuperAdmin') {
      return errorResponse('Only a SuperAdmin can change administration settings', 403);
    }
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_USER') {
      const { name, email, password, role, branch, department, phone } = body;
      const assignedRole = role || 'GeneralManager';
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const strength = evaluatePasswordStrength(password);
      if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !strength.isValid) {
        return errorResponse('Enter a name, valid email, and a strong password meeting all complexity criteria (at least 12 characters, uppercase, lowercase, number, and special character)', 400);
      }
      if (!await roleExists(assignedRole)) {
        return errorResponse('Select a supported user role', 400);
      }
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return errorResponse('A user with this email already exists', 409);
      }
      const hashedPassword = await hashPassword(password);
      const newUser = await User.create({
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: assignedRole,
        branch: branch || '',
        department: department || '',
        phone: phone || '',
        permissions: [],
        isActive: true,
      });

      await AuditLog.create({
        userName: actor.name || '',
        action: 'CREATE',
        module: 'Administration',
        recordId: newUser._id.toString(),
        description: `Created new user account: ${name} (${newUser.role})`,
      });

      return successResponse({ user: publicUser(newUser) }, 'User created successfully', 201);
    }

    if (action === 'CREATE_ROLE') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (!/^[A-Za-z][A-Za-z0-9 _-]{1,39}$/.test(name) ||
        BUILT_IN_ROLES.some((role) => role.toLowerCase() === name.toLowerCase())) {
        return errorResponse('Enter a unique custom role name between 2 and 40 characters', 400);
      }
      if (!validRolePermissions(body.permissions)) {
        return errorResponse('Role permissions contain an unsupported or duplicate module action', 400);
      }
      const role = await Role.create({ name, description, permissions: body.permissions });
      await AuditLog.create({
        userName: actor.name || '',
        action: 'CREATE',
        module: 'Administration',
        recordId: role._id.toString(),
        description: `Created role: ${role.name}`,
      });
      return successResponse({ role }, 'Role created', 201);
    }

    if (action === 'UPDATE_ROLE') {
      const role = await Role.findByIdForUpdate(body.roleId);
      if (!role) return errorResponse('Custom role not found', 404);
      if (!validRolePermissions(body.permissions)) {
        return errorResponse('Role permissions contain an unsupported or duplicate module action', 400);
      }
      if (body.description !== undefined && typeof body.description !== 'string') {
        return errorResponse('Role description must be text', 400);
      }
      role.permissions = body.permissions;
      if (body.description !== undefined) role.description = body.description.trim();
      await role.save();
      await AuditLog.create({
        userName: actor.name || '',
        action: 'UPDATE',
        module: 'Administration',
        recordId: role._id.toString(),
        description: `Updated permissions for role: ${role.name}`,
      });
      return successResponse({ role }, 'Role permissions updated');
    }

    if (action === 'DELETE_ROLE') {
      const role = await Role.findByIdForUpdate(body.roleId);
      if (!role) return errorResponse('Custom role not found', 404);
      if (await User.countDocuments({ role: role.name })) {
        return errorResponse('Reassign all users before deleting this role', 409);
      }
      await Role.deleteOne({ _id: role._id });
      await AuditLog.create({
        userName: actor.name || '',
        action: 'DELETE',
        module: 'Administration',
        recordId: role._id.toString(),
        description: `Deleted role: ${role.name}`,
      });
      return successResponse({ role }, 'Role deleted');
    }

    if (action === 'UPDATE_COMPANY') {
      return await handleUpdateCompany(request, actor, body);
    }

    if (action === 'UPDATE_MASTER_DATA') {
      const fields = pickFields(body, ['units', 'sizes', 'colors', 'taxRates']);
      let masterData = await MasterData.findOne({});
      if (masterData) {
        Object.assign(masterData, fields);
        await masterData.save();
      } else {
        masterData = await MasterData.create(fields);
      }
      await AuditLog.create({
        userName: actor.name || '',
        action: 'UPDATE',
        module: 'Administration',
        recordId: masterData._id.toString(),
        description: 'Updated master data settings',
      });
      return successResponse({ masterData }, 'Master data updated');
    }

    if (action === 'UPDATE_USER') {
      const updates = pickFields(body, [
        'name', 'role', 'branch', 'department', 'phone', 'isActive',
      ]);
      if (body.permissions !== undefined) {
        return errorResponse('Assign permissions through a role, not directly to a user', 400);
      }
      if (updates.name !== undefined) updates.name = String(updates.name).trim();
      if (updates.name !== undefined && !updates.name) return errorResponse('User name cannot be empty', 400);
      if (updates.role !== undefined && !await roleExists(updates.role)) {
        return errorResponse('Select a supported user role', 400);
      }
      if (updates.isActive !== undefined && typeof updates.isActive !== 'boolean') {
        return errorResponse('User activation status must be true or false', 400);
      }
      if (String(body.userId || '') === String(actor._id) &&
        ['role', 'isActive'].some((field) => updates[field] !== undefined)) {
        return errorResponse('You cannot change your own role, permissions, or activation status', 403);
      }
      const user = await updateRecord(User, body.userId, updates);
      if (!user) return errorResponse('User not found', 404);
      await AuditLog.create({
        userName: actor.name || '',
        action: 'UPDATE',
        module: 'Administration',
        recordId: user._id.toString(),
        description: `Updated user account: ${user.email}`,
      });
      const safeUser = { ...user };
      delete safeUser.password;
      return successResponse({ user: safeUser }, 'User updated');
    }

    if (action === 'RESET_USER_PASSWORD') {
      const { userId, newPassword } = body;
      const strength = evaluatePasswordStrength(newPassword);
      if (!userId || !strength.isValid) {
        return errorResponse('User ID and a strong new password meeting all complexity criteria (at least 12 characters, uppercase, lowercase, number, and special character) are required', 400);
      }
      const target = await User.findByIdForUpdate(userId);
      if (!target) return errorResponse('User not found', 404);
      target.password = await hashPassword(newPassword);
      await target.save();
      await AuditLog.create({
        userName: actor.name || '',
        action: 'UPDATE',
        module: 'Administration',
        recordId: target._id.toString(),
        description: `Reset password for user account: ${target.email}`,
      });
      return successResponse({}, 'User password reset successfully');
    }

    if (action === 'DELETE_USER') {
      if (String(body.userId || '') === String(actor._id)) {
        return errorResponse('You cannot delete your own account', 403);
      }
      const target = await User.findById(body.userId);
      if (!target) return errorResponse('User not found', 404);
      if (target.role === 'SuperAdmin' && await User.countDocuments({ role: 'SuperAdmin' }) <= 1) {
        return errorResponse('The last SuperAdmin account cannot be deleted', 409);
      }
      const user = await deleteRecord(User, body.userId);
      if (!user) return errorResponse('User not found', 404);
      await AuditLog.create({
        userName: actor.name || '',
        action: 'DELETE',
        module: 'Administration',
        recordId: user._id.toString(),
        description: `Deleted user account: ${user.email}`,
      });
      const safeUser = { ...user };
      delete safeUser.password;
      return successResponse({ user: safeUser }, 'User deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

  postAdministration.onSettle = async (conn) => {
    try {
      if (!conn || !lockHeldConnections.has(conn)) {
        // Lock was never acquired on this connection; nothing to release.
        return;
      }
      const [releaseRows] = await conn.execute(
        "SELECT RELEASE_LOCK('erp_company_create') AS lockResult",
      );
      const lockReleased =
        releaseRows &&
        releaseRows[0] &&
        (releaseRows[0].lockResult === 1 ||
          releaseRows[0]['RELEASE_LOCK(\'erp_company_create\')'] === 1);
      if (lockReleased) {
        lockHeldConnections.delete(conn);
      } else {
        taintConnection(conn);
        throw new Error(
          `RELEASE_LOCK did not confirm release (result: ${JSON.stringify(
            releaseRows?.[0]?.lockResult ?? releaseRows?.[0]?.['RELEASE_LOCK(\'erp_company_create\')'] ?? 'null',
          )})`,
        );
      }
    } catch (releaseError) {
      taintConnection(conn);
      console.error(
        'Failed to release advisory lock; connection will be destroyed:',
        String(releaseError.message || releaseError),
      );
    }
  };

export const GET = withAuthorization(getAdministration, 'administration');
export const POST = withAuthorization(postAdministration, 'administration', 'write');
