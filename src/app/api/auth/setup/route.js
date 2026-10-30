import { randomUUID } from 'node:crypto';
import { pool } from '@/lib/db.js';
import User from '@/models/User.js';
import { hashPassword, generateToken, COOKIE_NAME } from '@/lib/auth.js';
import { errorResponse, successResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    return successResponse({ setupRequired: (await User.countDocuments()) === 0 });
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

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
      return errorResponse('Enter your name, a valid email, and a password of at least 12 characters.', 400);
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
    const user = await User.create({
      _id: userId,
      name,
      email,
      password: await hashPassword(password),
      role: 'SuperAdmin',
      branch: '',
      department: '',
      phone: '',
      permissions: ['ALL'],
      isActive: true,
    });
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
