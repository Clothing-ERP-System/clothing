import { allocateSequence, connectDB } from '@/lib/db.js';
import { CRMLead, MarketingCampaign } from '@/models/CRM.js';
import Customer from '@/models/Customer.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';

const LEAD_STAGES = ['NewLead', 'Contacted', 'SampleSent', 'PriceNegotiation', 'WonOrder', 'Lost'];

async function getCrm(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const leads = applyListQuery(await CRMLead.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['leadCode', 'contactPerson', 'companyName', 'phone', 'assignedSalesOfficer'],
      statusField: 'stage',
    }).items;
    const campaigns = applyListQuery(await MarketingCampaign.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['campaignTitle', 'seasonOrTheme', 'targetAudience'],
    }).items;
    return successResponse({ leads, campaigns });
  } catch (error) {
    return fromError(error);
  }
}

async function postCrm(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_LEAD') {
      const { contactPerson, companyName, phone, email, channel, stage, estimatedOrderValuePKR, assignedSalesOfficer, lastDiscussionSummary } = body;
      const contact = String(contactPerson || '').trim();
      const leadPhone = String(phone || '').trim();
      const estimatedValue = Number(estimatedOrderValuePKR ?? 0);
      if (!contact || !leadPhone || !Number.isFinite(estimatedValue) || estimatedValue < 0 ||
        stage !== undefined && !LEAD_STAGES.includes(stage)) {
        return errorResponse('Contact, phone, a valid lead stage and non-negative estimated order value are required', 400);
      }
      const sequence = await allocateSequence('crm_lead');
      const leadCode = `LEAD-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const lead = await CRMLead.create({
        leadCode,
        contactPerson: contact,
        companyName: companyName || '',
        phone: leadPhone,
        email: email || '',
        channel: channel || '',
        stage: stage || 'NewLead',
        estimatedOrderValuePKR: estimatedValue,
        assignedSalesOfficer: assignedSalesOfficer || '',
        nextFollowUpDate: body.nextFollowUpDate || null,
        lastDiscussionSummary: lastDiscussionSummary || '',
      });

      return successResponse({ lead }, 'CRM lead created');
    }

    if (action === 'UPDATE_LEAD_STAGE') {
      const { leadId, stage, lastDiscussionSummary } = body;
      if (!LEAD_STAGES.includes(stage)) return errorResponse('Select a valid CRM pipeline stage', 400);
      const lead = await CRMLead.findByIdForUpdate(leadId);
      if (!lead) return errorResponse('Lead not found', 404);

      lead.stage = stage;
      if (lastDiscussionSummary) lead.lastDiscussionSummary = lastDiscussionSummary;
      await lead.save();

      return successResponse({ lead }, 'Pipeline stage updated');
    }

    if (action === 'CREATE_CAMPAIGN') {
      const { campaignTitle, seasonOrTheme, targetAudience, budgetPKR } = body;
      const title = String(campaignTitle || '').trim();
      const budget = Number(budgetPKR ?? 0);
      if (!title || !Number.isFinite(budget) || budget < 0) {
        return errorResponse('Campaign title and a non-negative valid budget are required', 400);
      }
      const campaign = await MarketingCampaign.create({
        campaignTitle: title,
        seasonOrTheme: seasonOrTheme || '',
        targetAudience: targetAudience || '',
        budgetPKR: budget,
        status: 'Active',
      });
      return successResponse({ campaign }, 'Marketing campaign launched');
    }

    if (action === 'UPDATE_LEAD') {
      if (body.stage !== undefined && !LEAD_STAGES.includes(body.stage)) {
        return errorResponse('Select a valid CRM pipeline stage', 400);
      }
      const lead = await CRMLead.findByIdForUpdate(body.leadId);
      if (!lead) return errorResponse('Lead not found', 404);
      const updates = pickFields(body, [
        'contactPerson', 'companyName', 'phone', 'email', 'channel', 'stage',
        'estimatedOrderValuePKR', 'assignedSalesOfficer', 'nextFollowUpDate', 'lastDiscussionSummary',
      ]);
      for (const field of ['contactPerson', 'phone']) {
        if (updates[field] !== undefined) updates[field] = String(updates[field]).trim();
        if (updates[field] !== undefined && !updates[field]) {
          return errorResponse('Lead contact and phone cannot be empty', 400);
        }
      }
      if (updates.estimatedOrderValuePKR !== undefined) {
        const amount = Number(updates.estimatedOrderValuePKR);
        if (!Number.isFinite(amount) || amount < 0) {
          return errorResponse('Estimated order value must be a non-negative valid amount', 400);
        }
        updates.estimatedOrderValuePKR = amount;
      }
      Object.assign(lead, updates);
      await lead.save();
      return successResponse({ lead }, 'Lead updated');
    }

    if (action === 'DELETE_LEAD') {
      const lead = await CRMLead.findById(body.leadId);
      if (!lead) return errorResponse('Lead not found', 404);
      if (lead.stage === 'WonOrder') {
        return errorResponse('A converted CRM lead cannot be deleted', 409);
      }
      await CRMLead.deleteOne({ _id: lead._id });
      return successResponse({ lead }, 'Lead deleted');
    }

    if (action === 'UPDATE_CAMPAIGN') {
      const campaign = await MarketingCampaign.findByIdForUpdate(body.campaignId);
      if (!campaign) return errorResponse('Campaign not found', 404);
      const updates = pickFields(body, [
        'campaignTitle', 'seasonOrTheme', 'targetAudience', 'budgetPKR', 'status',
      ]);
      if (updates.campaignTitle !== undefined) updates.campaignTitle = String(updates.campaignTitle).trim();
      if (updates.campaignTitle !== undefined && !updates.campaignTitle) {
        return errorResponse('Campaign title cannot be empty', 400);
      }
      if (updates.budgetPKR !== undefined) {
        const budget = Number(updates.budgetPKR);
        if (!Number.isFinite(budget) || budget < 0) {
          return errorResponse('Campaign budget must be a non-negative valid amount', 400);
        }
        updates.budgetPKR = budget;
      }
      Object.assign(campaign, updates);
      await campaign.save();
      return successResponse({ campaign }, 'Campaign updated');
    }

    if (action === 'DELETE_CAMPAIGN') {
      const campaign = await deleteRecord(MarketingCampaign, body.campaignId);
      if (!campaign) return errorResponse('Campaign not found', 404);
      return successResponse({ campaign }, 'Campaign deleted');
    }

    if (action === 'CONVERT_LEAD_TO_CUSTOMER') {
      const { leadId, customerName, phone, email, billingAddress, salesRepresentative } = body;
      const lead = await CRMLead.findByIdForUpdate(leadId);
      if (!lead) return errorResponse('Lead not found', 404);
      if (lead.stage !== 'WonOrder') {
        return errorResponse('Only a lead at the WonOrder stage can be converted to a customer', 400);
      }
      if (lead.convertedToCustomerId) {
        return errorResponse('This lead has already been converted to a customer', 409);
      }
      const name = String(customerName || lead.companyName || lead.contactPerson || '').trim();
      const contactPhone = String(phone || lead.phone || '').trim();
      if (!name || !contactPhone) {
        return errorResponse('Customer name and phone are required for conversion', 400);
      }
      // Duplicate customer check: same name + phone
      const existing = await Customer.findOne({ customerName: name, phone: contactPhone });
      if (existing) {
        return errorResponse(`A customer named "${name}" with this phone number already exists (${existing.customerCode})`, 409);
      }
      const sequence = await allocateSequence('customer');
      const customerCode = `CUST-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const customer = await Customer.create({
        customerCode,
        customerName: name,
        phone: contactPhone,
        email: String(email || lead.email || '').trim(),
        billingAddress: String(billingAddress || '').trim(),
        salesRepresentative: String(salesRepresentative || lead.assignedSalesOfficer || '').trim(),
        leadSource: lead.channel || '',
        leadCode: lead.leadCode,
        isActive: true,
      });
      // Mark lead as converted
      lead.convertedToCustomerId = customer._id;
      await lead.save();
      await AuditLog.create({
        userName: String(body.postedBy || ''),
        action: 'CONVERT',
        module: 'CRM',
        recordId: lead.leadCode,
        description: `Converted lead ${lead.leadCode} to customer ${customerCode} (${name})`,
      });
      return successResponse({ customer, lead }, 'Lead converted to customer', 201);
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getCrm, 'crm');
export const POST = withAuthorization(postCrm, 'crm', 'write');
