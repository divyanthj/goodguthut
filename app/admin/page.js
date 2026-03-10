"use client";

import { signIn, useSession } from "next-auth/react";

export default function AdminPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </main>
    );
  }

  if (session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body">
              <h1 className="card-title text-3xl">Admin access enabled</h1>
              <p>You are signed in as {session.user.email}.</p>
              <p className="opacity-70">Admin controls for opening preorder windows and managing SKU pricing will be added next.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="hero min-h-screen bg-base-200">
      <div className="hero-content w-full max-w-2xl">
        <div className="card w-full bg-base-100 shadow-xl">
          <div className="card-body gap-6">
            <h1 className="card-title text-3xl">Admin login</h1>
            <p>Sign in with Google to access the admin area.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => signIn("google", { callbackUrl: "/admin" })}
            >
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
