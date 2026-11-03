import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { authorizeUser, getAuthenticatedUser } from '@/lib/authorization.js';
import { runInTransaction } from '@/lib/db.js';
import { errorResponse, forbiddenResponse, fromError, notFoundResponse, successResponse } from '@/lib/api-response.js';
import { canAccessModule } from '@/lib/role-access.js';
import Attachment from '@/models/Attachment.js';
import DesignArticle from '@/models/Design.js';
import QualityInspection from '@/models/QualityInspection.js';
import Supplier from '@/models/Supplier.js';

const RECORD_MODELS = {
  design: DesignArticle,
  procurement: Supplier,
  quality: QualityInspection,
};
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = {
  'application/pdf': { extensions: ['.pdf'], signature: (bytes) => bytes.subarray(0, 5).toString() === '%PDF-' },
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extensions: ['.png'], signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extensions: ['.webp'], signature: (bytes) => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' },
};

export const runtime = 'nodejs';

function storageDirectory() {
  const directory = path.resolve(/*turbopackIgnore: true*/ process.env.ERP_PRIVATE_STORAGE_DIR || path.join(process.cwd(), '.private-data', 'attachments'));
  const relativeToPublic = path.relative(path.resolve(process.cwd(), 'public'), directory);
  if (relativeToPublic === '' || (relativeToPublic !== '..' && !relativeToPublic.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToPublic))) {
    throw new Error('ERP_PRIVATE_STORAGE_DIR must not point inside the public directory');
  }
  return directory;
}

