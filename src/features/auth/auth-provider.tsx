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

import { isStaffRoute, ROLE_DASHBOARDS, type UserRole } from "@/lib/auth";
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
    let revision = 0;
    let currentUser: User | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let watchedId: string | null = null;
    let previousProfile: Profile | null = null;

    async function syncUser(nextUser: User | null) {
      if (!active) return;
      const version = ++revision;
      currentUser = nextUser;
      if (watchedId !== (nextUser?.id ?? null)) {
        if (channel) void supabase.removeChannel(channel);
        watchedId = nextUser?.id ?? null;
        channel = nextUser ? supabase.channel(`staff-profile-${nextUser.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${nextUser.id}` }, () => { if (active && watchedId === nextUser.id) void syncUser(nextUser); }).subscribe() : null;
      }
      if (!nextUser) {
        previousProfile = null;
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
        .select("id, full_name, role, is_active, created_at")
        .eq("id", nextUser.id)
        .maybeSingle();

      if (isActive() && version === revision) {
        setProfile(error ? null : data);
        setLoading(false);
        if (data && !data.is_active && isStaffRoute(window.location.pathname)) router.replace("/unauthorized");
        else if (data?.is_active && previousProfile && (previousProfile.role !== data.role || !previousProfile.is_active)) {
          router.replace(ROLE_DASHBOARDS[data.role]);
          router.refresh();
        }
        previousProfile = error ? null : data;
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
    const refreshProfile = () => { if (active && currentUser && document.visibilityState === "visible") void syncUser(currentUser); };
    const timer = window.setInterval(refreshProfile, 30000);
    window.addEventListener("focus", refreshProfile);
    document.addEventListener("visibilitychange", refreshProfile);

    return () => {
      active = false;
      revision++;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshProfile);
      document.removeEventListener("visibilitychange", refreshProfile);
      if (channel) void supabase.removeChannel(channel);
      subscription.unsubscribe();
    };
  }, [router]);

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
      role: profile?.is_active ? profile.role : null,
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
