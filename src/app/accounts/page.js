'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/accounts/expenses');
  }, [router]);

  return null;
}

