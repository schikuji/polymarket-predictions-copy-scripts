#!/usr/bin/env python3
"""
Polymarket Copy Trader

Copies trades from a target user (gabagool22) to your account.
Each bet is sized at 5-10% of your cash balance based on the odds of the trade.
"""

import io
import csv
import zipfile
import time
import os
from typing import Optional

import requests
from dotenv import load_dotenv
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import MarketOrderArgs, OrderType
from py_clob_client.order_builder.constants import BUY, SELL

# API endpoints
DATA_API = "https://data-api.polymarket.com"
CLOB_HOST = "https://clob.polymarket.com"
CHAIN_ID = 137


def get_cash_balance(address: str) -> float:
    """Get cash balance (USDC) for an address from Data API accounting snapshot."""
    resp = requests.get(
        f"{DATA_API}/v1/accounting/snapshot",
        params={"user": address},
        timeout=30,
    )
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        with zf.open("equity.csv") as f:
            reader = csv.DictReader(io.TextIOWrapper(f))
            row = next(reader, None)
            if not row:
                return 0.0
            return float(row.get("cashBalance", 0) or 0)


def get_target_activity(address: str, limit: int = 100, since_timestamp: Optional[int] = None) -> list:
    """Get recent TRADE activity for a user. Returns newest first."""
    params = {
        "user": address,
        "type": "TRADE",  # Filter to trades only
        "limit": limit,
        "sortBy": "TIMESTAMP",
        "sortDirection": "DESC",
    }
    if since_timestamp:
        params["start"] = since_timestamp

    resp = requests.get(f"{DATA_API}/activity", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def compute_bet_size(cash_balance: float, price: float, min_pct: float, max_pct: float, min_usd: float) -> float:
    """
    Compute bet size as 5-10% of cash balance, scaled by odds.
    Higher odds (price closer to 1) -> use more of the range (up to max_pct).
    Lower odds (price closer to 0) -> use less (down to min_pct).
    """
    # Linear interpolation: price 0 -> min_pct, price 1 -> max_pct
    pct = min_pct + (price * (max_pct - min_pct))
    amount = cash_balance * pct
    return max(amount, min_usd) if amount >= min_usd else 0.0


def main():
    load_dotenv()

    private_key = os.getenv("PRIVATE_KEY")
    my_address = os.getenv("MY_ADDRESS", "0x370e81c93aa113274321339e69049187cce03bb9")
    target_address = os.getenv("TARGET_ADDRESS", "0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d")
    signature_type = int(os.getenv("SIGNATURE_TYPE", "1"))
    min_pct = float(os.getenv("MIN_PERCENT", "0.05"))
    max_pct = float(os.getenv("MAX_PERCENT", "0.10"))
    poll_interval = int(os.getenv("POLL_INTERVAL", "15"))
    min_bet_usd = float(os.getenv("MIN_BET_USD", "1.0"))

    if not private_key:
        print("ERROR: Set PRIVATE_KEY in .env (copy from config.example.env)")
        return 1

    # Initialize CLOB client
    client = ClobClient(
        CLOB_HOST,
        key=private_key,
        chain_id=CHAIN_ID,
        signature_type=signature_type,
        funder=my_address,
    )
    client.set_api_creds(client.create_or_derive_api_creds())

    # Track which trades we've already copied (by tx hash + asset + side)
    copied: set[tuple[str, str, str]] = set()
    last_timestamp: Optional[int] = None  # None = first run, don't copy historical

    print(f"Copy trading: {target_address} -> {my_address}")
    print(f"Position sizing: {min_pct*100:.0f}%-{max_pct*100:.0f}% of cash balance per bet")
    print(f"Polling every {poll_interval}s. Press Ctrl+C to stop.\n")

    while True:
        try:
            # Get our cash balance
            cash_balance = get_cash_balance(my_address)
            if cash_balance < 1:
                print(f"[{time.strftime('%H:%M:%S')}] Low balance: ${cash_balance:.2f} - skipping")
                time.sleep(poll_interval)
                continue

            # Get target's recent trades
            activities = get_target_activity(target_address, limit=50)
            if not activities:
                time.sleep(poll_interval)
                continue

            for act in activities:
                if act.get("type") != "TRADE":
                    continue

                ts = act.get("timestamp", 0)
                if last_timestamp is not None and ts <= last_timestamp:
                    continue

                tx_hash = act.get("transactionHash", "")
                asset = act.get("asset", "")
                side_str = act.get("side", "BUY")
                price = float(act.get("price", 0) or 0)
                size = float(act.get("size", 0) or 0)
                title = act.get("title", "?")[:50]

                if not asset or price <= 0:
                    continue

                key = (tx_hash, asset, side_str)
                if key in copied:
                    continue

                # Compute our bet size
                bet_usd = compute_bet_size(cash_balance, price, min_pct, max_pct, min_bet_usd)
                if bet_usd < min_bet_usd:
                    continue

                side = BUY if side_str.upper() == "BUY" else SELL

                try:
                    # Price helps with FOK execution (limit worst fill)
                    mo = MarketOrderArgs(
                        token_id=asset,
                        amount=bet_usd,
                        side=side,
                        order_type=OrderType.FOK,
                        price=price,
                    )
                    signed = client.create_market_order(mo)
                    resp = client.post_order(signed, OrderType.FOK)

                    if resp.get("success"):
                        copied.add(key)
                        last_timestamp = max(last_timestamp or 0, ts)
                        print(f"[{time.strftime('%H:%M:%S')}] COPIED: {side_str} ${bet_usd:.2f} on {title}")
                    else:
                        err = resp.get("errorMsg", "unknown")
                        print(f"[{time.strftime('%H:%M:%S')}] FAILED: {err} ({title})")

                except Exception as e:
                    print(f"[{time.strftime('%H:%M:%S')}] ERROR: {e} ({title})")

            # On first run, set last_timestamp so we don't copy historical trades
            if last_timestamp is None and activities:
                trade_ts = [a.get("timestamp", 0) for a in activities if a.get("type") == "TRADE"]
                if trade_ts:
                    last_timestamp = max(trade_ts)
                    print(f"[{time.strftime('%H:%M:%S')}] Synced. Watching for new trades...")
                else:
                    last_timestamp = 0

        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] Poll error: {e}")

        time.sleep(poll_interval)

    return 0


if __name__ == "__main__":
    exit(main())
