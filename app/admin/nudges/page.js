import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminNudges from "@/components/AdminNudges";
import { getAdminSessionState } from "@/libs/admin-auth";
import { isDiscountCodeActive } from "@/libs/discount-codes";
import connectMongo from "@/libs/mongoose";
import { listLapsedCustomers } from "@/libs/retention-nudges";
import DiscountCode from "@/models/DiscountCode";

export default async function AdminNudgesPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to manage retention nudges.</p>
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
              <p className="text-error">Your account does not have access to this admin page.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  await connectMongo();

  const initialThresholdDays = 60;
  const [customers, discountCodes] = await Promise.all([
    listLapsedCustomers({ thresholdDays: initialThresholdDays }),
    DiscountCode.find({ status: "active" }).sort({ updatedAt: -1, createdAt: -1 }),
  ]);
  const activeDiscountCodes = discountCodes.filter((discountCode) =>
    isDiscountCodeActive(discountCode)
  );

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Nudges</h1>
            <p className="mt-2 max-w-3xl opacity-75">
              Find customers who have not ordered recently and send a reactivation discount.
            </p>
          </div>
          <AdminNav active="nudges" />
        </div>

        <AdminNudges
          initialCustomers={JSON.parse(JSON.stringify(customers))}
          discountCodes={JSON.parse(JSON.stringify(activeDiscountCodes))}
          initialThresholdDays={initialThresholdDays}
        />
      </div>
    </main>
  );
}
