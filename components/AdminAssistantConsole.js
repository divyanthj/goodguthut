"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MAX_RECORDING_MS = 10 * 60 * 1000;

async function readPayload(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed.");
    error.payload = payload;
    throw error;
  }
  return payload;
}

const encodePcm16 = (samples) => {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const resampleTo24k = (samples, inputRate) => {
  if (!inputRate || inputRate === 24000) return samples;
  const ratio = inputRate / 24000;
  const output = new Float32Array(Math.max(1, Math.round(samples.length / ratio)));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((outputIndex + 1) * ratio)));
    let total = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) total += samples[inputIndex];
    output[outputIndex] = total / (end - start);
  }
  return output;
};

const formatTimer = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const dateLabel = (date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: "Asia/Kolkata" }).format(
    new Date(`${date}T12:00:00+05:30`)
  );

const currentConversationDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const sortEntries = (entries) => {
  const unique = new Map();
  entries.forEach((entry) => unique.set(entry.id, entry));
  return [...unique.values()].sort(
    (first, second) => new Date(first.createdAt) - new Date(second.createdAt)
  );
};

const CHART_COLORS = ["#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#db2777"];

let googleMapsPromise = null;

const loadGoogleMaps = (apiKey) => {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps needs a browser."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!apiKey) return Promise.reject(new Error("Google Maps is not configured."));
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps did not load."));
    script.onerror = () => reject(new Error("Google Maps could not load."));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
};

