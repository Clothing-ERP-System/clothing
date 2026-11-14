import { connectDB, runInTransaction } from '@/lib/db.js';
import Todo from '@/models/Todo.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { withAuthorization } from '@/lib/authorization.js';
import { randomUUID } from 'node:crypto';

async function getTodos(request, user) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';

    const todos = await Todo.find({});
    let filtered = todos.filter((t) => {
      if (t.userId !== user.id) return false;
      if (status === 'pending') return t.status !== 'completed';
      if (status === 'completed') return t.status === 'completed';
      return true;
    });

    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return successResponse({
      todos: filtered.map((t) => ({
        id: t._id,
        title: t.title || '',
        description: t.description || '',
        status: t.status || 'pending',
        dueDate: t.dueDate || '',
        userId: t.userId,
        userName: t.userName || '',
        createdAt: t.createdAt || '',
        updatedAt: t.updatedAt || '',
      })),
    }, 'Todos fetched successfully');
  } catch (error) {
    return fromError(error);
  }
}

async function createTodo(request, user) {
  try {
    await connectDB();
    const body = await request.json();
    const { title, description, dueDate } = body;

    if (!title || String(title).trim().length === 0) {
      return errorResponse('Task title is required', 400);
    }

    const todo = await Todo.create({
      title: String(title).trim(),
      description: String(description || '').trim(),
      status: 'pending',
      userId: user.id,
      userName: user.name || '',
      dueDate: dueDate || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return successResponse({
      todo: {
        id: todo._id,
        title: todo.title,
        description: todo.description,
        status: todo.status,
        dueDate: todo.dueDate,
        userId: todo.userId,
        userName: todo.userName,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      },
    }, 'Task created successfully');
  } catch (error) {
    return fromError(error);
  }
}

async function updateTodo(request, user) {
  try {
    await connectDB();
    const body = await request.json();
    const { id, status, title, description, dueDate } = body;

    if (!id) return errorResponse('Task ID is required', 400);

    const todo = await Todo.findByIdForUpdate(id);
    if (!todo) return errorResponse('Task not found', 404);
    if (todo.userId !== user.id) return errorResponse('You do not own this task', 403);

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description || '').trim();
    if (dueDate !== undefined) updates.dueDate = dueDate || '';
    updates.updatedAt = new Date();

    Object.assign(todo, updates);
    const saved = await todo.save();

    return successResponse({
      todo: {
        id: saved._id,
        title: saved.title,
        description: saved.description,
        status: saved.status,
        dueDate: saved.dueDate,
        userId: saved.userId,
        userName: saved.userName,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    }, 'Task updated successfully');
  } catch (error) {
    return fromError(error);
  }
}

async function deleteTodo(request, user) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return errorResponse('Task ID is required', 400);

    const todo = await Todo.findByIdForUpdate(id);
    if (!todo) return errorResponse('Task not found', 404);
    if (todo.userId !== user.id) return errorResponse('You do not own this task', 403);

    await Todo.deleteOne({ _id: id });

    return successResponse({ id }, 'Task deleted successfully');
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getTodos, 'dashboard', 'read');

export const POST = withAuthorization(async (request, user) => {
  return await runInTransaction(() => createTodo(request, user));
}, 'dashboard', 'write');

export const PATCH = withAuthorization(async (request, user) => {
  return await runInTransaction(() => updateTodo(request, user));
}, 'dashboard', 'write');

export const DELETE = withAuthorization(deleteTodo, 'dashboard', 'write');
