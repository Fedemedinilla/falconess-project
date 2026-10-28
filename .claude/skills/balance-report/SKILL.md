---

name: balance-report
description: Run the Falconess balance batch, diff it against a baseline and summarise every metric verdict. Use when the user asks for a balance report or after changing race constants or content.
---

1. Run `pnpm sim:batch -- --runs 10000 --report out/balance.json --markdown out/balance.md`, adding
   `--baseline <file>` when a previous report exists (ask for it or use `out/baseline.json`).
2. If a metric is inconclusive and the decision depends on it, run
   `pnpm sim:batch -- --profile full --scenarios <S…> --report out/balance-full.json`.
3. Summarise for the user: overall verdict, one line per metric (verdict, worst cell, change against
   the baseline), and the cells that moved. Point to out/balance.md for the full table.
4. Do not change constants or content here; for proposals use the balance-analyst subagent.
