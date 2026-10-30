import { getSessionUser } from '@/lib/auth.js';
import { successResponse, unauthorizedResponse } from '@/lib/api-response.js';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return unauthorizedResponse('Not logged in');
  }
  return successResponse({ user }, 'Current session retrieved');
}
