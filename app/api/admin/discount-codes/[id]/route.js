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

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const discountCode = await DiscountCode.findById(params.id);

  if (!discountCode) {
    return NextResponse.json({ error: "Discount code not found." }, { status: 404 });
  }

  return NextResponse.json({ discountCode });
}

export async function PUT(req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const payload = normalizeDiscountCodePayload(await req.json());

    if (payload.amount <= 0) {
      return NextResponse.json({ error: "Discount percent must be greater than 0." }, { status: 400 });
    }

    if (!payload.isPerpetual && !payload.expiresAt) {
      return NextResponse.json({ error: "Choose an expiry date or mark the code perpetual." }, { status: 400 });
    }

    delete payload.code;

    const discountCode = await DiscountCode.findByIdAndUpdate(params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!discountCode) {
      return NextResponse.json({ error: "Discount code not found." }, { status: 404 });
    }

    return NextResponse.json({ discountCode });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  return PUT(req, { params });
}
