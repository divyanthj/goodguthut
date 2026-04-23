import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminProductionConsole from "@/components/AdminProductionConsole";
import { getAdminSessionState } from "@/libs/admin-auth";

export default async function AdminProductionPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to access production planning.</p>
              <AdminLoginButton />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-4">
              <h1 className="card-title text-3xl">Access restricted</h1>
              <p>You are signed in as {session.user.email}.</p>
              <p className="text-error">This account does not have admin access.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Production</h1>
            <p className="mt-2 opacity-75">
              Convert weekly bottle demand into ingredient sheets and manage recipe formulas.
            </p>
          </div>
          <AdminNav active="production" />
        </div>

        <AdminProductionConsole />
      </div>
    </main>
  );
}
