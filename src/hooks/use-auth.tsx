"use client";

import { useRouter } from "next/navigation";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { type User } from "@/lib/types";
import { getMenteeRedirectPath } from "@/lib/utils";

interface AuthContextType {
  user: User | null;
  login: (name: string) => Promise<User>;
  loginMentor: (email: string) => Promise<User>;
  loginMentee: (email: string) => Promise<User>;
  signup: (name: string, email: string) => Promise<User>;
  logout: () => void;
  setVerificationStatus: (status: User["verificationStatus"]) => void;
  acknowledgeVerification: () => void;
  refreshUser: () => Promise<void>;
  isAuthLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// In-memory cache for users to avoid repeated DB calls for the same session.
const userCache = new Map<string, User>();

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  // ...existing code...
  // Place redirect useEffect after user and isAuthLoading are declared
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

   // Synchronize with Firebase Auth
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    import("@/lib/firebase").then(({ auth }) => {
      unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
        if (!firebaseUser || !firebaseUser.email) {
          userCache.clear();
          setUser(null);
          localStorage.removeItem("userId");
          setIsAuthLoading(false);
        } else {
          // Always fetch fresh user data from backend with retry logic
          const fetchUserWithRetry = async (retryCount = 0) => {
            try {
              // Get user role first
              const roleRes = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: firebaseUser.email }),
              });
              
              const roleData = await roleRes.json();
              if (roleRes.ok && roleData.role) {
                // Based on role, fetch the correct user data
                const endpoint = roleData.role === 'mentee' ? '/api/auth/mentee' : '/api/auth/mentor';
                const res = await fetch(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: firebaseUser.email }),
                });
                
                if (res.ok) {
                  const foundUser = await res.json();
                  foundUser.role = roleData.role; // Ensure role is set
                  userCache.set(foundUser.id, foundUser);
                  setUser(foundUser);
                  localStorage.setItem("userId", foundUser.id);
                  console.log("User set with role:", foundUser.role);
                  setIsAuthLoading(false);
                } else {
                  // User not found in database, retry if it's likely a new user
                  if (retryCount < 3) {
                    console.log(`User not found, retrying in 2 seconds... (attempt ${retryCount + 1}/3)`);
                    setTimeout(() => fetchUserWithRetry(retryCount + 1), 2000);
                  } else {
                    console.log("User not found after retries, setting user to null");
                    setUser(null);
                    localStorage.removeItem("userId");
                    setIsAuthLoading(false);
                  }
                }
              } else {
                // Role not found, retry if it's likely a new user
                if (retryCount < 3) {
                  console.log(`User role not found, retrying in 2 seconds... (attempt ${retryCount + 1}/3)`);
                  setTimeout(() => fetchUserWithRetry(retryCount + 1), 2000);
                } else {
                  console.log("User role not found after retries, setting user to null");
                  setUser(null);
                  localStorage.removeItem("userId");
                  setIsAuthLoading(false);
                }
              }
            } catch (error) {
              console.error("Auth error:", error);
              if (retryCount < 3) {
                console.log(`Auth error, retrying in 2 seconds... (attempt ${retryCount + 1}/3)`);
                setTimeout(() => fetchUserWithRetry(retryCount + 1), 2000);
              } else {
                console.log("Auth error after retries, setting user to null");
                setUser(null);
                localStorage.removeItem("userId");
                setIsAuthLoading(false);
              }
            }
          };
          
          fetchUserWithRetry();
        }
      });
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = (name: string): Promise<User> => {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await fetch(`/api/users/byName/${name}`);
        if (!res.ok) {
          return reject(new Error("User not found"));
        }
        const foundUser = await res.json();
        userCache.set(foundUser.id, foundUser);
        setUser(foundUser);
        localStorage.setItem("userId", foundUser.id);
        resolve(foundUser);
      } catch (error) {
        reject(error);
      }
    });
  };

  const loginMentor = (email: string): Promise<User> => {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await fetch("/api/auth/mentor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) {
          return reject(new Error("Mentor not found"));
        }
        const foundMentor = await res.json();
        userCache.set(foundMentor.id, foundMentor);
        setUser(foundMentor);
        localStorage.setItem("userId", foundMentor.id);
        resolve(foundMentor);
      } catch (error) {
        reject(error);
      }
    });
  };

  const loginMentee = (email: string): Promise<User> => {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await fetch("/api/auth/mentee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) {
          return reject(new Error("Mentee not found"));
        }
        const foundMentee = await res.json();
        userCache.set(foundMentee.id, foundMentee);
        setUser(foundMentee);
        localStorage.setItem("userId", foundMentee.id);
        resolve(foundMentee);
      } catch (error) {
        reject(error);
      }
    });
  };

  const signup = (name: string, email: string): Promise<User> => {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email }),
        });
        if (!res.ok) {
          throw new Error("Signup failed");
        }
        const newUser = await res.json();
        userCache.set(newUser.id, newUser);
        setUser(newUser);
        localStorage.setItem("userId", newUser.id);
        resolve(newUser);
      } catch (error) {
        reject(error);
      }
    });
  };

 const logout = async () => {
    try {
      // Sign out from Firebase first
      const { auth } = await import("@/lib/firebase");
      await auth.signOut();

      // Clear all our auth states
      userCache.clear();
      setUser(null);
      localStorage.clear();

      // Clear any session cookies if they exist
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      // Reset auth loading state
      setIsAuthLoading(false);
    } catch (error) {
      console.error("Logout error:", error);
      // Even if there's an error, clear everything
      userCache.clear();
      setUser(null);
      localStorage.clear();
      setIsAuthLoading(false);
    }
  };

  const setVerificationStatus = async (status: User["verificationStatus"]) => {
    if (user) {
      // API call to update the user in the database
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: status }),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        userCache.set(updatedUser.id, updatedUser);
        setUser(updatedUser);
      }
    }
  };

  const acknowledgeVerification = () => {
    if (user && user.verificationStatus === "just-approved") {
      setVerificationStatus("approved");
    }
  };

  const refreshUser = async () => {
    const { auth } = await import('@/lib/firebase');
    const firebaseUser = auth.currentUser;
    
    if (firebaseUser?.email) {
      try {
        // Get user role first
        const roleRes = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: firebaseUser.email }),
        });
        
        const roleData = await roleRes.json();
        if (roleRes.ok && roleData.role) {
          // Based on role, fetch the correct user data
          const endpoint = roleData.role === 'mentee' ? '/api/auth/mentee' : '/api/auth/mentor';
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: firebaseUser.email }),
          });
          
          if (res.ok) {
            const foundUser = await res.json();
            foundUser.role = roleData.role;
            userCache.set(foundUser.id, foundUser);
            setUser(foundUser);
            localStorage.setItem("userId", foundUser.id);
            console.log("User refreshed with role:", foundUser.role);
          }
        }
      } catch (error) {
        console.error("Error refreshing user:", error);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginMentor,
        loginMentee,
        signup,
        logout,
        isAuthLoading,
        setVerificationStatus,
        acknowledgeVerification,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface UseRequireAuthOptions {
  verificationStatus?:
    | User["verificationStatus"]
    | User["verificationStatus"][];
}

// A client-side hook to protect routes
export function useRequireAuth(
  role?: User["role"] | User["role"][],
  options?: UseRequireAuthOptions
) {
  const { user, isAuthLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      return router.push("/login");
    }

    if (role) {
      const allowedRoles = Array.isArray(role) ? role : [role];

      if (!allowedRoles.includes(user.role)) {
        return router.push("/login");
      }
    }

    if (user.role === "mentee" && options?.verificationStatus) {
      const allowedStatuses = Array.isArray(options.verificationStatus)
        ? options.verificationStatus
        : [options.verificationStatus];

      if (!allowedStatuses.includes(user.verificationStatus)) {
        router.push(getMenteeRedirectPath(user));
      }
    }
  }, [user, isAuthLoading, router, role, options]);

  return { user, isLoading: isAuthLoading || !user };
}
