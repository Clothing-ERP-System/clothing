'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [currentBranch, setCurrentBranch] = useState('');
  const sessionVersion = useRef(0);

  const setUser = useCallback((nextUser) => {
    sessionVersion.current += 1;
    setUserState(nextUser);
    setLoading(false);
    if (nextUser) setCurrentBranch(nextUser.branch || '');
  }, []);

  useEffect(() => {
    let active = true;
    const requestVersion = sessionVersion.current;
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (active && requestVersion === sessionVersion.current) {
            const sessionUser = data?.data?.user || null;
            setUserState(sessionUser);
            setCurrentBranch(sessionUser?.branch || '');
          }
        } else if (active && requestVersion === sessionVersion.current) {
          setUserState(null);
        }
      } catch (err) {
        console.error('Session check failed:', err);
        if (active && requestVersion === sessionVersion.current) setUserState(null);
      } finally {
        if (active && requestVersion === sessionVersion.current) setLoading(false);
      }
    }
    void loadUser();
    return () => { active = false; };
  }, []);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      setUser(null);
      router.replace('/login');
    } catch (e) {
      addToast(e.message || 'Unable to sign out. Please try again.', 'error');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        currentBranch,
        setCurrentBranch,
        addToast,
        toasts,
        removeToast,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
