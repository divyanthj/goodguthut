import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  findCustomerFromOrders,
  generateCustomerNudgeSuggestions,
  recordCustomerNudge,
  sendCustomerNudgeEmail,
  serializeCustomerNudge,
} from "@/libs/customer-nudges";
import connectMongo from "@/libs/mongoose";

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

export async function POST(req) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "You do not have access to customer nudges." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = cleanText(body.action, 40);
    const customerKey = cleanText(body.customerKey, 180);

    if (!customerKey) {
      return NextResponse.json({ error: "Choose a customer first." }, { status: 400 });
    }

    await connectMongo();
    const customer = await findCustomerFromOrders(customerKey);

    if (!customer) {
      return NextResponse.json(
        { error: "We could not find this customer in order history." },
        { status: 404 }
      );
    }

    if (action === "analyze") {
      const result = await generateCustomerNudgeSuggestions(customer);
      return NextResponse.json({
        summary: result.summary,
        suggestions: result.suggestions,
        history: customer.nudgeHistory,
      });
    }

    const message = cleanText(body.message, 4000);
    const subject = cleanText(body.subject, 180);
    const title = cleanText(body.title, 120);
    const nudgeType = cleanText(body.nudgeType, 80) || "personal";

    if (!message) {
      return NextResponse.json({ error: "Add a message before continuing." }, { status: 400 });
    }

    if (action === "send_email") {
      if (!subject) {
        return NextResponse.json({ error: "Add an email subject before sending." }, { status: 400 });
      }

      try {
        await sendCustomerNudgeEmail({ customer, subject, message });
        const nudge = await recordCustomerNudge({
          customer,
          channel: "email",
          nudgeType,
          title,
          subject,
          message,
          status: "sent",
          createdBy: session.user.email,
        });
        return NextResponse.json({ nudge: serializeCustomerNudge(nudge) });
      } catch (error) {
        await recordCustomerNudge({
          customer,
          channel: "email",
          nudgeType,
          title,
          subject,
          message,
          status: "failed",
          error: error.message || "Email delivery failed.",
          createdBy: session.user.email,
        });
        throw error;
      }
    }

    if (action === "record_whatsapp") {
      if (!customer.phone) {
        return NextResponse.json(
          { error: "This customer does not have a phone number." },
          { status: 400 }
        );
      }

      const nudge = await recordCustomerNudge({
        customer,
        channel: "whatsapp",
        nudgeType,
        title,
        subject: "",
        message,
        status: "copied_and_opened",
        createdBy: session.user.email,
      });
      return NextResponse.json({ nudge: serializeCustomerNudge(nudge) });
    }

    return NextResponse.json({ error: "That nudge action is not supported." }, { status: 400 });
  } catch (error) {
    console.error("Customer nudge error", error);
    return NextResponse.json(
      { error: error.message || "We could not complete this nudge. Please try again." },
      { status: 500 }
    );
  }
}
