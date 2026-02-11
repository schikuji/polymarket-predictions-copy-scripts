"use client";

import { useEffect, useState } from "react";

interface Config {
  enabled: boolean;
  minPercent: number;
  maxPercent: number;
  minBetUsd: number;
}

interface Status {
  config: Config;
  state: {
    lastTimestamp: number;
    lastRunAt?: number;
    lastCopiedAt?: number;
    lastError?: string;
  };
  cashBalance: number;
}

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, []);

  const updateConfig = async (updates: Partial<Config>) => {
    if (!status) return;
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setStatus((s) => (s ? { ...s, config: data } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/run-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await fetchStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const toggleEnabled = () => updateConfig({ enabled: !status?.config.enabled });

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </main>
    );
  }

  if (error && !status) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const cfg = status?.config ?? {
    enabled: false,
    minPercent: 5,
    maxPercent: 10,
    minBetUsd: 1,
  };

  return (
    <main className="min-h-screen p-6 md:p-12 max-w-xl mx-auto">
      <header className="mb-12">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Polymarket Copy Trader
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Copying <span className="text-zinc-400">gabagool22</span> →
          your account
        </p>
      </header>

      <div className="space-y-8">
        {/* Status card */}
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">
            Status
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Cash balance</p>
              <p className="text-lg font-medium text-zinc-100">
                ${(status?.cashBalance ?? 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Last run</p>
              <p className="text-zinc-300">
                {status?.state.lastRunAt
                  ? new Date(status.state.lastRunAt).toLocaleTimeString()
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Last copied</p>
              <p className="text-zinc-300">
                {status?.state.lastCopiedAt
                  ? new Date(status.state.lastCopiedAt).toLocaleTimeString()
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Last error</p>
              <p className="text-red-400/80 truncate max-w-[180px]">
                {status?.state.lastError || "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Control */}
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-6">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">
            Control
          </h2>

          <div className="flex items-center justify-between mb-6">
            <label htmlFor="toggle" className="text-sm font-medium text-zinc-300">
              Copy trading
            </label>
            <button
              id="toggle"
              role="switch"
              aria-checked={cfg.enabled}
              onClick={toggleEnabled}
              disabled={saving}
              className={`
                relative w-12 h-7 rounded-full transition-colors
                ${cfg.enabled ? "bg-emerald-500/80" : "bg-zinc-700"}
                ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <span
                className={`
                  absolute top-1 w-5 h-5 rounded-full bg-white transition-transform
                  ${cfg.enabled ? "left-6 translate-x-[-2px]" : "left-1"}
                `}
              />
            </button>
          </div>

          <p className="text-xs text-zinc-500 mb-6">
            {cfg.enabled
              ? "Cron runs every minute. New trades are copied automatically."
              : "Disabled. Enable to start copying."}
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Bet size range (% of balance)
              </label>
              <div className="flex gap-4 items-center">
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 mb-1">Min</p>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    value={cfg.minPercent}
                    onChange={(e) =>
                      updateConfig({
                        minPercent: Math.min(
                          parseInt(e.target.value, 10),
                          cfg.maxPercent - 1
                        ),
                      })
                    }
                    className="w-full h-2 rounded-full bg-zinc-700 appearance-none cursor-pointer accent-emerald-500"
                  />
                  <p className="text-sm font-medium text-zinc-300">{cfg.minPercent}%</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 mb-1">Max</p>
                  <input
                    type="range"
                    min={5}
                    max={25}
                    value={cfg.maxPercent}
                    onChange={(e) =>
                      updateConfig({
                        maxPercent: Math.max(
                          parseInt(e.target.value, 10),
                          cfg.minPercent + 1
                        ),
                      })
                    }
                    className="w-full h-2 rounded-full bg-zinc-700 appearance-none cursor-pointer accent-emerald-500"
                  />
                  <p className="text-sm font-medium text-zinc-300">{cfg.maxPercent}%</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Higher odds → closer to max. Lower odds → closer to min.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Min bet (USDC)
              </label>
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={cfg.minBetUsd}
                onChange={(e) =>
                  updateConfig({
                    minBetUsd: parseFloat(e.target.value) || 1,
                  })
                }
                className="w-24 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          <p className="mt-6 pt-6 border-t border-zinc-800/60">
            <button
              onClick={runNow}
              disabled={running}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Running…" : "Run now"}
            </button>
          </p>
        </section>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
