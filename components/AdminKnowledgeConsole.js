"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

async function readPayload(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

export default function AdminKnowledgeConsole({ initialSources = [], configured = false }) {
  const [sources, setSources] = useState(initialSources);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerSources, setAnswerSources] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileTitle, setFileTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredSources = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return sources;
    }

    return sources.filter((source) =>
      [source.title, source.sourceType, source.sourceId]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, sources]);

  const refreshSources = async () => {
    const payload = await readPayload(await fetch("/api/admin/knowledge/sources"));
    setSources(payload.sources || []);
  };

  useEffect(() => {
    if (configured) {
      void refreshSources().catch(() => {});
    }
  }, [configured]);

  const askQuestion = () => {
    if (!question.trim()) {
      return;
    }

    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const payload = await readPayload(
          await fetch("/api/admin/knowledge/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
          })
        );
        setAnswer(payload.answer || "");
        setAnswerSources(payload.sources || []);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not ask knowledge.");
      }
    });
  };

  const uploadFile = () => {
    if (!selectedFile) {
      return;
    }

    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("title", fileTitle || selectedFile.name);
        formData.append("manualNotes", manualNotes);
        await readPayload(
          await fetch("/api/admin/knowledge/files", {
            method: "POST",
            body: formData,
          })
        );
        setSelectedFile(null);
        setFileTitle("");
        setManualNotes("");
        setMessage("Knowledge file indexed.");
        await refreshSources();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not upload file.");
      }
    });
  };

  const runBackfill = () => {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const payload = await readPayload(
          await fetch("/api/admin/knowledge/backfill", { method: "POST" })
        );
        setMessage(`Backfill completed: ${payload.synced || 0} synced, ${payload.failed || 0} failed.`);
        await refreshSources();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not run backfill.");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      {!configured ? (
        <div className="alert alert-warning lg:col-span-2">
          <span>Collato knowledge service is not configured. Set COLLATO_INTERNAL_API_URL and COLLATO_INTERNAL_API_SECRET.</span>
        </div>
      ) : null}

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ask admin knowledge</h2>
            <p className="mt-1 text-sm opacity-70">Answers are grounded in indexed GGH admin data and uploaded documents.</p>
          </div>
          <button className="btn btn-outline btn-sm" type="button" onClick={runBackfill} disabled={!configured || isPending}>
            Refresh index
          </button>
        </div>

        <label className="form-control mt-5">
          <div className="label">
            <span className="label-text">Question</span>
          </div>
          <textarea
            className="textarea textarea-bordered min-h-28"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about orders, recipes, invoices, delivery planning, SOPs, or uploaded docs."
          />
        </label>
        <button className="btn btn-primary mt-3" type="button" onClick={askQuestion} disabled={!configured || isPending || !question.trim()}>
          {isPending ? "Working..." : "Ask"}
        </button>

        {answer ? (
          <div className="mt-5 rounded-xl border border-base-300 bg-base-200 p-4">
            <div className="whitespace-pre-wrap text-sm leading-6">{answer}</div>
            {answerSources.length ? (
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-60">Sources</div>
                {answerSources.map((source) => (
                  <div key={`${source.sourceType}-${source.sourceId}`} className="rounded-lg bg-base-100 px-3 py-2 text-xs">
                    [{source.index}] {source.title || source.sourceLabel}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <h2 className="text-xl font-semibold">Add reference file</h2>
        <p className="mt-1 text-sm opacity-70">Upload SOPs, screenshots, notes, supplier docs, or production references.</p>
        <div className="mt-5 grid gap-3">
          <input
            className="file-input file-input-bordered w-full"
            type="file"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
          <input
            className="input input-bordered"
            value={fileTitle}
            onChange={(event) => setFileTitle(event.target.value)}
            placeholder="Title"
          />
          <textarea
            className="textarea textarea-bordered min-h-24"
            value={manualNotes}
            onChange={(event) => setManualNotes(event.target.value)}
            placeholder="Optional notes"
          />
          <button className="btn btn-primary" type="button" onClick={uploadFile} disabled={!configured || isPending || !selectedFile}>
            Add file to knowledge
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-base-100 p-5 shadow-md lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Indexed sources</h2>
            <p className="mt-1 text-sm opacity-70">{sources.length} recent sources from Collato.</p>
          </div>
          <input
            className="input input-bordered max-w-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sources"
          />
        </div>

        {message ? <div className="alert alert-success mt-4 text-sm">{message}</div> : null}
        {error ? <div className="alert alert-error mt-4 text-sm">{error}</div> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Indexed</th>
                <th>Source ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((source) => (
                <tr key={source.sourceId}>
                  <td className="font-medium">{source.title}</td>
                  <td>{source.sourceType}</td>
                  <td>{source.indexedAt ? new Date(source.indexedAt).toLocaleString() : "-"}</td>
                  <td className="max-w-sm truncate text-xs opacity-70">{source.sourceId}</td>
                </tr>
              ))}
              {filteredSources.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center opacity-60">
                    No indexed sources found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
