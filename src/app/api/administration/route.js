import { connectDB } from '@/lib/db.js';
import Company from '@/models/Company.js';
import User from '@/models/User.js';
import MasterData from '@/models/MasterData.js';
import AuditLog from '@/models/AuditLog.js';
import { hashPassword } from '@/lib/auth.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('Database offline, returning default administration data:', dbError.message);
      return successResponse({
        company: { branches: [] },
        users: [],
        masterData: {},
        auditLogs: [],
      });
    }

    const company = (await Company.findOne({}).catch(() => ({}))) || {};
    const users = (await User.find({}, '-password').sort({ createdAt: -1 }).catch(() => [])) || [];
    const masterData = (await MasterData.findOne({}).catch(() => ({}))) || {};
    const auditLogs = (await AuditLog.find({}).sort({ createdAt: -1 }).limit(30).catch(() => [])) || [];

    return successResponse({
      company,
      users,
      masterData,
      auditLogs,
    });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_USER') {
      const { name, email, password, role, branch, department, phone, permissions } = body;
      if (!name || !email || !password) {
        return errorResponse('Name, email and password are required', 400);
      }
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        return errorResponse('A user with this email already exists', 400);
      }
      const hashedPassword = await hashPassword(password);
      const newUser = await User.create({
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: role || 'GeneralManager',
        branch: branch || '',
        department: department || '',
        phone: phone || '',
        permissions: permissions || [],
      });

      await AuditLog.create({
        userName: '',
        action: 'CREATE',
        module: 'Administration',
        recordId: newUser._id.toString(),
        description: `Created new user account: ${name} (${role})`,
      });

      return successResponse({ user: newUser }, 'User created successfully', 201);
    }

    if (action === 'UPDATE_COMPANY') {
      const { name, registrationNumber, taxId, address, phone, email, currency, branches } = body;
      let company = await Company.findOne({});
      if (company) {
        company.name = name ?? company.name;
        company.registrationNumber = registrationNumber ?? company.registrationNumber;
        company.taxId = taxId ?? company.taxId;
        company.address = address ?? company.address;
        company.phone = phone ?? company.phone;
        company.email = email ?? company.email;
        company.currency = currency ?? company.currency;
        if (branches) company.branches = branches;
        await company.save();
      } else {
        company = await Company.create({
          name: name || 'ERP Dost',
          registrationNumber: registrationNumber || '',
          taxId: taxId || '',
          address: address || '',
          phone: phone || '',
          email: email || '',
          currency: currency || 'PKR',
          branches: branches || [],
        });
      }

      await AuditLog.create({
        userName: '',
        action: 'UPDATE',
        module: 'Administration',
        recordId: company._id.toString(),
        description: `Updated company profile settings`,
      });

      return successResponse({ company }, 'Company settings updated');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
