import { connectDB } from '@/lib/db.js';
import User from '@/models/User.js';
import Role from '@/models/Role.js';
import { verifyPassword, generateToken, COOKIE_NAME } from '@/lib/auth.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';
import { publicUser } from '@/lib/authorization.js';
import { BUILT_IN_ROLES } from '@/lib/role-definitions.js';

export async function POST(request) {
  try {
    await connectDB();

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      return errorResponse('Create the first administrator to set up this workspace', 409, {
        setupRequired: true,
      });
    }

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return errorResponse('Email and password are required', 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse('Invalid email or password', 401);
    }

    if (user.isActive === false) {
      return errorResponse('User account is deactivated. Contact administrator.', 403);
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return errorResponse('Invalid email or password', 401);
    }

    if (user.isActive !== true) {
      user.isActive = true;
      await user.save();
    }

    const role = BUILT_IN_ROLES.includes(user.role) ? null : await Role.findOne({ name: user.role });
    if (!BUILT_IN_ROLES.includes(user.role) && !role) {
      return errorResponse('This account has an invalid role assignment. Contact your administrator.', 403);
    }
    const payload = publicUser(user, role?.permissions);

    const token = generateToken(payload);

    const response = successResponse(
      { user: payload },
      'Logged in successfully'
    );

    // Set HTTP-only session cookie
    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Unable to sign in right now. Please try again.', 503);
  }
}
