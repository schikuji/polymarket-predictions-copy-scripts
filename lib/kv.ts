import { kv } from "@vercel/kv";

const CONFIG_KEY = "copy_trader_config";
const STATE_KEY = "copy_trader_state";

export interface CopyTraderConfig {
  enabled: boolean;
  minPercent: number;
  maxPercent: number;
  minBetUsd: number;
}

export interface CopyTraderState {
  lastTimestamp: number;
  copiedKeys: string[];
  lastRunAt?: number;
  lastCopiedAt?: number;
  lastError?: string;
}

const DEFAULT_CONFIG: CopyTraderConfig = {
  enabled: false,
  minPercent: 5,
  maxPercent: 10,
  minBetUsd: 1,
};

export async function getConfig(): Promise<CopyTraderConfig> {
  const c = await kv.get<CopyTraderConfig>(CONFIG_KEY);
  return c ? { ...DEFAULT_CONFIG, ...c } : { ...DEFAULT_CONFIG };
}

export async function setConfig(config: Partial<CopyTraderConfig>): Promise<CopyTraderConfig> {
  const current = await getConfig();
  const updated = { ...current, ...config };
  await kv.set(CONFIG_KEY, updated);
  return updated;
}

export async function getState(): Promise<CopyTraderState> {
  const s = await kv.get<CopyTraderState>(STATE_KEY);
  return s
    ? { lastTimestamp: s.lastTimestamp ?? 0, copiedKeys: s.copiedKeys ?? [] }
    : { lastTimestamp: 0, copiedKeys: [] };
}

export async function setState(state: Partial<CopyTraderState>): Promise<void> {
  const current = await getState();
  const updated = { ...current, ...state };
  await kv.set(STATE_KEY, updated);
}
