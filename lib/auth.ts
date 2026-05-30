import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import { authConfig } from "./auth.config";
import clientPromise from "./mongodb-client";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  adapter: MongoDBAdapter(clientPromise),
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "user";
        token.roleRefreshedAt = Date.now();
      }
      // If roleRefreshedAt is missing, this token predates the role system —
      // re-fetch the latest role from DB so the user doesn't need to sign out.
      if (token.id && !token.roleRefreshedAt) {
        try {
          const client = await clientPromise;
          const db = client.db();
          const dbUser = await db
            .collection("users")
            .findOne(
              { _id: new ObjectId(token.id as string) },
              { projection: { role: 1 } }
            );
          token.role = (dbUser?.role as string | undefined) ?? "user";
          token.roleRefreshedAt = Date.now();
        } catch {
          token.role = (token.role as string | undefined) ?? "user";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string | undefined) ?? "user";
      }
      return session;
    },
  },
});
