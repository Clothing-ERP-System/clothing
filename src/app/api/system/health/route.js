import { connectDB } from '@/lib/db.js';
import { errorResponse, successResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    return successResponse({
      database: 'MySQL',
      databaseName: process.env.MYSQL_DATABASE || 'clothing_erp',
      status: 'connected',
    });
  } catch (error) {
    console.error('MySQL health check failed:', error);
    return errorResponse('MySQL is unavailable. Check your database connection settings.', 503);
  }
}
