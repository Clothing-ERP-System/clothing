import { connectDB } from '@/lib/db.js';
import { errorResponse, fromError, successResponse } from '@/lib/api-response.js';
import { withAuthorization } from '@/lib/authorization.js';

async function getSystemHealth() {
  try {
    await connectDB();
    return successResponse({
      database: 'MySQL',
      databaseName: process.env.MYSQL_DATABASE || 'clothing_erp',
      status: 'connected',
    });
  } catch (error) {
    console.error('MySQL health check failed:', error);
    return fromError(error, 503);
  }
}

export const GET = withAuthorization(getSystemHealth, 'system', 'read', '', true);