function AssistantMap({ mapData, apiKey }) {
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const markers = useMemo(
    () => Array.isArray(mapData?.markers) ? mapData.markers.filter((marker) => marker?.address) : [],
    [mapData?.markers]
  );

  useEffect(() => {
    let cancelled = false;
    if (!mapRef.current || !markers.length) return undefined;
    loadGoogleMaps(apiKey).then(async (maps) => {
      if (cancelled || !mapRef.current) return;
      const map = new maps.Map(mapRef.current, {
        center: { lat: 12.9716, lng: 77.5946 },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      const geocoder = new maps.Geocoder();
      const bounds = new maps.LatLngBounds();
      let plotted = 0;
      for (const markerData of markers) {
        if (cancelled) return;
        try {
          const response = await geocoder.geocode({ address: markerData.address });
          const location = response.results?.[0]?.geometry?.location;
          if (!location) continue;
          const marker = new maps.Marker({
            map,
            position: location,
            title: `${markerData.label} — ${markerData.address}`,
          });
          const content = document.createElement("div");
          content.style.maxWidth = "260px";
          const heading = document.createElement("strong");
          heading.textContent = markerData.label;
          content.append(heading, document.createElement("br"), document.createTextNode(markerData.address));
          const info = new maps.InfoWindow({ content });
          marker.addListener("click", () => info.open({ map, anchor: marker }));
          bounds.extend(location);
          plotted += 1;
        } catch {
          // Keep plotting the remaining valid addresses.
        }
      }
      if (cancelled) return;
      if (plotted) {
        map.fitBounds(bounds, 44);
        if (plotted === 1) map.setZoom(14);
      } else {
        setMapError("Google Maps could not locate these addresses.");
      }
    }).catch((error) => {
      if (!cancelled) setMapError(error.message || "Google Maps could not load.");
    });
    return () => { cancelled = true; };
  }, [apiKey, mapData, markers]);

  return (
    <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-2 text-sm font-semibold">{mapData.title || "Map"}</div>
      {mapError ? (
        <div className="p-4 text-sm">
          <p className="text-error">{mapError}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {markers.slice(0, 12).map((marker, index) => (
              <a key={`${marker.label}-${index}`} className="link link-primary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(marker.address)}`} target="_blank" rel="noreferrer">{marker.label}</a>
            ))}
          </div>
        </div>
      ) : <div ref={mapRef} className="h-80 w-full" role="img" aria-label={mapData.title || "Customer locations map"} />}
    </div>
  );
}

function AssistantChart({ chart }) {
  const labels = Array.isArray(chart?.labels) ? chart.labels.slice(0, 20) : [];
  const series = Array.isArray(chart?.series)
    ? chart.series.slice(0, 5).map((item) => ({ ...item, values: (item.values || []).slice(0, labels.length) }))
    : [];
  if (!labels.length || !series.length) return null;
  const width = 680;
  const height = 300;
  const pad = { left: 54, right: 18, top: 24, bottom: 62 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = series.flatMap((item) => item.values).filter(Number.isFinite);
  const maxValue = Math.max(1, ...values);

  if (["pie", "donut"].includes(chart.type)) {
    const pieValues = series[0].values.map((value) => Math.max(0, value || 0));
    const total = pieValues.reduce((sum, value) => sum + value, 0);
    if (!total) return null;
    let cursor = -Math.PI / 2;
    const slices = pieValues.map((value, index) => {
      const start = cursor;
      const end = cursor + (value / total) * Math.PI * 2;
      cursor = end;
      const largeArc = end - start > Math.PI ? 1 : 0;
      const x1 = 150 + 105 * Math.cos(start);
      const y1 = 145 + 105 * Math.sin(start);
      const x2 = 150 + 105 * Math.cos(end);
      const y2 = 145 + 105 * Math.sin(end);
      return { index, value, path: `M 150 145 L ${x1} ${y1} A 105 105 0 ${largeArc} 1 ${x2} ${y2} Z` };
    });
    return (
      <div className="rounded-2xl border border-base-300 bg-base-100 p-3">
        <h4 className="mb-2 text-sm font-semibold">{chart.title}</h4>
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
          <title>{chart.title}</title>
          {slices.map((slice) => <path key={slice.index} d={slice.path} fill={CHART_COLORS[slice.index % CHART_COLORS.length]} />)}
          {chart.type === "donut" ? <circle cx="150" cy="145" r="58" className="fill-base-100" /> : null}
          {labels.map((label, index) => (
            <g key={label} transform={`translate(310 ${48 + index * 36})`}>
              <rect width="14" height="14" rx="3" fill={CHART_COLORS[index % CHART_COLORS.length]} />
              <text x="22" y="12" className="fill-current text-[13px]">{label}: {pieValues[index]}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  const y = (value) => pad.top + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;
  return (
    <div className="rounded-2xl border border-base-300 bg-base-100 p-3">
      <h4 className="mb-2 text-sm font-semibold">{chart.title}</h4>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
        <title>{chart.title}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const lineY = pad.top + plotHeight * (1 - step);
          return <g key={step}><line x1={pad.left} x2={width - pad.right} y1={lineY} y2={lineY} stroke="currentColor" opacity="0.12" /><text x={pad.left - 8} y={lineY + 4} textAnchor="end" className="fill-current text-[11px]">{Math.round(maxValue * step)}</text></g>;
        })}
        {chart.type === "bar" ? series.flatMap((item, seriesIndex) => labels.map((label, index) => {
          const groupWidth = plotWidth / labels.length;
          const barWidth = Math.max(3, (groupWidth * 0.72) / series.length);
          const value = item.values[index] || 0;
          const x = pad.left + index * groupWidth + groupWidth * 0.14 + seriesIndex * barWidth;
          return <rect key={`${item.name}-${label}`} x={x} y={y(value)} width={barWidth - 2} height={pad.top + plotHeight - y(value)} rx="3" fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]} />;
        })) : series.map((item, seriesIndex) => {
          const points = labels.map((_, index) => `${pad.left + (index + 0.5) * (plotWidth / labels.length)},${y(item.values[index] || 0)}`).join(" ");
          const areaPoints = `${pad.left + 0.5 * (plotWidth / labels.length)},${pad.top + plotHeight} ${points} ${pad.left + (labels.length - 0.5) * (plotWidth / labels.length)},${pad.top + plotHeight}`;
          return <g key={item.name}>{chart.type === "area" ? <polygon points={areaPoints} fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]} opacity="0.16" /> : null}<polyline points={points} fill="none" stroke={CHART_COLORS[seriesIndex % CHART_COLORS.length]} strokeWidth="3" /><g>{labels.map((label, index) => <circle key={label} cx={pad.left + (index + 0.5) * (plotWidth / labels.length)} cy={y(item.values[index] || 0)} r="4" fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]} />)}</g></g>;
        })}
        {labels.map((label, index) => <text key={label} x={pad.left + (index + 0.5) * (plotWidth / labels.length)} y={height - 38} textAnchor="middle" className="fill-current text-[11px]">{label.length > 12 ? `${label.slice(0, 11)}…` : label}</text>)}
        <text x={pad.left + plotWidth / 2} y={height - 8} textAnchor="middle" className="fill-current text-[11px] opacity-70">{chart.xLabel}</text>
        {series.map((item, index) => <g key={item.name} transform={`translate(${pad.left + index * 125} 8)`}><rect width="10" height="10" rx="2" fill={CHART_COLORS[index % CHART_COLORS.length]} /><text x="15" y="9" className="fill-current text-[10px]">{item.name}</text></g>)}
      </svg>
    </div>
  );
}

