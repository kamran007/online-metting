"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

const GUEST_KEY = "meet:guest";

const AuthContext = createContext({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInAsGuest: () => {},
  signOut: async () => {},
  getIdToken: async () => null,
});

function newGuestId() {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Effective user = Firebase user OR a local "guest".
 * Guest mode exists for LAN/dev testing where Firebase signInWithPopup rejects
 * raw-IP origins (auth/unauthorized-domain). Guests are NOT authenticated —
 * never trust a guest identity for anything security-sensitive.
 */
export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [guest, setGuest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore a guest session if present.
    try {
      const saved = localStorage.getItem(GUEST_KEY);
      if (saved) setGuest(JSON.parse(saved));
    } catch {
      /* ignore */
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

  const signInAsGuest = (name) => {
    const trimmed = (name || "").trim() || "Guest";
    const g = {
      displayName: trimmed,
      photoURL: null,
      uid: `guest-${newGuestId()}`,
      isGuest: true,
    };
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(g));
    } catch {
      /* ignore */
    }
    setGuest(g);
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
    setGuest(null);
    if (fbUser) await fbSignOut(auth);
  };

  // Firebase ID token for the signaling/token server (null for guests).
  const getIdToken = async () => {
    try {
      return fbUser ? await fbUser.getIdToken() : null;
    } catch {
      return null;
    }
  };

  const user = fbUser || guest;

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signInAsGuest, signOut, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
