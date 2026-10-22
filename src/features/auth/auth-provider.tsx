"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { UserRole } from "@/lib/auth";
import type { Tables } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";

type Profile = Tables<"profiles">;

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const isActive = () => active;

    async function syncUser(nextUser: User | null) {
      if (!nextUser) {
        if (isActive()) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      if (isActive()) {
        setUser(nextUser);
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .eq("id", nextUser.id)
        .maybeSingle();

      if (isActive()) {
        setProfile(error ? null : data);
        setLoading(false);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      void syncUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void syncUser(session?.user ?? null);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    setUser(null);
    setProfile(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      signOut,
    }),
    [loading, profile, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
