import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pool, runInTransaction } from '@/lib/db.js';
import User from '@/models/User.js';
import { hashPassword, generateToken, COOKIE_NAME } from '@/lib/auth.js';
import { errorResponse, successResponse } from '@/lib/api-response.js';
import { evaluatePasswordStrength } from '@/lib/password-policy.js';

export async function GET() {
  try {
    const userCount = await User.countDocuments();
    const isSetupRequired = userCount === 0;
    const tokenConfigured = Boolean(
      process.env.INITIAL_SUPERADMIN_SETUP_TOKEN &&
      process.env.INITIAL_SUPERADMIN_SETUP_TOKEN.length >= 32
    );

    return successResponse({
      setupRequired: isSetupRequired,
      setupAvailable: isSetupRequired,
      tokenRequired: tokenConfigured,
    });
  } catch (error) {
    console.error('Workspace setup check failed:', error);
    return errorResponse('Unable to connect to the MySQL database. Check your database settings.', 503);
  }
}

export async function POST(request) {
  let connection;
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const setupToken = typeof body.setupToken === 'string' ? body.setupToken : '';
    const configuredToken = process.env.INITIAL_SUPERADMIN_SETUP_TOKEN;
    const tokenRequired = Boolean(configuredToken && configuredToken.length >= 32);

    if (tokenRequired) {
      const providedToken = Buffer.from(setupToken);
      const expectedToken = Buffer.from(configuredToken);
      if (providedToken.length !== expectedToken.length || !timingSafeEqual(providedToken, expectedToken)) {
        return errorResponse('Invalid owner setup token', 403);
      }
    }

    const strength = evaluatePasswordStrength(password);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('Enter your name and a valid email address.', 400);
    }
    if (!strength.isValid) {
      return errorResponse(
        'Password does not meet mandatory security requirements (at least 12 characters, uppercase, lowercase, number, and special character).',
        400
      );
    }

    connection = await pool.getConnection();
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [
      `${process.env.MYSQL_DATABASE || 'clothing_erp'}:initial_setup`,
    ]);
    if (lockRows[0]?.acquired !== 1) {
      return errorResponse('Workspace setup is already in progress. Try again shortly.', 409);
    }

    if ((await User.countDocuments()) !== 0) {
      return errorResponse('Workspace is already set up. Sign in instead.', 409);
    }

    const userId = randomUUID();
    const payload = {
      id: userId,
      name,
      email,
      role: 'SuperAdmin',
      branch: '',
      department: '',
      permissions: ['ALL'],
    };
    const token = generateToken(payload);
    const hashedPassword = await hashPassword(password);
    const user = await runInTransaction(() => User.create({
      _id: userId,
      name,
      email,
      password: hashedPassword,
      role: 'SuperAdmin',
      branch: '',
      department: '',
      phone: '',
      permissions: ['ALL'],
      isActive: true,
    }));
    payload.id = user._id;
    const response = successResponse({ user: payload }, 'Workspace administrator created');
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    console.error('Workspace setup failed:', error);
    return errorResponse('Unable to set up the workspace. Check the MySQL connection and try again.', 500);
  } finally {
    if (connection) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [
          `${process.env.MYSQL_DATABASE || 'clothing_erp'}:initial_setup`,
        ]);
      } finally {
        connection.release();
      }
    }
  }
}
