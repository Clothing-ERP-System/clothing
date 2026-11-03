import { getSessionUser } from '@/lib/auth.js';
import { connectDB } from '@/lib/db.js';
import User from '@/models/User.js';
import Role from '@/models/Role.js';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api-response.js';
import { publicUser } from '@/lib/authorization.js';
import { BUILT_IN_ROLES } from '@/lib/role-definitions.js';

export async function GET() {
  const session = await getSessionUser();
  if (!session?.id) {
    return unauthorizedResponse('Not logged in');
  }

  try {
    await connectDB();
    const user = await User.findById(String(session.id));
    if (!user || user.isActive === false) {
      const response = unauthorizedResponse('This account is no longer active');
      response.cookies.delete('garment_erp_session');
      return response;
    }
    const role = BUILT_IN_ROLES.includes(user.role) ? null : await Role.findOne({ name: user.role });
    if (!BUILT_IN_ROLES.includes(user.role) && !role) {
      const response = unauthorizedResponse('This account has an invalid role assignment');
      response.cookies.delete('garment_erp_session');
      return response;
    }
    return successResponse({ user: publicUser(user, role?.permissions) }, 'Current session retrieved');
  } catch (error) {
    console.error('Current session lookup failed:', error);
    return errorResponse('Unable to verify the current session', 503);
  }
}
