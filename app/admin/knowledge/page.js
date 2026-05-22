import AdminKnowledgeConsole from "@/components/AdminKnowledgeConsole";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  isCollatoKnowledgeConfigured,
  listCollatoKnowledgeSources,
} from "@/libs/collato-knowledge";

export default async function AdminKnowledgePage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to access the knowledge store.</p>
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

  const configured = isCollatoKnowledgeConfigured();
  const sourcePayload = configured
    ? await listCollatoKnowledgeSources().catch((error) => ({
        sources: [],
        error: error.message,
      }))
    : { sources: [] };

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Knowledge</h1>
            <p className="mt-2 max-w-3xl opacity-75">
              Ask questions across GGH admin data, production references, SOPs, and uploaded documents.
            </p>
          </div>
          <AdminNav active="knowledge" />
        </div>

        <AdminKnowledgeConsole
          initialSources={sourcePayload.sources || []}
          configured={configured}
        />
      </div>
    </main>
  );
}
