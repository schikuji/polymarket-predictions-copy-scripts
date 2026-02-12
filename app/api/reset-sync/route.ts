import { NextResponse } from "next/server";
import { resetSyncState } from "@/lib/kv";

export async function POST() {
  try {
    await resetSyncState();
    return NextResponse.json({
      ok: true,
      message: "Sync state reset. Next run will copy trades from the last 5 minutes.",
    });
  } catch (e) {
    console.error("Reset error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
