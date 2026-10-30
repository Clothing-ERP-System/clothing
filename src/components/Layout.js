'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Sync state if window resizes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-[#EEF2FF] dark:bg-[#070A12] text-[#1E293B] dark:text-[#F1F5F9] relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      {/* Sidebar (Expanded w-64 or Collapsed w-16 on desktop, modal on mobile) */}
      <Sidebar
        isExpanded={isSidebarExpanded}
        setIsExpanded={setIsSidebarExpanded}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content Area */}
      <div
        className={`flex flex-col min-h-screen erp-main-bg transition-all duration-300 ease-in-out ${
          isSidebarExpanded ? 'lg:pl-64' : 'lg:pl-16'
        }`}
      >
        {/* Decorative Background Layers */}
        <div className="erp-wave-decoration" aria-hidden="true" />
        <div className="erp-floral-dots" aria-hidden="true" />

        {/* Fixed Topbar */}
        <Header
          isSidebarExpanded={isSidebarExpanded}
          setIsSidebarExpanded={setIsSidebarExpanded}
          setIsMobileOpen={setIsMobileOpen}
        />

        {/* Main Dashboard (with compact top padding for fixed topbar, fully accessible) */}
        <main className="flex-1 px-4 sm:px-6 pb-6 sm:pb-8 pt-[4.25rem] sm:pt-[4.5rem] max-w-[1540px] w-full mx-auto relative z-[1]">
          {children}
        </main>
      </div>
    </div>
  );
}
