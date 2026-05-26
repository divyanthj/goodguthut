import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import GeoPerk from "@/models/GeoPerk";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminGeoPerks from "@/components/AdminGeoPerks";

export default async function AdminGeoPerksPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to manage geographic perks.</p>
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
  const geoPerkDocs = await GeoPerk.find({}).sort({
    status: 1,
    updatedAt: -1,
    createdAt: -1,
  });
  const initialGeoPerks = JSON.parse(JSON.stringify(geoPerkDocs));

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Geo Perks</h1>
            <p className="mt-2 max-w-3xl opacity-75">
              Waive delivery fees when a verified Google address matches configured area terms.
            </p>
          </div>
          <AdminNav active="geo-perks" />
        </div>

        <AdminGeoPerks initialGeoPerks={initialGeoPerks} />
      </div>
    </main>
  );
}
