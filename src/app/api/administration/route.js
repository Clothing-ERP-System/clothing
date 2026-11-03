import { connectDB } from '@/lib/db.js';
import Role from '@/models/Role.js';
import Company from '@/models/Company.js';
import User from '@/models/User.js';
import MasterData from '@/models/MasterData.js';
import AuditLog from '@/models/AuditLog.js';
import { hashPassword } from '@/lib/auth.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { deleteRecord, pickFields, updateRecord } from '@/lib/query.js';
import { publicUser, withAuthorization } from '@/lib/authorization.js';
import { BUILT_IN_ROLES, ERP_MODULES, ROLE_ACTIONS } from '@/lib/role-definitions.js';

const rolePermissionKeys = new Set(
  ERP_MODULES.flatMap((module) => ROLE_ACTIONS.map((permission) => `${module}:${permission}`))
    .filter((permission) => !permission.startsWith('administration:') &&
      !/^system:(add|edit|delete|approve|export|manage)$/.test(permission))
);

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

    return successResponse({
      company,
      users,
      roles,
      masterData,
      auditLogs,
    });
  } catch (error) {
    return fromError(error);
  }
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
      if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        typeof password !== 'string' || password.length < 12) {
        return errorResponse('Enter a name, valid email, and password of at least 12 characters', 400);
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
        'branches', 'locations', 'developerAttribution',
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
      if (Object.keys(payload).length === 0) {
        return errorResponse('Provide at least one company setting to update', 400);
      }
      let company = await Company.findOne({});
      if (company) {
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
        });
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
      if (!userId || typeof newPassword !== 'string' || newPassword.length < 12) {
        return errorResponse('User ID and a new password of at least 12 characters are required', 400);
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

export const GET = withAuthorization(getAdministration, 'administration');
export const POST = withAuthorization(postAdministration, 'administration', 'write');
