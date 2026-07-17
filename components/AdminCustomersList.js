"use client";

import { useMemo, useState } from "react";

const formatDate = (value, withTime = false) => {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  });
};

const formatCurrency = (currency = "INR", amount = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const normalizeWhatsAppPhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
};

const buildWhatsAppUrl = (phone, message) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
    navigator.userAgent || ""
  );
  return isMobile
    ? `whatsapp://send?phone=${normalizedPhone}&text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(message)}`;
};

const copyToClipboard = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const ChannelIcon = ({ channel }) =>
  channel === "email" ? (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6.5h18v11H3z" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z" />
      <path d="M8.5 8.5c.5 3 2 4.5 5 5" />
    </svg>
  );

export default function AdminCustomersList({ initialCustomers = [] }) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      [customer.customerName, customer.phone, customer.email]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [customers, query]);

  const totalOrders = customers.reduce((sum, customer) => sum + customer.orderCount, 0);
  const nudgedCustomers = customers.filter((customer) => customer.lastNudgedAt).length;

  const updateCustomerHistory = (customerKey, nudge) => {
    setCustomers((current) =>
      current.map((customer) =>
        customer.customerKey === customerKey
          ? {
              ...customer,
              lastNudgedAt: nudge.sentAt,
              nudgeHistory: [nudge, ...(customer.nudgeHistory || [])],
            }
          : customer
      )
    );
    setSelectedCustomer((current) =>
      current?.customerKey === customerKey
        ? {
            ...current,
            lastNudgedAt: nudge.sentAt,
            nudgeHistory: [nudge, ...(current.nudgeHistory || [])],
          }
        : current
    );
  };

  const applySuggestion = (suggestion, index) => {
    setSelectedSuggestionIndex(index);
    setSubject(suggestion.emailSubject || "");
    setMessage(suggestion.message || "");
    setNotice("");
    setError("");
  };

  const openNudge = async (customer) => {
    setSelectedCustomer(customer);
    setSuggestions([]);
    setAnalysisSummary("");
    setSelectedSuggestionIndex(0);
    setChannel(customer.email ? "email" : "whatsapp");
    setSubject("");
    setMessage("");
    setNotice("");
    setError("");
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/admin/customer-nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", customerKey: customer.customerKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We could not prepare nudge ideas.");

      const nextSuggestions = data.suggestions || [];
      setSuggestions(nextSuggestions);
      setAnalysisSummary(data.summary || "");
      if (nextSuggestions[0]) applySuggestion(nextSuggestions[0], 0);
    } catch (loadError) {
      setError(loadError.message || "We could not prepare nudge ideas.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const closeModal = () => {
    if (!isSending) setSelectedCustomer(null);
  };

  const requestPayload = (action) => {
    const suggestion = suggestions[selectedSuggestionIndex] || {};
    return {
      action,
      customerKey: selectedCustomer.customerKey,
      nudgeType: suggestion.type || "personal",
      title: suggestion.title || "Personal follow-up",
      subject,
      message,
    };
  };

  const sendEmail = async () => {
    setIsSending(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/admin/customer-nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload("send_email")),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The email could not be sent.");

      updateCustomerHistory(selectedCustomer.customerKey, data.nudge);
      setNotice(`Email sent to ${selectedCustomer.email}.`);
    } catch (sendError) {
      setError(sendError.message || "The email could not be sent.");
    } finally {
      setIsSending(false);
    }
  };

  const openWhatsApp = async () => {
    const targetWindow = window.open("", "_blank");
    setIsSending(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/admin/customer-nudges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload("record_whatsapp")),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "WhatsApp could not be opened.");

      await copyToClipboard(message);
      const whatsappUrl = buildWhatsAppUrl(selectedCustomer.phone, message);
      if (targetWindow) targetWindow.location.href = whatsappUrl;
      else window.open(whatsappUrl, "_blank", "noopener,noreferrer");

      updateCustomerHistory(selectedCustomer.customerKey, data.nudge);
      setNotice("Message copied and WhatsApp opened with it ready to send.");
    } catch (sendError) {
      targetWindow?.close();
      setError(sendError.message || "WhatsApp could not be opened.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-65">Customers from orders</div>
          <div className="mt-2 text-3xl font-bold text-primary">{customers.length}</div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-65">Orders represented</div>
          <div className="mt-2 text-3xl font-bold">{totalOrders}</div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="text-sm opacity-65">Customers nudged</div>
          <div className="mt-2 text-3xl font-bold">{nudgedCustomers}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-xl">
        <div className="flex flex-col gap-4 border-b border-base-300 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Customer directory</h2>
            <p className="mt-1 text-sm opacity-65">Built automatically from your complete order history.</p>
          </div>
          <label className="input input-bordered flex w-full items-center gap-2 sm:max-w-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              type="search"
              className="grow"
              placeholder="Search name, phone or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="font-medium">No customers found</div>
            <div className="mt-1 text-sm opacity-65">Try a different name, phone number or email.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Order story</th>
                  <th>Nudge history</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.customerKey} className="hover">
                    <td>
                      <div className="font-semibold">{customer.customerName || "Name not provided"}</div>
                      <div className="mt-1 text-xs opacity-60">Last order {formatDate(customer.lastOrderAt)}</div>
                    </td>
                    <td>
                      <div className="whitespace-nowrap">{customer.phone || "No phone"}</div>
                      <div className="mt-1 max-w-[240px] truncate text-xs opacity-65">{customer.email || "No email"}</div>
                    </td>
                    <td>
                      <div className="font-medium">{customer.orderCount} {customer.orderCount === 1 ? "order" : "orders"}</div>
                      <div className="mt-1 text-xs opacity-65">{formatCurrency(customer.currency, customer.totalSpend)} recorded</div>
                    </td>
                    <td>
                      {customer.lastNudgedAt ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="badge badge-success badge-sm">Contacted</span>
                            <span className="text-sm">{formatDate(customer.lastNudgedAt)}</span>
                          </div>
                          <div className="mt-1 text-xs opacity-60">{customer.nudgeHistory.length} in history</div>
                        </>
                      ) : (
                        <span className="text-sm opacity-55">No nudges yet</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => openNudge(customer)}>
                        Nudge
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCustomer && (
        <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="nudge-title">
          <div className="modal-box max-h-[92vh] w-11/12 max-w-5xl overflow-y-auto p-0">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-base-300 bg-base-100 px-6 py-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Thoughtful follow-up</div>
                <h2 id="nudge-title" className="mt-1 text-2xl font-bold">
                  Nudge {selectedCustomer.customerName || "this customer"}
                </h2>
                <p className="mt-1 text-sm opacity-65">
                  {selectedCustomer.orderCount} {selectedCustomer.orderCount === 1 ? "order" : "orders"} · Last ordered {formatDate(selectedCustomer.lastOrderAt)}
                </p>
              </div>
              <button type="button" className="btn btn-circle btn-ghost btn-sm" onClick={closeModal} aria-label="Close nudge window">✕</button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
              <div className="space-y-5">
                {isAnalyzing ? (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center">
                    <span className="loading loading-spinner loading-lg text-primary" />
                    <div className="mt-4 font-semibold">Reading the order story</div>
                    <p className="mt-1 max-w-sm text-sm opacity-65">Preparing a few relevant, ready-to-edit ways to reconnect.</p>
                  </div>
                ) : error && suggestions.length === 0 ? (
                  <div className="alert alert-error"><span>{error}</span></div>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">Suggested approaches</h3>
                        <span className="badge badge-outline">3 options</span>
                      </div>
                      {analysisSummary && <p className="mt-2 text-sm leading-relaxed opacity-70">{analysisSummary}</p>}
                      <div className="mt-3 grid gap-3">
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={`${suggestion.type}-${index}`}
                            type="button"
                            className={`rounded-2xl border p-4 text-left transition ${selectedSuggestionIndex === index ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-base-300 hover:border-primary/50"}`}
                            onClick={() => applySuggestion(suggestion, index)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-semibold">{suggestion.title}</div>
                              <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border-4 ${selectedSuggestionIndex === index ? "border-primary bg-base-100" : "border-base-300"}`} />
                            </div>
                            <p className="mt-1 text-sm leading-relaxed opacity-65">{suggestion.reason}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-base-300 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">Review and personalise</h3>
                        <div className="join">
                          <button type="button" className={`btn btn-sm join-item ${channel === "email" ? "btn-primary" : "btn-ghost"}`} disabled={!selectedCustomer.email} onClick={() => setChannel("email")}>
                            <ChannelIcon channel="email" /> Email
                          </button>
                          <button type="button" className={`btn btn-sm join-item ${channel === "whatsapp" ? "btn-primary" : "btn-ghost"}`} disabled={!selectedCustomer.phone} onClick={() => setChannel("whatsapp")}>
                            <ChannelIcon channel="whatsapp" /> WhatsApp
                          </button>
                        </div>
                      </div>

                      {channel === "email" && (
                        <label className="form-control mt-4">
                          <div className="label"><span className="label-text font-medium">Email subject</span></div>
                          <input className="input input-bordered" value={subject} maxLength={180} onChange={(event) => setSubject(event.target.value)} />
                        </label>
                      )}
                      <label className="form-control mt-3">
                        <div className="label">
                          <span className="label-text font-medium">Message</span>
                          <span className="label-text-alt">Edit anything before sending</span>
                        </div>
                        <textarea className="textarea textarea-bordered min-h-44 leading-relaxed" value={message} maxLength={4000} onChange={(event) => setMessage(event.target.value)} />
                      </label>

                      <div className="mt-4 rounded-xl bg-base-200 px-4 py-3 text-xs leading-relaxed opacity-75">
                        These suggestions are a starting point. Please review names, details and tone before contacting the customer.
                      </div>
                    </div>

                    {notice && <div className="alert alert-success"><span>{notice}</span></div>}
                    {error && <div className="alert alert-error"><span>{error}</span></div>}

                    <button
                      type="button"
                      className={`btn w-full ${channel === "whatsapp" ? "bg-[#1f7a54] text-white hover:bg-[#185f42]" : "btn-primary"}`}
                      disabled={isSending || !message.trim() || (channel === "email" && !subject.trim())}
                      onClick={channel === "email" ? sendEmail : openWhatsApp}
                    >
                      {isSending ? <span className="loading loading-spinner loading-sm" /> : <ChannelIcon channel={channel} />}
                      {isSending ? "Working on it..." : channel === "email" ? "Send email" : "Copy message and open WhatsApp"}
                    </button>
                  </>
                )}
              </div>

              <aside className="space-y-5">
                <div className="rounded-2xl bg-[#2f4a3e] p-5 text-[#f8f3e7]">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">Contact details</div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div><div className="text-xs opacity-60">Phone</div><div className="mt-0.5 break-all">{selectedCustomer.phone || "Not provided"}</div></div>
                    <div><div className="text-xs opacity-60">Email</div><div className="mt-0.5 break-all">{selectedCustomer.email || "Not provided"}</div></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Nudge history</h3>
                    <span className="badge badge-ghost">{selectedCustomer.nudgeHistory?.length || 0}</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedCustomer.nudgeHistory?.length ? (
                      selectedCustomer.nudgeHistory.map((entry) => (
                        <div key={entry.id} className="rounded-xl border border-base-300 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-medium capitalize"><ChannelIcon channel={entry.channel} /> {entry.channel}</div>
                            <span className={`badge badge-sm ${entry.status === "failed" ? "badge-error" : "badge-success"}`}>{entry.status === "copied_and_opened" ? "Opened" : entry.status}</span>
                          </div>
                          <div className="mt-2 text-xs opacity-60">{formatDate(entry.sentAt, true)}</div>
                          <div className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-relaxed opacity-75">{entry.message}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-base-300 p-4 text-sm opacity-60">No customer nudges have been recorded yet.</div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
          <button type="button" className="modal-backdrop" onClick={closeModal} aria-label="Close nudge window" />
        </div>
      )}
    </div>
  );
}
