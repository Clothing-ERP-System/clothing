import { NextResponse } from 'next/server';

export function successResponse(data = {}, message = 'Success', status = 200) {
  return NextResponse.json({
    success: true,
    message,
    data,
  }, { status });
}

export function errorResponse(message = 'An unexpected error occurred', status = 400, errors = null) {
  return NextResponse.json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  }, { status });
}

export function unauthorizedResponse(message = 'Authentication required') {
  return errorResponse(message, 401);
}

export function forbiddenResponse(message = 'You do not have permission to perform this action') {
  return errorResponse(message, 403);
}

export function notFoundResponse(message = 'Requested resource not found') {
  return errorResponse(message, 404);
}
