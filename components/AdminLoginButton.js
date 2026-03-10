"use client";

import { signIn } from "next-auth/react";

export default function AdminLoginButton() {
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => signIn("google", { callbackUrl: "/admin" })}
    >
      Continue with Google
    </button>
  );
}
