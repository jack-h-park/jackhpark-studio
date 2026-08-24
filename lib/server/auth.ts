import type { NextAuthOptions, Profile } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { isAllowedAdminEmail } from "@/lib/admin/auth";

type GoogleProfile = Profile & {
  email_verified?: boolean;
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "not-configured",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "not-configured",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/admin/sign-in",
  },
  callbacks: {
    async signIn({ profile }) {
      const email = typeof profile?.email === "string" ? profile.email : null;
      const emailVerified =
        (profile as GoogleProfile | undefined)?.email_verified === true;

      return (
        emailVerified &&
        isAllowedAdminEmail(email, process.env.ADMIN_GOOGLE_EMAIL)
      );
    },
  },
};
