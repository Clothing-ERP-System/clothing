import { connectDB } from '@/lib/db.js';
import User from '@/models/User.js';
import { verifyPassword, generateToken, COOKIE_NAME } from '@/lib/auth.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

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
    const { email, password } = body;

    if (!email || !password) {
      return errorResponse('Email and password are required', 400);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return errorResponse('Invalid email or password', 401);
    }

    if (!user.isActive) {
      return errorResponse('User account is deactivated. Contact administrator.', 403);
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return errorResponse('Invalid email or password', 401);
    }

    const payload = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      department: user.department,
      permissions: user.permissions || [],
    };

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
    return errorResponse(error.message, 500);
  }
}