const WIDGET_TONES = {
  neutral: "border-base-300 bg-base-100",
  info: "border-info/35 bg-info/10",
  success: "border-success/35 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  error: "border-error/35 bg-error/10",
};

function AssistantWidget({ widget }) {
  const items = Array.isArray(widget?.items) ? widget.items : [];
  if (!items.length) return null;
  const isTimeline = widget.type === "timeline";
  return (
    <div className="rounded-2xl border border-base-300 bg-base-100 p-3">
      <h4 className="mb-3 text-sm font-semibold">{widget.title}</h4>
      <div className={isTimeline ? "space-y-0" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}>
        {items.map((item, index) => isTimeline ? (
          <div key={`${item.label}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
            <div className="flex w-3 flex-none justify-center"><span className="relative z-[1] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />{index < items.length - 1 ? <span className="absolute bottom-0 top-3 w-px bg-base-300" /> : null}</div>
            <div className="min-w-0"><p className="text-xs font-medium opacity-60">{item.value}</p><p className="font-semibold">{item.label}</p>{item.detail ? <p className="mt-0.5 text-xs opacity-65">{item.detail}</p> : null}</div>
          </div>
        ) : (
          <div key={`${item.label}-${index}`} className={`rounded-xl border p-3 ${WIDGET_TONES[item.status] || WIDGET_TONES.neutral}`}>
            <p className="text-xs font-medium opacity-60">{item.label}</p>
            <p className="mt-1 text-xl font-semibold leading-tight">{item.value}</p>
            {item.detail ? <p className="mt-1 text-xs opacity-65">{item.detail}</p> : null}
            {widget.type === "progress" ? <div className="mt-3"><progress className="progress progress-primary w-full" value={item.progress || 0} max="100" /><p className="mt-1 text-right text-[11px] opacity-60">{Math.round(item.progress || 0)}%</p></div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantRichContent({ entry, mapsApiKey }) {
  const data = entry.responseData || {};
  return (
    <div className="space-y-4">
      <div className="prose prose-sm max-w-none text-current prose-headings:text-current prose-p:text-current prose-strong:text-current prose-li:text-current">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.displayText}</ReactMarkdown>
      </div>
      {(data.tables || []).map((table, tableIndex) => (
        <div key={`${table.title}-${tableIndex}`} className="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
          <div className="border-b border-base-300 px-4 py-2 text-sm font-semibold">{table.title}</div>
          <div className="overflow-x-auto"><table className="table table-sm"><thead><tr>{(table.columns || []).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{(table.rows || []).map((row, rowIndex) => <tr key={rowIndex}>{(table.columns || []).map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? ""}</td>)}</tr>)}</tbody></table></div>
        </div>
      ))}
      {(data.widgets || []).map((widget, index) => <AssistantWidget key={`${widget.title}-${index}`} widget={widget} />)}
      {(data.charts || []).map((chart, index) => <AssistantChart key={`${chart.title}-${index}`} chart={chart} />)}
      {(data.maps || []).map((mapData, index) => <AssistantMap key={`${mapData.title}-${index}`} mapData={mapData} apiKey={mapsApiKey} />)}
      {(data.sources || []).length ? (
        <details className="text-xs opacity-65"><summary className="cursor-pointer">Sources used</summary><ul className="mt-2 list-disc pl-5">{data.sources.map((source, index) => <li key={`${source.sourceId || source.label}-${index}`}>{source.label}</li>)}</ul></details>
      ) : null}
    </div>
  );
}

function AssistantActionCard({ action, busy, onDecision }) {
  const isCreateOrder = action.type === "create_manual_order";
  const statusTone = action.status === "completed"
    ? "border-success/40 bg-success/10"
    : action.status === "failed"
      ? "border-error/40 bg-error/10"
      : action.status === "cancelled"
        ? "border-base-300 bg-base-200/60"
        : "border-warning/50 bg-warning/10";
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${statusTone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Database action</p>
          <p className="mt-1 font-semibold">{action.summary}</p>
          {isCreateOrder ? (
            <div className="mt-2 space-y-1 text-sm">
              <p><span className="font-medium">Recipient:</span> {action.customerName}</p>
              {action.phone || action.email ? <p><span className="font-medium">Contact:</span> {action.phone}{action.email ? ` · ${action.email}` : ""}</p> : null}
              <p><span className="font-medium">Delivery:</span> {action.deliveryDate}{action.address ? ` · ${action.address}` : " · Internal sample"}</p>
              <p><span className="font-medium">Items:</span> {(action.items || []).map((item) => `${item.sku} × ${item.quantity}`).join(", ")}</p>
              <p><span className="font-medium">Payment:</span> {action.orderKind === "sample" ? "Sample / no payment" : action.paymentHandling.replaceAll("_", " ")}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm">
              <span className="font-mono">{action.target}</span>: {action.expectedStatus} → {action.requestedStatus}
            </p>
          )}
          {action.status === "proposed" ? <p className="mt-2 text-xs opacity-65">Requires confirmation. Customer notifications are not sent automatically.</p> : null}
          {action.status === "completed" ? <p className="mt-2 text-sm font-medium text-success">{action.result?.orderNumber ? `Created ${action.result.orderNumber}. ` : ""}Completed by {action.confirmedBy || "admin"}.</p> : null}
          {action.status === "failed" ? <p className="mt-2 text-sm text-error">{action.error || "Action failed."}</p> : null}
          {action.status === "cancelled" ? <p className="mt-2 text-sm opacity-60">Dismissed.</p> : null}
        </div>
        {action.status === "proposed" ? (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => onDecision("cancel")}>Dismiss</button>
            <button className="btn btn-warning btn-sm" type="button" disabled={busy} onClick={() => onDecision("confirm")}>
              {busy ? <span className="loading loading-spinner loading-xs" /> : null} Confirm action
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminAssistantConsole({ initialEntries = [], initialHasMore = false, initialCursor = null, voiceConfigured = false, chatConfigured = false, mapsApiKey = "" }) {
  const [entries, setEntries] = useState(sortEntries(initialEntries));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor);
  const [text, setText] = useState("");
  const [liveText, setLiveText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const maxTimerRef = useRef(null);
  const finalSegmentsRef = useRef([]);
  const partialRef = useRef("");
  const timelineRef = useRef(null);
  const hasScrolledRef = useRef(false);

  const visibleEntries = searchResults ?? entries;
  const groupedEntries = useMemo(() => {
    const groups = new Map();
    visibleEntries.forEach((entry) => {
      const group = groups.get(entry.conversationDate) || [];
      group.push(entry);
      groups.set(entry.conversationDate, group);
    });
    return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
  }, [visibleEntries]);
  const auditedParentIds = useMemo(
    () => new Set(entries.filter((entry) => entry.responseData?.actions?.length).map((entry) => entry.parentEntryId)),
    [entries]
  );

  const latestEntryId = entries[entries.length - 1]?.id || "";

  useEffect(() => {
    let cancelled = false;
    const refreshHistory = async () => {
      try {
        const payload = await readPayload(
          await fetch("/api/admin/assistant/entries?limit=40", { cache: "no-store" })
        );
        if (cancelled) return;
        setEntries((current) => {
          const optimistic = current.filter(
            (entry) =>
              entry.optimistic &&
              !payload.entries.some(
                (saved) =>
                  saved.role === "user" &&
                  saved.displayText === entry.displayText &&
                  Math.abs(new Date(saved.createdAt) - new Date(entry.createdAt)) < 120000
              )
          );
          return sortEntries([...payload.entries, ...optimistic]);
        });
        setHasMore(Boolean(payload.hasMore));
        setCursor(payload.nextCursor || null);
      } catch {
        // Keep the server-rendered history if a background refresh is interrupted.
      }
    };

    void refreshHistory();
    const handlePageShow = () => void refreshHistory();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshHistory();
    };
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setIsSearching(false);
      window.requestAnimationFrame(() => {
        const timeline = timelineRef.current;
        if (timeline) timeline.scrollTop = timeline.scrollHeight;
      });
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const payload = await readPayload(
          await fetch(`/api/admin/assistant/entries?limit=100&q=${encodeURIComponent(query)}`, {
            cache: "no-store",
            signal: controller.signal,
          })
        );
        setSearchResults(sortEntries(payload.entries || []));
        if (timelineRef.current) timelineRef.current.scrollTop = 0;
      } catch (requestError) {
        if (requestError.name !== "AbortError") setError("Could not search chat history.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const frame = window.requestAnimationFrame(() => {
      timeline.scrollTo({
        top: timeline.scrollHeight,
        behavior: hasScrolledRef.current ? "smooth" : "auto",
      });
      hasScrolledRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestEntryId, isSaving, isRecording]);

  const replaceEntry = (nextEntry) => {
    setEntries((current) => sortEntries(current.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry))));
  };

  const appendResponseEntries = (payload, optimisticId = "") => {
    const nextEntries = [payload.entry, payload.assistantEntry].filter(Boolean);
    setEntries((current) =>
      sortEntries([...current.filter((entry) => entry.id !== optimisticId), ...nextEntries])
    );
  };

  const saveTypedEntry = async (event) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || isSaving) return;
    const optimisticId = `pending-${Date.now()}`;
    const optimisticEntry = {
      id: optimisticId,
      originalText: message,
      displayText: message,
      role: "user",
      inputType: "text",
      createdBy: "You",
      conversationDate: currentConversationDate(),
      processingStatus: "logged",
      corrections: [],
      audio: { available: false },
      optimistic: true,
      createdAt: new Date().toISOString(),
    };
    setIsSaving(true);
    setError("");
    setNotice("");
    setText("");
    setEntries((current) => sortEntries([...current, optimisticEntry]));
    try {
      const payload = await readPayload(
        await fetch("/api/admin/assistant/entries", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        })
      );
      appendResponseEntries(payload, optimisticId);
      setNotice(payload.acknowledgement || "Answered and logged.");
    } catch (requestError) {
      setEntries((current) => current.filter((entry) => entry.id !== optimisticId));
      setText((current) => current || message);
      setError(requestError.message || "Could not save this entry.");
    } finally {
      setIsSaving(false);
    }
  };

  const connectLiveTranscription = async (stream) => {
    const payload = await readPayload(await fetch("/api/admin/assistant/realtime-session", { method: "POST" }));
    if (!payload.clientSecret) throw new Error("Live transcription did not return a session credential.");

    const socket = new WebSocket("wss://api.openai.com/v1/realtime", [
      "realtime",
      `openai-insecure-api-key.${payload.clientSecret}`,
    ]);
    socketRef.current = socket;

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === "conversation.item.input_audio_transcription.delta") {
          partialRef.current += event.delta || "";
          setLiveText([...finalSegmentsRef.current, partialRef.current].filter(Boolean).join(" "));
        }
        if (event.type === "conversation.item.input_audio_transcription.completed") {
          const transcript = String(event.transcript || partialRef.current || "").trim();
          if (transcript) finalSegmentsRef.current.push(transcript);
          partialRef.current = "";
          setLiveText(finalSegmentsRef.current.join(" "));
        }
        if (event.type === "error") {
          setNotice("Live text paused. A final transcription will run after you stop.");
        }
      } catch {
        // Ignore non-JSON realtime frames.
      }
    };

    socket.onerror = () => {
      setNotice("Live text is unavailable. A final transcription will run after you stop.");
    };

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Live transcription connection timed out.")), 10000);
      socket.onopen = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      socket.onclose = () => {
        window.clearTimeout(timeout);
        if (socket.readyState !== WebSocket.OPEN) reject(new Error("Live transcription connection closed."));
      };
    });

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext({ sampleRate: 24000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (audioEvent) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const samples = resampleTo24k(audioEvent.inputBuffer.getChannelData(0), audioContext.sampleRate);
      const pcm = encodePcm16(samples);
      socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm }));
    };
    source.connect(processor);
    processor.connect(audioContext.destination);
    audioContextRef.current = audioContext;
    sourceRef.current = source;
    processorRef.current = processor;
  };

  const cleanupRecordingResources = async () => {
    window.clearInterval(timerRef.current);
    window.clearTimeout(maxTimerRef.current);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    if (audioContextRef.current) await audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setIsRecording(false);
    setIsTranscribing(true);
    setError("");

    const audioPromise = new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }

    const audioBlob = await audioPromise;
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    socketRef.current?.close();
    socketRef.current = null;
    await cleanupRecordingResources();

    const durationMs = Math.min(Date.now() - startedAtRef.current, MAX_RECORDING_MS);
    const liveTranscript = [...finalSegmentsRef.current, partialRef.current].filter(Boolean).join(" ").trim();
    const formData = new FormData();
    formData.append("audio", audioBlob, `assistant-${Date.now()}.${audioBlob.type.includes("mp4") ? "m4a" : "webm"}`);
    formData.append("durationMs", String(durationMs));

    try {
      const payload = await readPayload(
        await fetch("/api/admin/assistant/transcribe", { method: "POST", body: formData })
      );
      const transcript = String(payload.transcript || liveTranscript).trim();
      if (!transcript) throw new Error("The transcription was empty.");
      setText((current) => [current.trim(), transcript].filter(Boolean).join(" "));
      setNotice("Transcription ready. Review it, then press Enter to send.");
    } catch (requestError) {
      if (liveTranscript) {
        setText((current) => [current.trim(), liveTranscript].filter(Boolean).join(" "));
        setNotice("Live transcription is ready. Review it, then press Enter to send.");
      } else {
        setError(requestError.message || "Could not transcribe this recording.");
      }
    } finally {
      setIsTranscribing(false);
      setLiveText("");
      setElapsedSeconds(0);
      chunksRef.current = [];
      finalSegmentsRef.current = [];
      partialRef.current = "";
      mediaRecorderRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!voiceConfigured || isSaving || isTranscribing) return;
    setError("");
    setNotice("");
    setLiveText("");
    chunksRef.current = [];
    finalSegmentsRef.current = [];
    partialRef.current = "";

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("This browser does not support microphone recording.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const preferredTypes = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.min(Math.floor((Date.now() - startedAtRef.current) / 1000), 600));
      }, 1000);
      maxTimerRef.current = window.setTimeout(() => void stopRecording(), MAX_RECORDING_MS);

      void connectLiveTranscription(stream).catch(() => {
        setNotice("Live text is unavailable. A final transcription will run after you stop.");
      });
    } catch (recordingError) {
      await cleanupRecordingResources();
      setIsRecording(false);
      setError(
        recordingError?.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser and try again."
          : recordingError.message || "Could not start recording."
      );
    }
  };

  const loadOlder = async () => {
    if (!hasMore || !cursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    setError("");
    try {
      const payload = await readPayload(
        await fetch(`/api/admin/assistant/entries?limit=40&before=${encodeURIComponent(cursor)}`)
      );
      setEntries((current) => sortEntries([...payload.entries, ...current]));
      setHasMore(Boolean(payload.hasMore));
      setCursor(payload.nextCursor || null);
    } catch (requestError) {
      setError(requestError.message || "Could not load older entries.");
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const correctEntry = async (entry) => {
    const corrected = window.prompt("Correct this transcript. The original will remain in its audit trail.", entry.displayText);
    if (corrected === null || !corrected.trim() || corrected.trim() === entry.displayText) return;
    setBusyEntryId(entry.id);
    setError("");
    try {
      const payload = await readPayload(
        await fetch(`/api/admin/assistant/entries/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: corrected }),
        })
      );
      replaceEntry(payload.entry);
    } catch (requestError) {
      setError(requestError.message || "Could not save the correction.");
    } finally {
      setBusyEntryId("");
    }
  };

  const retryEntry = async (entry) => {
    setBusyEntryId(entry.id);
    setError("");
    try {
      const payload = await readPayload(await fetch(`/api/admin/assistant/entries/${entry.id}/retry`, { method: "POST" }));
      replaceEntry(payload.entry);
      if (payload.assistantEntry) {
        setEntries((current) => sortEntries([...current, payload.assistantEntry]));
      }
      setNotice(payload.acknowledgement || "Answered and logged.");
    } catch (requestError) {
      setError(requestError.message || "Transcription retry failed.");
    } finally {
      setBusyEntryId("");
    }
  };

  const retryAnswer = async (entry) => {
    setBusyEntryId(entry.id);
    setError("");
    try {
      const payload = await readPayload(await fetch(`/api/admin/assistant/entries/${entry.id}/answer`, { method: "POST" }));
      replaceEntry(payload.entry);
    } catch (requestError) {
      setError(requestError.message || "Answer retry failed.");
    } finally {
      setBusyEntryId("");
    }
  };

  const handleAction = async (entry, action, decision) => {
    const busyId = `${entry.id}:${action.id}`;
    setBusyEntryId(busyId);
    setError("");
    setNotice("");
    try {
      const payload = await readPayload(
        await fetch(`/api/admin/assistant/entries/${entry.id}/actions/${action.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        })
      );
      replaceEntry(payload.entry);
      setNotice(decision === "confirm" ? "Database action completed." : "Action dismissed.");
    } catch (requestError) {
      if (requestError.payload?.entry) replaceEntry(requestError.payload.entry);
      setError(requestError.message || "Could not complete this action.");
    } finally {
      setBusyEntryId("");
    }
  };

  const deleteEntry = async (entry) => {
    const confirmation = entry.role === "assistant"
      ? "Delete this assistant response permanently? This cannot be undone."
      : "Delete this message, its assistant response, and any stored audio permanently? This cannot be undone.";
    if (!window.confirm(confirmation)) return;
    setBusyEntryId(entry.id);
    setError("");
    try {
      await readPayload(await fetch(`/api/admin/assistant/entries/${entry.id}`, { method: "DELETE" }));
      setEntries((current) => current.filter((item) => item.id !== entry.id && item.parentEntryId !== entry.id));
    } catch (requestError) {
      setError(requestError.message || "Could not delete this entry.");
    } finally {
      setBusyEntryId("");
    }
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col gap-2">
      {!chatConfigured ? (
        <div className="alert alert-warning mb-4 text-sm">
          Answers need OPENAI_API_KEY. Messages will still be logged while chat is unconfigured.
        </div>
      ) : null}
      {!voiceConfigured ? (
        <div className="alert alert-warning mb-4 text-sm">
          Voice transcription needs OPENAI_API_KEY. Typed chat remains available.
        </div>
      ) : null}
      {error ? <div className="alert alert-error mb-4 text-sm"><span>{error}</span></div> : null}
      {notice ? <div className="alert alert-info mb-4 text-sm"><span>{notice}</span></div> : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-base-300 bg-base-100 shadow-xl">
        <div className="flex flex-none flex-col gap-3 border-b border-base-300 bg-base-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary text-xl text-primary-content">✦</div>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">Operations assistant</h2>
              <p className="truncate text-xs opacity-60">Answers from current admin data and executes explicitly confirmed actions.</p>
            </div>
          </div>
          <label className="input input-bordered flex h-10 w-full items-center gap-2 rounded-xl bg-base-100 md:w-72">
            <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none opacity-50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chat history"
              aria-label="Search chat history"
            />
            {isSearching ? <span className="loading loading-spinner loading-xs opacity-50" /> : null}
            {!isSearching && searchQuery ? (
              <button className="btn btn-ghost btn-circle btn-xs" type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>
            ) : null}
          </label>
        </div>

        <div
          ref={timelineRef}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-base-200/60 px-4 py-5 md:px-6"
        >
          {hasMore && !searchQuery.trim() ? (
            <div className="text-center">
              <button className="btn btn-ghost btn-sm" type="button" onClick={loadOlder} disabled={isLoadingOlder}>
                {isLoadingOlder ? "Loading…" : "Load older conversations"}
              </button>
            </div>
          ) : null}

          {groupedEntries.length === 0 && !isSearching ? (
            <div className="mx-auto max-w-md py-16 text-center">
              <div className="text-3xl">{searchQuery.trim() ? "⌕" : "💬"}</div>
              <h3 className="mt-3 text-lg font-semibold">{searchQuery.trim() ? "No messages found" : "Ask about your operations"}</h3>
              <p className="mt-2 text-sm opacity-60">{searchQuery.trim() ? "Try another word, order number, SKU, or status." : "Type a question or use the microphone to dictate a message."}</p>
            </div>
          ) : null}

          {groupedEntries.map(([date, dayEntries]) => (
            <div key={date} className="space-y-4">
              <div className="sticky top-0 z-10 flex justify-center">
                <span className="rounded-full bg-base-100 px-3 py-1 text-xs font-medium shadow-sm">{dateLabel(date)}</span>
              </div>
              {dayEntries.map((entry) => entry.role === "assistant" ? (
                <div key={entry.id} className="chat chat-start">
                  <div className="chat-header mb-1 text-xs opacity-55">Operations assistant · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="chat-bubble max-w-[96%] bg-base-100 text-base-content shadow-sm md:max-w-[88%]">
                    <AssistantRichContent entry={entry} mapsApiKey={mapsApiKey} />
                    {(entry.responseData?.actions || []).map((action) => (
                      <AssistantActionCard
                        key={action.id}
                        action={action}
                        busy={busyEntryId === `${entry.id}:${action.id}`}
                        onDecision={(decision) => handleAction(entry, action, decision)}
                      />
                    ))}
                    {entry.processingStatus === "answer_failed" ? <p className="mt-3 text-xs text-error">{entry.processingError}</p> : null}
                  </div>
                  <div className="chat-footer mt-1 flex gap-1">
                    {entry.processingStatus === "answer_failed" ? <button className="btn btn-ghost btn-xs" type="button" disabled={busyEntryId === entry.id} onClick={() => retryAnswer(entry)}>Retry answer</button> : null}
                    {entry.responseData?.actions?.length ? null : <button className="btn btn-ghost btn-xs text-error" type="button" disabled={busyEntryId === entry.id || busyEntryId.startsWith(`${entry.id}:`)} onClick={() => deleteEntry(entry)}>Delete</button>}
                  </div>
                </div>
              ) : (
                <div key={entry.id} className="chat chat-end">
                  <div className="chat-header mb-1 text-xs opacity-55">{entry.createdBy} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="chat-bubble max-w-[90%] bg-primary text-primary-content md:max-w-[75%]">
                    {entry.processingStatus === "transcription_failed" ? <div><p className="font-medium">Recording saved, but transcription failed.</p><p className="mt-1 text-xs opacity-80">{entry.processingError}</p></div> : <p className="whitespace-pre-wrap">{entry.displayText}</p>}
                    {entry.corrections?.length ? <details className="mt-3 text-xs opacity-80"><summary className="cursor-pointer">Corrected · show original</summary><p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/10 p-2">{entry.originalText}</p></details> : null}
                    {entry.audio?.available ? <audio className="mt-3 h-9 w-full max-w-sm" controls preload="none" src={`/api/admin/assistant/entries/${entry.id}/audio`} /> : null}
                  </div>
                  <div className="chat-footer mt-1 flex flex-wrap justify-end gap-1">
                    {entry.processingStatus === "transcription_failed" ? <button className="btn btn-ghost btn-xs" type="button" disabled={busyEntryId === entry.id} onClick={() => retryEntry(entry)}>Retry transcription</button> : <button className="btn btn-ghost btn-xs" type="button" disabled={busyEntryId === entry.id} onClick={() => correctEntry(entry)}>Correct</button>}
                    {auditedParentIds.has(entry.id) ? null : <button className="btn btn-ghost btn-xs text-error" type="button" disabled={busyEntryId === entry.id} onClick={() => deleteEntry(entry)}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {isRecording ? (
            <div className="chat chat-end">
              <div className="chat-bubble max-w-[90%] border border-error/30 bg-error/10 text-base-content md:max-w-[75%]">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-error">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-error" /> Recording {formatTimer(elapsedSeconds)}
                </div>
                <p className="min-h-6 whitespace-pre-wrap text-sm opacity-80">{liveText || "Listening…"}</p>
              </div>
            </div>
          ) : null}
          {isSaving && !isRecording ? (
            <div className="chat chat-start">
              <div className="chat-bubble bg-base-100 text-sm shadow-sm">
                <span className="loading loading-dots loading-sm" aria-label="Assistant is thinking" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-none border-t border-base-300 bg-base-100 p-4">
          <form className="flex items-end gap-2" onSubmit={saveTypedEntry}>
            <textarea
              className="textarea textarea-bordered max-h-40 min-h-12 flex-1 resize-none"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={isRecording ? "Finish recording before typing…" : isTranscribing ? "Finishing transcription…" : "Ask a question or dictate a message…"}
              disabled={isRecording || isSaving || isTranscribing}
              maxLength={20000}
            />
            <button
              className={`btn btn-circle ${isRecording ? "btn-error animate-pulse" : "btn-outline"}`}
              type="button"
              aria-label={isRecording ? "Stop dictation" : "Start dictation"}
              title={isRecording ? "Stop dictation" : "Dictate into the message box"}
              disabled={(!voiceConfigured && !isRecording) || isSaving || isTranscribing}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isTranscribing ? (
                <span className="loading loading-spinner loading-sm" />
              ) : isRecording ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <path d="M12 18v3" />
                  <path d="M9 21h6" />
                </svg>
              )}
            </button>
            <button className="btn btn-primary btn-circle" type="submit" aria-label="Send message" disabled={!text.trim() || isRecording || isSaving || isTranscribing}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] opacity-50">Dictation stays in the message box until you press Enter. Shift+Enter adds a new line.</p>
        </div>
      </section>
    </div>
  );
}
