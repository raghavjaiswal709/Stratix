/**
 * Next.js middleware — runs on the Edge before every request.
 * Uses the edge-safe authConfig (no MongoDB adapter) to protect all routes.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Match everything EXCEPT:
     *  - _next/static  (static assets)
     *  - _next/image   (Next.js image optimiser)
     *  - favicon.ico
     *  - public/       (public directory files)
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
