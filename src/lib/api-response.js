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

export function fromError(error, fallbackStatus = 500) {
  if (error instanceof SyntaxError) {
    return errorResponse('Request body must contain valid JSON', 400);
  }
  const status = Number(error?.status) || fallbackStatus;
  if (status >= 500) {
    console.error('API operation failed:', error);
    return errorResponse('The request could not be completed. Please try again.', status);
  }
  return errorResponse(error?.message || 'The request could not be completed', status);
}
