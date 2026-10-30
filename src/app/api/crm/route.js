import { allocateSequence, connectDB } from '@/lib/db.js';
import { CRMLead, MarketingCampaign } from '@/models/CRM.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const leads = await CRMLead.find({}).sort({ createdAt: -1 });
    const campaigns = await MarketingCampaign.find({}).sort({ createdAt: -1 });
    return successResponse({ leads, campaigns });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_LEAD') {
      const { contactPerson, companyName, phone, email, channel, stage, estimatedOrderValuePKR, assignedSalesOfficer, lastDiscussionSummary } = body;
      const sequence = await allocateSequence('crm_lead');
      const leadCode = `LEAD-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const lead = await CRMLead.create({
        leadCode,
        contactPerson,
        companyName: companyName || '',
        phone,
        email: email || '',
        channel: channel || '',
        stage: stage || 'NewLead',
        estimatedOrderValuePKR: Number(estimatedOrderValuePKR) || 0,
        assignedSalesOfficer: assignedSalesOfficer || '',
        nextFollowUpDate: body.nextFollowUpDate || null,
        lastDiscussionSummary: lastDiscussionSummary || '',
      });

      return successResponse({ lead }, 'CRM lead created');
    }

    if (action === 'UPDATE_LEAD_STAGE') {
      const { leadId, stage, lastDiscussionSummary } = body;
      const lead = await CRMLead.findById(leadId);
      if (!lead) return errorResponse('Lead not found', 404);

      lead.stage = stage;
      if (lastDiscussionSummary) lead.lastDiscussionSummary = lastDiscussionSummary;
      await lead.save();

      return successResponse({ lead }, 'Pipeline stage updated');
    }

    if (action === 'CREATE_CAMPAIGN') {
      const { campaignTitle, seasonOrTheme, targetAudience, budgetPKR } = body;
      const campaign = await MarketingCampaign.create({
        campaignTitle,
        seasonOrTheme: seasonOrTheme || '',
        targetAudience: targetAudience || '',
        budgetPKR: Number(budgetPKR) || 0,
        status: 'Active',
      });
      return successResponse({ campaign }, 'Marketing campaign launched');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
