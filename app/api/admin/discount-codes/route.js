import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import DiscountCode from "@/models/DiscountCode";
import { normalizeDiscountCodePayload } from "@/libs/discount-codes";

const getAdminSession = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
};

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const discountCodes = await DiscountCode.find({}).sort({
    status: 1,
    expiresAt: 1,
    updatedAt: -1,
    createdAt: -1,
  });

  return NextResponse.json({ discountCodes });
}

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const payload = normalizeDiscountCodePayload(await req.json());

    if (!payload.code) {
      return NextResponse.json({ error: "Discount code is required." }, { status: 400 });
    }

    if (payload.amount <= 0) {
      return NextResponse.json({ error: "Discount percent must be greater than 0." }, { status: 400 });
    }

    if (!payload.isPerpetual && !payload.expiresAt) {
      return NextResponse.json({ error: "Choose an expiry date or mark the code perpetual." }, { status: 400 });
    }

    const existingDiscountCode = await DiscountCode.findOne({ code: payload.code });

    if (existingDiscountCode) {
      return NextResponse.json({ error: "Discount code already exists." }, { status: 400 });
    }

    const discountCode = await DiscountCode.create(payload);
    return NextResponse.json({ discountCode }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
