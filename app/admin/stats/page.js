import AdminFinancialStats from "@/components/AdminFinancialStats";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import { getAdminSessionState } from "@/libs/admin-auth";
import { buildFinancialStats } from "@/libs/admin-financials";
import connectMongo from "@/libs/mongoose";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import Subscription from "@/models/Subscription";

export default async function AdminStatsPage({ searchParams }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to view financial stats.</p>
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
  const [preorders, orderPlans, subscriptions] = await Promise.all([
    Preorder.find({
      "payment.paidAt": { $ne: null },
      $or: [{ "payment.status": "paid" }, { "payment.amount": { $gt: 0 } }],
    })
      .select("payment currency total createdAt updatedAt")
      .lean(),
    OrderPlan.find({
      "payment.paidAt": { $ne: null },
      $or: [{ "payment.status": "paid" }, { "payment.amount": { $gt: 0 } }],
    })
      .select("payment currency total createdAt updatedAt")
      .lean(),
    Subscription.find({
      $and: [
        {
          $or: [
            { "billing.status": "authenticated" },
            { "billing.status": "active" },
            { "billing.status": "pending" },
            { "billing.status": "completed" },
          ],
        },
        {
          $or: [{ "billing.amount": { $gt: 0 } }, { total: { $gt: 0 } }],
        },
      ],
    })
      .select("billing currency total updatedAt")
      .lean(),
  ]);

  const financialStats = buildFinancialStats({
    preorders,
    orderPlans,
    subscriptions,
    period: String(searchParams?.period || "8w"),
    resolution: String(searchParams?.resolution || "week"),
  });

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Stats</h1>
            <p className="mt-2 max-w-3xl opacity-75">
              Review cash collected week on week across one-time orders and subscription billing.
            </p>
          </div>
          <AdminNav active="stats" />
        </div>

        <AdminFinancialStats {...financialStats} />
      </div>
    </main>
  );
}
