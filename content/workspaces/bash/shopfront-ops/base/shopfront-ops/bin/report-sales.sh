#!/usr/bin/env bash
# Sales totals from an orders export, by day (-d) or by product (-p). Only
# paid, shipped and delivered orders count.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
PRODUCTS=${PRODUCTS_FILE:-$ROOT/data/products.json}

usage() {
  cat <<'USAGE'
usage: report-sales.sh -d|-p [ORDERS_CSV]

Sales totals from an orders export (default: data/orders.csv). Only paid,
shipped and delivered orders count.

  -d  by day: date, orders, units, revenue, then a total line
  -p  by product: sku, units, revenue, product, biggest revenue first
  -h  show this help
USAGE
}

mode=""
while getopts ':dph' opt; do
  case $opt in
    d | p)
      if [[ -n $mode && $mode != "$opt" ]]; then
        echo "report-sales.sh: choose one of -d and -p" >&2
        usage >&2
        exit 64
      fi
      mode=$opt
      ;;
    h)
      usage
      exit 0
      ;;
    *)
      echo "report-sales.sh: unknown option -$OPTARG" >&2
      usage >&2
      exit 64
      ;;
  esac
done
shift $((OPTIND - 1))

if [[ -z $mode || $# -gt 1 ]]; then
  usage >&2
  exit 64
fi

orders=${1:-$ROOT/data/orders.csv}
if [[ ! -f $orders ]]; then
  echo "error: $orders not found" >&2
  exit 1
fi

by_day() {
  awk --csv '
    NR == 1 { next }
    $7 == "paid" || $7 == "shipped" || $7 == "delivered" {
      cents = int($6 * 100 + 0.5) * $5
      count[$2]++
      units[$2] += $5
      revenue[$2] += cents
      all_count++
      all_units += $5
      all_revenue += cents
    }
    END {
      printf "%-10s %7s %6s %10s\n", "date", "orders", "units", "revenue"
      PROCINFO["sorted_in"] = "@ind_str_asc"
      for (day in count) {
        printf "%-10s %7d %6d %10.2f\n", day, count[day], units[day], revenue[day] / 100
      }
      printf "%-10s %7d %6d %10.2f\n", "total", all_count, all_units, all_revenue / 100
    }
  ' "$orders"
}

by_product() {
  if ! command -v jq > /dev/null; then
    echo "report-sales.sh: jq: not found (it is in /usr/local/bin)" >&2
    exit 127
  fi
  awk --csv '
    FNR == NR { sku[$1] = $2; next }
    FNR == 1 { next }
    $7 == "paid" || $7 == "shipped" || $7 == "delivered" {
      cents = int($6 * 100 + 0.5) * $5
      units[$4] += $5
      revenue[$4] += cents
    }
    function by_revenue(i1, v1, i2, v2) {
      if (revenue[i1] != revenue[i2]) return revenue[i2] - revenue[i1]
      return (code(i1) < code(i2)) ? -1 : (code(i1) > code(i2))
    }
    function code(name) { return (name in sku) ? sku[name] : "-" }
    END {
      printf "%-10s %6s %10s  %s\n", "sku", "units", "revenue", "product"
      PROCINFO["sorted_in"] = "by_revenue"
      for (name in revenue) {
        printf "%-10s %6d %10.2f  %s\n", code(name), units[name], revenue[name] / 100, name
      }
    }
  ' <(jq -r '.[] | [.name, .sku] | @csv' "$PRODUCTS") "$orders"
}

case $mode in
  d) by_day ;;
  p) by_product ;;
esac
