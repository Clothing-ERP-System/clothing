'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import ToastContainer from '@/components/Toast';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      {children}
      <ToastContainer />
    </AuthProvider>
  );
}
