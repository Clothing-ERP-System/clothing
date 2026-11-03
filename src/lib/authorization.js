import User from '@/models/User.js';
import Role from '@/models/Role.js';
import { getSessionUser, COOKIE_NAME } from '@/lib/auth.js';
import { connectDB, runInTransaction } from '@/lib/db.js';
import {
  errorResponse,
  forbiddenResponse,
  fromError,
  unauthorizedResponse,
} from '@/lib/api-response.js';
import { canAccessModule, permissionForAction } from '@/lib/role-access.js';
import { BUILT_IN_ROLES } from '@/lib/role-definitions.js';

export function publicUser(user, rolePermissions) {
  return {
    id: String(user._id),
    name: user.name || '',
    email: user.email || '',
    role: user.role || '',
    branch: user.branch || '',
    department: user.department || '',
    permissions: Array.isArray(rolePermissions)
      ? rolePermissions
      : Array.isArray(user.permissions) ? user.permissions : [],
    isActive: user.isActive !== false,
  };
}

export async function getAuthenticatedUser() {
  let session;
  try {
    session = await getSessionUser();
  } catch (error) {
    console.error('Session verification failed:', error);
    return { response: errorResponse('Unable to verify the current session', 503) };
  }

  if (!session?.id) return { response: unauthorizedResponse() };

  let user;
  try {
    await connectDB();
    user = await User.findById(String(session.id));
  } catch (error) {
    console.error('Account authorization lookup failed:', error);
    return { response: errorResponse('Unable to verify account access right now', 503) };
  }

  if (!user || user.isActive === false) {
    const response = unauthorizedResponse('This account is no longer active');
    response.cookies.delete(COOKIE_NAME);
    return { response };
  }

  if (!BUILT_IN_ROLES.includes(user.role)) {
    try {
      const role = await Role.findOne({ name: user.role });
      if (!role) return { response: forbiddenResponse('This account has no configured role permissions') };
      user.permissions = Array.isArray(role.permissions) ? role.permissions : [];
    } catch (error) {
      console.error('Role permission lookup failed:', error);
      return { response: errorResponse('Unable to verify role permissions right now', 503) };
    }
  }

  return { user };
}

export async function authorizeUser(module, requiredAction, checkPermission = true) {
  const { user, response } = await getAuthenticatedUser();
  if (response) return { response };

  if (checkPermission && !await canAccessModule(user, module, requiredAction)) {
    return { response: forbiddenResponse() };
  }

  return { user };
}

export function withAuthorization(handler, module, operation = 'read', forcedAction = '', skipAuth = false) {
  return async (...args) => {
    if (skipAuth) {
      if (operation === 'write') {
        try {
          return await runInTransaction(() => handler(...args));
        } catch (error) {
          return fromError(error, 503);
        }
      }
      return handler(...args);
    }

    let requiredAction = forcedAction || (operation === 'read' ? 'view' : operation);
    if (!forcedAction && operation === 'write') {
      let action = '';
      try {
        const request = args[0];
        action = request && typeof request.clone === 'function'
          ? (await request.clone().json()).action
          : '';
      } catch {
        action = '';
      }
      requiredAction = permissionForAction(action, args[0]?.method || 'POST');
    }

    const companyInfoRead = module === 'administration' && operation === 'read';
    const { user, response } = companyInfoRead
      ? await authorizeUser(module, 'view', false)
      : await authorizeUser(module, requiredAction);
    if (response) return response;

    if (args[0]) args[0].user = user;
    const handlerArgs = args[0] ? [args[0], user, ...args.slice(1)] : [user];

    if (operation !== 'write') return handler(...handlerArgs);

    try {
      return await runInTransaction(() => handler(...handlerArgs));
    } catch (error) {
      return fromError(error, 503);
    }
  };
}