function safeFileName(name) {
  return String(name || 'attachment')
    .replace(/[\u0000-\u001f\u007f/\\]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .slice(0, 180) || 'attachment';
}

function publicAttachment(record) {
  return {
    id: String(record._id),
    module: record.module,
    recordId: record.recordId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    uploadedBy: record.uploadedByName || '',
    uploadedAt: record.createdAt,
  };
}

async function loadRecord(resourceModule, recordId) {
  const model = RECORD_MODELS[resourceModule];
  if (!model || !recordId || recordId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(recordId)) return null;
  return model.findById(recordId);
}

function branchAllowed(user, record) {
  if (!user.branch || user.role === 'SuperAdmin') return true;
  const recordBranch = record.branch || record.branchName || record.outletBranch;
  return !recordBranch || String(recordBranch) === String(user.branch);
}

function privateFilePath(storageName) {
  if (!/^[0-9a-f-]{36}$/.test(storageName)) throw new Error('Invalid attachment storage reference');
  return path.join(/*turbopackIgnore: true*/ storageDirectory(), storageName);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('id');
    if (attachmentId) {
      const { user, response } = await getAuthenticatedUser();
      if (response) return response;
      const attachment = await Attachment.findById(attachmentId);
      if (!attachment) return notFoundResponse('Attachment not found');
      if (!await canAccessModule(user, attachment.module, 'view')) return forbiddenResponse();
      const record = await loadRecord(attachment.module, attachment.recordId);
      if (!record) return notFoundResponse('The attached business record no longer exists');
      if (!branchAllowed(user, record)) return errorResponse('You do not have access to this branch record', 403);
      const bytes = await readFile(/*turbopackIgnore: true*/ privateFilePath(attachment.storageName));
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== attachment.sha256) return errorResponse('Stored attachment integrity check failed', 503);
      const encodedName = encodeURIComponent(safeFileName(attachment.fileName));
      return new NextResponse(bytes, {
        headers: {
          'Content-Type': attachment.mimeType,
          'Content-Length': String(bytes.length),
          'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodedName}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }

    const resourceModule = searchParams.get('module');
    const recordId = searchParams.get('recordId');
    if (!RECORD_MODELS[resourceModule] || !recordId) return errorResponse('A supported module and record ID are required', 400);
    const { user, response } = await authorizeUser(resourceModule, 'view');
    if (response) return response;
    const record = await loadRecord(resourceModule, recordId);
    if (!record) return notFoundResponse('Business record not found');
    if (!branchAllowed(user, record)) return errorResponse('You do not have access to this branch record', 403);
    const attachments = await Attachment.find({ module: resourceModule, recordId });
    return successResponse({ attachments: attachments.map(publicAttachment) });
  } catch (error) {
    console.error('Attachment retrieval failed:', error);
    return fromError(error, 503);
  }
}

export async function POST(request) {
  let filePath;
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_FILE_BYTES + 64 * 1024) return errorResponse('File exceeds the 10 MB limit', 413);
    const resourceModule = new URL(request.url).searchParams.get('module') || '';
    if (!RECORD_MODELS[resourceModule]) return errorResponse('A supported module is required', 400);
    const { user, response } = await authorizeUser(resourceModule, 'edit');
    if (response) return response;
    const formData = await request.formData();
    const recordId = String(formData.get('recordId') || '');
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return errorResponse('A supported module, record ID, and file are required', 400);
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) return errorResponse('File must be between 1 byte and 10 MB', 413);
    const record = await loadRecord(resourceModule, recordId);
    if (!record) return notFoundResponse('Business record not found');
    if (!branchAllowed(user, record)) return errorResponse('You do not have access to this branch record', 403);

    const type = FILE_TYPES[file.type];
    if (!type) return errorResponse('Only PDF, JPEG, PNG, and WebP files are allowed', 415);
    if (!type.extensions.includes(path.extname(safeFileName(file.name)).toLowerCase())) {
      return errorResponse('File extension does not match the allowed media type', 415);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== file.size || !type.signature(bytes)) return errorResponse('File content does not match an allowed file type', 415);

    const storageName = randomUUID();
    filePath = privateFilePath(storageName);
    await mkdir(/*turbopackIgnore: true*/ storageDirectory(), { recursive: true, mode: 0o700 });
    await writeFile(/*turbopackIgnore: true*/ filePath, bytes, { flag: 'wx', mode: 0o600 });
    const metadata = await runInTransaction(() => Attachment.create({
      module: resourceModule,
      recordId,
      fileName: safeFileName(file.name),
      mimeType: file.type,
      sizeBytes: bytes.length,
      storageName,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      uploadedBy: String(user._id),
      uploadedByName: user.name || '',
    }));
    return successResponse({ attachment: publicAttachment(metadata) }, 'Attachment uploaded', 201);
  } catch (error) {
    if (filePath) {
      try {
        await unlink(/*turbopackIgnore: true*/ filePath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') console.error('Failed to remove an unregistered attachment file:', cleanupError);
      }
    }
    console.error('Attachment upload failed:', error);
    return fromError(error, 503);
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { user, response } = await getAuthenticatedUser();
    if (response) return response;
    const attachment = await Attachment.findById(String(body.attachmentId || ''));
    if (!attachment) return notFoundResponse('Attachment not found');
    if (!await canAccessModule(user, attachment.module, 'delete')) return forbiddenResponse();
    const record = await loadRecord(attachment.module, attachment.recordId);
    if (!record) return notFoundResponse('The attached business record no longer exists');
    if (!branchAllowed(user, record)) return errorResponse('You do not have access to this branch record', 403);

    const storedPath = privateFilePath(attachment.storageName);
    const removed = await runInTransaction(async () => {
      const locked = await Attachment.findByIdForUpdate(attachment._id);
      if (!locked) return false;
      await Attachment.deleteOne({ _id: locked._id });
      return true;
    });
    if (!removed) return notFoundResponse('Attachment not found');
    try {
      await unlink(/*turbopackIgnore: true*/ storedPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Attachment metadata was removed but its private file could not be deleted:', error);
        return errorResponse('Attachment access was revoked, but private file cleanup failed. Contact an administrator.', 503);
      }
    }
    return successResponse({}, 'Attachment deleted');
  } catch (error) {
    console.error('Attachment deletion failed:', error);
    return fromError(error, 503);
  }
}
