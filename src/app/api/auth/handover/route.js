import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { connectDB, pool, releaseOrDestroyConnection } from '@/lib/db.js';
import User from '@/models/User.js';
import HandoverInvitation from '@/models/HandoverInvitation.js';
import AuditLog from '@/models/AuditLog.js';
import { hashPassword, generateToken, COOKIE_NAME } from '@/lib/auth.js';
import { successResponse, errorResponse, forbiddenResponse, fromError } from '@/lib/api-response.js';
import { getAuthenticatedUser, publicUser } from '@/lib/authorization.js';
import { evaluatePasswordStrength } from '@/lib/password-policy.js';

export async function GET(request) {
  try {
    await connectDB();
    const token = request.nextUrl.searchParams.get('token');

    // Case 1: Public token validation for client ownership setup
    if (token) {
      const cleanToken = String(token).trim();
      if (cleanToken.length < 32) {
        return errorResponse('Invalid handover token format', 400);
      }
      const tokenHash = createHash('sha256').update(cleanToken).digest('hex');
      const invitation = await HandoverInvitation.findOne({ tokenHash });

      if (!invitation) {
        return errorResponse('Invalid or unrecognized handover invitation token', 404);
      }
      if (invitation.used) {
        return errorResponse('This handover invitation has already been claimed', 410);
      }
      if (new Date(invitation.expiresAt) < new Date()) {
        return errorResponse('This handover invitation has expired', 410);
      }

      return successResponse({
        valid: true,
        clientEmail: invitation.clientEmail,
        clientName: invitation.clientName,
        expiresAt: invitation.expiresAt,
      });
    }

    // Case 2: Authenticated SuperAdmin listing handover invitations
    const { user, response } = await getAuthenticatedUser();
    if (response) return response;
    if (user.role !== 'SuperAdmin') {
      return forbiddenResponse('Only a SuperAdmin can inspect handover status');
    }

    const invitations = await HandoverInvitation.find({}).sort({ createdAt: -1 }).limit(20);
    return successResponse({
      invitations: invitations.map((inv) => ({
        id: String(inv._id),
        clientEmail: inv.clientEmail,
        clientName: inv.clientName,
        invitedBy: inv.invitedBy,
        expiresAt: inv.expiresAt,
        used: inv.used === true,
        usedAt: inv.usedAt || null,
        claimedBy: inv.claimedBy || null,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error('Handover GET error:', error);
    return fromError(error);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const action = String(body?.action || '').trim().toUpperCase();

    // ─────────────────────────────────────────────────────────────
    // ACTION 1: CREATE_INVITATION (Authenticated SuperAdmin only)
    // ─────────────────────────────────────────────────────────────
    if (action === 'CREATE_INVITATION') {
      const { user, response } = await getAuthenticatedUser();
      if (response) return response;
      if (user.role !== 'SuperAdmin') {
        return forbiddenResponse('Only an active SuperAdmin can generate a handover invitation');
      }

      const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim().toLowerCase() : '';
      const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';

      if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        return errorResponse('A valid client email address is required', 400);
      }
      if (!clientName) {
        return errorResponse('Client name is required', 400);
      }

      // Check if user with this email already exists and is active
      const existingUser = await User.findOne({ email: clientEmail });
      if (existingUser && existingUser.isActive !== false) {
        return errorResponse(`An active user with email ${clientEmail} already exists in the system`, 409);
      }

      // Generate 32 cryptographically random bytes (64 hex characters)
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      // 48 hours validity
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const invitation = await HandoverInvitation.create({
        tokenHash,
        clientEmail,
        clientName,
        invitedBy: user.email,
        expiresAt,
        used: false,
        usedAt: null,
        claimedBy: null,
      });

      await AuditLog.create({
        actor: user.email,
        action: 'CREATE_HANDOVER_INVITATION',
        module: 'administration',
        details: {
          clientEmail,
          clientName,
          invitationId: String(invitation._id),
          expiresAt,
        },
      });

      const inviteUrl = `/setup-ownership?token=${rawToken}`;
      return successResponse(
        {
          inviteUrl,
          token: rawToken,
          clientEmail,
          clientName,
          expiresAt,
        },
        'Secure client handover invitation generated successfully'
      );
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 2: CLAIM_OWNERSHIP (Token-gated bootstrap claim)
    // ─────────────────────────────────────────────────────────────
    if (action === 'CLAIM_OWNERSHIP') {
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim().toLowerCase() : '';
      const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';

      if (!token || token.length < 32) {
        return errorResponse('A valid handover authorization token is required', 400);
      }
      if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        return errorResponse('A valid client email address is required', 400);
      }

      // Enforce 12-character password complexity
      const strength = evaluatePasswordStrength(password);
      if (!strength.isValid) {
        return errorResponse(
          'Password must meet complexity criteria: minimum 12 characters, with uppercase, lowercase, number, and special character',
          400,
          {
            checks: {
              minLength: strength.minLength,
              hasUpper: strength.hasUpper,
              hasLower: strength.hasLower,
              hasNumber: strength.hasNumber,
              hasSpecial: strength.hasSpecial,
            },
          }
        );
      }

      // Concurrency protection via MySQL advisory lock
      const connection = await pool.getConnection();
      let lockAcquired = false;
      try {
        const [lockRows] = await connection.query('SELECT GET_LOCK(?, ?) AS lock_acquired', [
          'clothing_erp:handover_claim',
          10,
        ]);
        lockAcquired = Number(lockRows[0]?.lock_acquired) === 1;
        if (!lockAcquired) {
          return errorResponse('Another handover claim is currently in progress. Please retry.', 409);
        }

        const tokenHash = createHash('sha256').update(token).digest('hex');
        const invitation = await HandoverInvitation.findOne({ tokenHash });

        if (!invitation) {
          return errorResponse('Invalid or unrecognized handover invitation token', 404);
        }
        if (invitation.used === true) {
          return errorResponse('This handover invitation has already been claimed and cannot be reused', 410);
        }
        if (new Date(invitation.expiresAt) < new Date()) {
          return errorResponse('This handover invitation has expired', 410);
        }
        if (invitation.clientEmail.toLowerCase() !== clientEmail) {
          return errorResponse('The email address provided does not match the invitation authorization', 403);
        }

        // Check if an active user with this email already exists
        const existingUser = await User.findOne({ email: clientEmail });
        if (existingUser && existingUser.isActive !== false) {
          return errorResponse('An active user account with this email address already exists', 409);
        }

        // Hash password with bcrypt
        const hashedPassword = await hashPassword(password);
        const nowIso = new Date().toISOString();

        let newUser;
        if (existingUser) {
          existingUser.name = clientName || invitation.clientName || existingUser.name;
          existingUser.password = hashedPassword;
          existingUser.role = 'SuperAdmin';
          existingUser.permissions = ['ALL'];
          existingUser.branch = 'Head Office';
          existingUser.department = 'Executive';
          existingUser.isActive = true;
          existingUser.failedAttempts = 0;
          existingUser.lockedUntil = null;
          await existingUser.save();
          newUser = existingUser;
        } else {
          newUser = await User.create({
            name: clientName || invitation.clientName || 'Client Administrator',
            email: clientEmail,
            password: hashedPassword,
            role: 'SuperAdmin',
            permissions: ['ALL'],
            branch: 'Head Office',
            department: 'Executive',
            isActive: true,
            isHandoverAdmin: true,
            failedAttempts: 0,
            lockedUntil: null,
            createdAt: nowIso,
          });
        }

        // Invalidate the invitation token so it can NEVER be reused
        invitation.used = true;
        invitation.usedAt = nowIso;
        invitation.claimedBy = String(newUser._id);
        await invitation.save();

        await AuditLog.create({
          actor: clientEmail,
          action: 'CLIENT_OWNERSHIP_CLAIMED',
          module: 'administration',
          details: {
            clientEmail,
            userId: String(newUser._id),
            invitationId: String(invitation._id),
          },
        });

        // Generate immediate session cookie so the client is logged in
        const payload = publicUser(newUser, ['ALL']);
        const sessionToken = generateToken(payload);
        const csrfToken = randomUUID();

        const response = successResponse(
          { user: payload, token: sessionToken },
          'Client SuperAdmin account created successfully. Ownership transfer complete.'
        );

        response.cookies.set({
          name: COOKIE_NAME,
          value: sessionToken,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });

        response.cookies.set({
          name: 'csrf_token',
          value: csrfToken,
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });

        return response;
      } finally {
        if (lockAcquired) {
          await connection.query('SELECT RELEASE_LOCK(?)', ['clothing_erp:handover_claim']).catch(() => {});
        }
        await releaseOrDestroyConnection(connection);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // ACTION 3: DEACTIVATE_PREVIOUS_ADMIN (Safe deactivation after verification)
    // ─────────────────────────────────────────────────────────────
    if (action === 'DEACTIVATE_PREVIOUS_ADMIN') {
      const { user, response } = await getAuthenticatedUser();
      if (response) return response;
      if (user.role !== 'SuperAdmin') {
        return forbiddenResponse('Only an active SuperAdmin can deactivate an administrator account');
      }

      const targetEmail = typeof body.developerEmail === 'string' && body.developerEmail.trim()
        ? body.developerEmail.trim().toLowerCase()
        : 'zainabasghar307@gmail.com';

      // Safety Rule: Verify that at least one OTHER active SuperAdmin exists
      const allActiveSuperAdmins = (await User.find({ role: 'SuperAdmin' })).filter(
        (u) => u.isActive !== false && u.email?.toLowerCase() !== targetEmail
      );

      if (allActiveSuperAdmins.length === 0) {
        return errorResponse(
          'Cannot deactivate developer account: at least one other active SuperAdmin must exist in the system to prevent lockout',
          400
        );
      }

      const targetAdmin = await User.findOne({ email: targetEmail });
      if (!targetAdmin) {
        return errorResponse(`Account ${targetEmail} not found`, 404);
      }

      if (targetAdmin.isActive === false) {
        return successResponse(
          { deactivated: true, email: targetEmail },
          'Developer account is already deactivated'
        );
      }

      targetAdmin.isActive = false;
      await targetAdmin.save();

      await AuditLog.create({
        actor: user.email,
        action: 'DEVELOPER_SUPERADMIN_DEACTIVATED',
        module: 'administration',
        details: {
          deactivatedEmail: targetEmail,
          deactivatedBy: user.email,
        },
      });

      return successResponse(
        { deactivated: true, email: targetEmail },
        `Developer account ${targetEmail} has been safely deactivated after successful client handover.`
      );
    }

    return errorResponse(`Unrecognized action: ${action}`, 400);
  } catch (error) {
    console.error('Handover POST error:', error);
    return fromError(error);
  }
}

