#!/usr/bin/env python3
"""Evaluate the acceptance criteria for the 150-user JMeter run."""

import argparse
import csv
import math
from collections import Counter, defaultdict
from pathlib import Path


def percentile(values: list[int], percent: float) -> int:
    values = sorted(values)
    return values[max(0, math.ceil(len(values) * percent) - 1)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("jtl", type=Path)
    parser.add_argument("--expected-users", type=int, default=150)
    parser.add_argument("--max-submit-p95-ms", type=int, default=3000)
    args = parser.parse_args()

    with args.jtl.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    if not rows:
        print("## ❌ 壓力測試未通過\n\nJMeter 沒有產生任何結果。")
        return 1

    failures = [row for row in rows if row["success"].lower() != "true"]
    by_label: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        by_label[row["label"]].append(int(row["elapsed"]))

    submit_label = "04 - Submit unique response"
    submit_times = by_label.get(submit_label, [])
    submit_p95 = percentile(submit_times, 0.95) if submit_times else 0
    passed = (
        not failures
        and len(submit_times) == args.expected_users
        and submit_p95 <= args.max_submit_p95_ms
    )

    print(f"## {'✅ 壓力測試通過' if passed else '❌ 壓力測試未通過'}")
    print("\n| 請求 | 數量 | P95 | 最大值 |")
    print("|---|---:|---:|---:|")
    for label, times in by_label.items():
        print(f"| {label} | {len(times)} | {percentile(times, 0.95)} ms | {max(times)} ms |")
    print(f"\n- 總請求：{len(rows)}")
    print(f"- 失敗請求：{len(failures)}")
    print(f"- 成功送出答案：{len(submit_times) - sum(row['label'] == submit_label for row in failures)} / {args.expected_users}")
    print(f"- 答案送出 P95：{submit_p95} ms（標準 ≤ {args.max_submit_p95_ms} ms）")
    if failures:
        codes = Counter(row["responseCode"] for row in failures)
        print("- 失敗狀態碼：" + ", ".join(f"{code} × {count}" for code, count in codes.items()))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
