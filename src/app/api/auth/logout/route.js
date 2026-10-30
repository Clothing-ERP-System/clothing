import { COOKIE_NAME } from '@/lib/auth.js';
import { successResponse } from '@/lib/api-response.js';

export async function POST() {
  const response = successResponse({}, 'Logged out successfully');
  response.cookies.delete(COOKIE_NAME);
  return response;
}
