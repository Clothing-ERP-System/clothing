import { createHash } from 'node:crypto';
import { connectDB, runInTransaction } from '@/lib/db.js';
import User from '@/models/User.js';
import Role from '@/models/Role.js';
import LoginRateLimit from '@/models/LoginRateLimit.js';
import { verifyPassword, generateToken, COOKIE_NAME } from '@/lib/auth.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';
import { publicUser } from '@/lib/authorization.js';
import { BUILT_IN_ROLES } from '@/lib/role-definitions.js';
import { randomUUID } from 'node:crypto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const IP_MAX_FAILED_ATTEMPTS = 10;
const IP_LOCKOUT_MINUTES = 15;

function getClientIp(request) {
  // SECURITY LIMITATION: This function trusts X-Forwarded-For and X-Real-IP headers.
  // These headers are only trustworthy when the application sits behind a trusted
  // reverse proxy that strips/sets them. Without a trusted proxy configuration,
  // a client can spoof these headers to bypass IP-based rate limiting.
  //
  // DEPLOYMENT REQUIREMENT: Configure your reverse proxy (nginx, Cloudflare, etc.)
  // to set X-Forwarded-For or X-Real-IP from the actual connection source, and
  // ensure clients cannot set these headers directly.
  //
  // Without trusted proxy configuration, IP-based rate limiting provides
  // best-effort protection only and should not be relied upon as a sole
  // defense against distributed login attacks.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) return ips[0];
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

function loginFailureResponse(kind) {
  // All failure kinds return the same generic message to avoid email enumeration.
  return errorResponse('Invalid email or password', 401);
}

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

    const clientIp = getClientIp(request);
    const ipHash = createHash('sha256').update(clientIp).digest('hex');

    const result = await runInTransaction(async () => {
      // ── IP-based rate limiting (persisted in MySQL) ──
      // Lock and re-read the IP rate-limit row to prevent concurrent
      // failed-login bursts from bypassing the threshold via lost updates.
      const ipRecord = await LoginRateLimit.findOne({ ipHash });
      let ipRate = ipRecord ? await LoginRateLimit.findByIdForUpdate(ipRecord._id) : null;

      const now = new Date();
      const ipLockedUntil = ipRate && ipRate.lockedUntil ? new Date(ipRate.lockedUntil) : null;
      const ipAttempts = ipRate ? Number(ipRate.failedAttempts || 0) : 0;

      // Reset IP counter if the lockout window has expired
      if (ipRate && ipLockedUntil && ipLockedUntil <= now) {
        ipRate.failedAttempts = 0;
        ipRate.lockedUntil = null;
        await ipRate.save();
      }

      // IP is locked out
      if (ipRate && ipLockedUntil && ipLockedUntil > now) {
        return { kind: 'ip_locked' };
      }

      // ── Find and lock user row ──
      const userRecord = await User.findOne({ email });
      if (!userRecord) {
        // Unknown email: count as IP failure only, generic response to avoid enumeration
        if (!ipRate) {
          await LoginRateLimit.create({
            ipHash,
            failedAttempts: 1,
            lockedUntil: null,
            lastAttemptAt: now,
          });
        } else if (ipAttempts + 1 >= IP_MAX_FAILED_ATTEMPTS) {
          ipRate.failedAttempts = ipAttempts + 1;
          ipRate.lockedUntil = new Date(Date.now() + IP_LOCKOUT_MINUTES * 60 * 1000);
          await ipRate.save();
          return { kind: 'ip_locked' };
        } else {
          ipRate.failedAttempts = ipAttempts + 1;
          ipRate.lastAttemptAt = now;
          await ipRate.save();
        }
        return { kind: 'auth_failed' };
      }

      const user = await User.findByIdForUpdate(userRecord._id);
      if (!user) return { kind: 'auth_failed' };

      // ── Check account lockout ──
      const lockedUntil = user.lockedUntil ? new Date(user.lockedUntil) : null;
      if (lockedUntil && lockedUntil > now) {
        return { kind: 'account_locked' };
      }

      // ── Verify password ──
      const isMatch = await verifyPassword(password, user.password);
      if (!isMatch) {
        // Increment failed attempts on the locked row (safe from lost updates)
        const failedAttempts = Number(user.failedLoginAttempts || 0) + 1;
        user.failedLoginAttempts = failedAttempts;
        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockoutExpiry = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          user.lockedUntil = lockoutExpiry;
        }
        await user.save();

        // Also count against IP rate limit
        if (!ipRate) {
          await LoginRateLimit.create({
            ipHash,
            failedAttempts: 1,
            lockedUntil: null,
            lastAttemptAt: now,
          });
        } else {
          const nextIpAttempts = ipAttempts + 1;
          ipRate.failedAttempts = nextIpAttempts;
          ipRate.lastAttemptAt = now;
          if (nextIpAttempts >= IP_MAX_FAILED_ATTEMPTS) {
            ipRate.lockedUntil = new Date(Date.now() + IP_LOCKOUT_MINUTES * 60 * 1000);
          }
          await ipRate.save();
        }
        return { kind: 'auth_failed' };
      }

      // ── Successful login: reset counters ──
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      if (user.isActive !== true) {
        user.isActive = true;
      }
      await user.save();

      // Reset IP rate limit on successful login
      if (ipRate) {
        ipRate.failedAttempts = 0;
        ipRate.lockedUntil = null;
        ipRate.lastAttemptAt = now;
        await ipRate.save();
      }

      const role = BUILT_IN_ROLES.includes(user.role) ? null : await Role.findOne({ name: user.role });
      if (!BUILT_IN_ROLES.includes(user.role) && !role) {
        return { kind: 'invalid_role' };
      }
      const payload = publicUser(user, role?.permissions);

      const token = generateToken(payload);
      const csrfToken = randomUUID();

      return {
        kind: 'success',
        token,
        csrfToken,
        user: payload,
      };
    });

    // Map transaction result to HTTP response (outside the transaction so
    // failed-attempt increments are committed even though login failed).
    if (result.kind === 'ip_locked') {
      const lockedUntil = new Date(Date.now() + IP_LOCKOUT_MINUTES * 60 * 1000);
      return errorResponse(
        `Too many failed attempts from this IP. Try again after ${lockedUntil.toISOString()}`,
        403,
      );
    }
    if (result.kind === 'account_locked') {
      return errorResponse('User account is temporarily locked. Contact administrator.', 403);
    }
    if (result.kind === 'invalid_role') {
      return errorResponse('This account has an invalid role assignment. Contact your administrator.', 403);
    }
    if (result.kind === 'auth_failed') {
      return loginFailureResponse();
    }

    // Successful login
    const response = successResponse(
      { user: result.user },
      'Logged in successfully'
    );

    // Set HTTP-only session cookie
    response.cookies.set({
      name: COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Set CSRF token cookie (not httpOnly so the client can read it for X-CSRF-Token header)
    response.cookies.set({
      name: 'csrf_token',
      value: result.csrfToken,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Unable to sign in right now. Please try again.', 503);
  }
}
