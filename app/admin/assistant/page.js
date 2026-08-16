import AdminAssistantConsole from "@/components/AdminAssistantConsole";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import { getAdminSessionState } from "@/libs/admin-auth";
import { serializeAssistantEntry } from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import AssistantEntry from "@/models/AssistantEntry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminAssistantPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to use the operations assistant.</p>
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

  await connectMongo();
  const docs = await AssistantEntry.find({}).sort({ createdAt: -1 }).limit(41);
  const hasMore = docs.length > 40;
  const page = docs.slice(0, 40);
  const initialEntries = page.map(serializeAssistantEntry);
  const voiceConfigured = Boolean(process.env.OPENAI_API_KEY);

  return (
    <main className="h-[100dvh] overflow-hidden bg-base-200 px-4 py-4 md:px-6 md:py-5">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
        <div className="flex flex-none flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Assistant</h1>
            <p className="mt-1 max-w-3xl text-sm opacity-75">
              Ask operational questions, dictate notes, and review database actions before the assistant executes them.
            </p>
          </div>
          <AdminNav active="assistant" />
        </div>

        <div className="min-h-0 flex-1">
          <AdminAssistantConsole
            initialEntries={initialEntries}
            initialHasMore={hasMore}
            initialCursor={hasMore ? page[page.length - 1]?.createdAt?.toISOString() : null}
            voiceConfigured={voiceConfigured}
            chatConfigured={Boolean(process.env.OPENAI_API_KEY)}
            mapsApiKey={process.env.GOOGLE_MAPS_BROWSER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ""}
          />
        </div>
      </div>
    </main>
  );
}
