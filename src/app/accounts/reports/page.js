'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountsReportsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/accounts/reports/transactions');
  }, [router]);

  return null;
}

