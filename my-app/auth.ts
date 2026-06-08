import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import pool from "@/lib/db";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const result = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [credentials?.email]
        );
        const user = result.rows[0];
        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials?.password as string,
          user.password
        );
        if (!isValid) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
});