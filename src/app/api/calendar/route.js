import { connectDB, runInTransaction } from '@/lib/db.js';
import CalendarEvent from '@/models/CalendarEvent.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { withAuthorization } from '@/lib/authorization.js';
import { randomUUID } from 'node:crypto';

async function getCalendarEvents(request, user) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const events = await CalendarEvent.find({});
    let filtered = events.filter((e) => e.userId === user.id);

    if (start) {
      const startDate = new Date(start);
      filtered = filtered.filter((e) => {
        const eEnd = new Date(e.endDate || e.startDate);
        return eEnd >= startDate;
      });
    }
    if (end) {
      const endDate = new Date(end);
      filtered = filtered.filter((e) => {
        const eStart = new Date(e.startDate);
        return eStart <= endDate;
      });
    }

    filtered.sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));

    return successResponse({
      events: filtered.map((e) => ({
        id: e._id,
        title: e.title || '',
        description: e.description || '',
        startDate: e.startDate || '',
        endDate: e.endDate || '',
        startTime: e.startTime || '',
        endTime: e.endTime || '',
        eventType: e.eventType || 'appointment',
        userId: e.userId,
        userName: e.userName || '',
        createdAt: e.createdAt || '',
        updatedAt: e.updatedAt || '',
      })),
    }, 'Calendar events fetched successfully');
  } catch (error) {
    return fromError(error);
  }
}

async function createCalendarEvent(request, user) {
  try {
    await connectDB();
    const body = await request.json();
    const { title, description, startDate, endDate, startTime, endTime, eventType } = body;

    if (!title || String(title).trim().length === 0) {
      return errorResponse('Event title is required', 400);
    }
    if (!startDate) {
      return errorResponse('Start date is required', 400);
    }

    const event = await CalendarEvent.create({
      title: String(title).trim(),
      description: String(description || '').trim(),
      startDate,
      endDate: endDate || startDate,
      startTime: startTime || '',
      endTime: endTime || '',
      eventType: eventType || 'appointment',
      userId: user.id,
      userName: user.name || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return successResponse({
      event: {
        id: event._id,
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        eventType: event.eventType,
        userId: event.userId,
        userName: event.userName,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
    }, 'Calendar event created successfully');
  } catch (error) {
    return fromError(error);
  }
}

async function updateCalendarEvent(request, user) {
  try {
    await connectDB();
    const body = await request.json();
    const { id, title, description, startDate, endDate, startTime, endTime, eventType } = body;

    if (!id) return errorResponse('Event ID is required', 400);

    const event = await CalendarEvent.findByIdForUpdate(id);
    if (!event) return errorResponse('Event not found', 404);
    if (event.userId !== user.id) return errorResponse('You do not own this event', 403);

    const updates = {};
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description || '').trim();
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (startTime !== undefined) updates.startTime = startTime || '';
    if (endTime !== undefined) updates.endTime = endTime || '';
    if (eventType !== undefined) updates.eventType = eventType;
    updates.updatedAt = new Date();

    Object.assign(event, updates);
    const saved = await event.save();

    return successResponse({
      event: {
        id: saved._id,
        title: saved.title,
        description: saved.description,
        startDate: saved.startDate,
        endDate: saved.endDate,
        startTime: saved.startTime,
        endTime: saved.endTime,
        eventType: saved.eventType,
        userId: saved.userId,
        userName: saved.userName,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    }, 'Calendar event updated successfully');
  } catch (error) {
    return fromError(error);
  }
}

async function deleteCalendarEvent(request, user) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return errorResponse('Event ID is required', 400);

    const event = await CalendarEvent.findByIdForUpdate(id);
    if (!event) return errorResponse('Event not found', 404);
    if (event.userId !== user.id) return errorResponse('You do not own this event', 403);

    await CalendarEvent.deleteOne({ _id: id });

    return successResponse({ id }, 'Calendar event deleted successfully');
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getCalendarEvents, 'dashboard', 'read');

export const POST = withAuthorization(async (request, user) => {
  return await runInTransaction(() => createCalendarEvent(request, user));
}, 'dashboard', 'write');

export const PATCH = withAuthorization(async (request, user) => {
  return await runInTransaction(() => updateCalendarEvent(request, user));
}, 'dashboard', 'write');

export const DELETE = withAuthorization(deleteCalendarEvent, 'dashboard', 'write');
