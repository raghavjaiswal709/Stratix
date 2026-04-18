import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Edge-safe auth config — no Node.js-only imports (e.g. MongoDB adapter).
 * Used by proxy.ts to gate routes without running the full auth stack.
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Always allow: NextAuth API routes and the sign-in page itself
      if (pathname.startsWith("/api/auth") || pathname.startsWith("/auth")) {
        return true;
      }

      // Authenticated users pass through
      if (isLoggedIn) return true;

      // Return an explicit redirect to the clean sign-in URL.
      // Returning `false` here would make NextAuth append ?callbackUrl=...
      // which creates URLs that Google OAuth rejects.
      const signInUrl = new URL("/auth/signin", request.url);
      return NextResponse.redirect(signInUrl);
    },
  },
  providers: [], // Filled in by lib/auth.ts; empty here for edge compatibility
};
