import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import DiscountCode from "@/models/DiscountCode";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminDiscountCodes from "@/components/AdminDiscountCodes";

export default async function AdminDiscountCodesPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to access the admin area.</p>
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
              <h1 className="card-title text-3xl">Admin access denied</h1>
              <p>You are signed in as {session.user.email}.</p>
              <p className="text-error">No, you&apos;re not an admin.</p>
              <p className="opacity-70">Add this email address to the <code>ADMINS</code> env variable to grant access.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  await connectMongo();
  const discountCodeDocs = await DiscountCode.find({}).sort({
    status: 1,
    expiresAt: 1,
    updatedAt: -1,
    createdAt: -1,
  });
  const initialDiscountCodes = JSON.parse(JSON.stringify(discountCodeDocs));

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Admin discount codes</h1>
            <p className="mt-2 max-w-3xl opacity-75">
              Create flat percentage discounts that apply only to order subtotals, not delivery charges.
            </p>
          </div>
          <AdminNav active="discounts" />
        </div>

        <AdminDiscountCodes initialDiscountCodes={initialDiscountCodes} />
      </div>
    </main>
  );
}
