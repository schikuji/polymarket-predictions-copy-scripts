const DATA_API = "https://data-api.polymarket.com";

export interface Position {
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  title: string;
  slug: string;
  eventSlug?: string;
  icon?: string;
  outcome: string;
  oppositeOutcome: string;
  redeemable: boolean;
  mergeable: boolean;
  endDate?: string;
}

export interface ClosedPosition {
  asset: string;
  conditionId: string;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  timestamp: number;
  title: string;
  slug: string;
  icon?: string;
  outcome: string;
  eventSlug?: string;
}

export async function getPositions(address: string, limit = 100): Promise<Position[]> {
  const params = new URLSearchParams({
    user: address,
    limit: String(limit),
    sortBy: "TOKENS",
    sortDirection: "DESC",
  });
  const res = await fetch(`${DATA_API}/positions?${params}`);
  if (!res.ok) throw new Error(`Positions failed: ${res.status}`);
  const data = (await res.json()) as Position[];
  return Array.isArray(data) ? data : [];
}

export async function getClosedPositions(address: string, limit = 50): Promise<Position[]> {
  const params = new URLSearchParams({
    user: address,
    limit: String(limit),
    sortBy: "TIMESTAMP",
    sortDirection: "DESC",
  });
  const res = await fetch(`${DATA_API}/closed-positions?${params}`);
  if (!res.ok) throw new Error(`Closed positions failed: ${res.status}`);
  const data = (await res.json()) as ClosedPosition[];
  return (Array.isArray(data) ? data : []).map((c) => ({
    asset: c.asset,
    conditionId: c.conditionId,
    title: c.title,
    outcome: c.outcome,
    size: c.totalBought,
    avgPrice: c.avgPrice,
    initialValue: c.totalBought * c.avgPrice,
    currentValue: 0,
    cashPnl: c.realizedPnl,
    percentPnl: c.avgPrice > 0 ? (c.realizedPnl / (c.totalBought * c.avgPrice)) * 100 : 0,
    curPrice: c.curPrice,
    icon: c.icon,
    slug: c.slug,
    eventSlug: c.eventSlug ?? c.slug,
    redeemable: true,
    oppositeOutcome: "",
    mergeable: false,
  }));
}
