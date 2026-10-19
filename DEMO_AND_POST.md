# Demo video and post kit

Video only (no hosting) is enough: the challenge template accepts "a deployed link or a video demo".
Write down the real numbers from YOUR machine; do not copy any number from this file.

## Before you record (protect the laptop)

1. Plug in the charger. Close Chrome tabs and everything else heavy. Memory is your tightest resource.
2. In `backend/.env` set `OLLAMA_MODEL=<the model you pulled>` and `OLLAMA_KEEP_ALIVE=30m` so the model stays loaded while you record.
3. `cd backend`, then `npm run doctor` until it says Ready. It also warms the model up.
4. Start clean: `set DATA_DIR=./demo-data` (Mac/Linux: `export DATA_DIR=./demo-data`), then `npm run demo`. Delete `demo-data` to reset.
5. Run `npm run samples`, then `EVAL_PAUSE_MS=5000 npm run eval` once and save the table. That is your proof slide.
   Do this separately from recording, in a cool laptop state, not while the screen recorder is running.
6. Recording tools (free): Windows Game Bar (Win+G) records one app window; OBS Studio records the whole screen.
   1080p, short sentences, no background music needed.

## Shot list (about 3 to 4 minutes)

| Time | Show | Say (in your words) |
|---|---|---|
| 0:00 | A claim packet PDF | Hospital billing staff re-check these by hand. One wrong amount or missing report means rework and delay. |
| 0:20 | Task Manager or Wi-Fi switched off | This runs on this computer. No cloud AI, no internet. (Only do this if `LLM_PROVIDER=ollama`.) |
| 0:35 | Sign up, create hospital workspace | Accounts and data are stored locally. Roles come later. |
| 0:55 | New claim check: upload `02-amount-mismatch` | I upload the claim form, bill and discharge summary. |
| 1:15 | Progress screen | The open-weight model runs locally, so this takes a moment. |
| 1:35 | Results: the amount mismatch, evidence side by side | It does not say fraud or reject anything. It shows both documents' exact text and asks a human to check. |
| 2:00 | Mark resolved, banner turns green | The reviewer decides. |
| 2:15 | Upload `09-messy-amount-mismatch` | Here the wording is unusual, so plain rules cannot read it. The AI reads it. |
| 2:45 | An item marked "Check manually" if one appears | If the AI's answer is not found in the document, it is rejected and sent to a human instead of guessed. |
| 3:05 | Team page: invite a colleague, roles | Admin, reviewer, viewer; invites tied to an email. |
| 3:20 | The eval table | I measured it on 9 fictional packets: [your numbers]. |
| 3:40 | Closing slide | Open models made this possible at zero per-claim cost, with documents not sent to a third-party model API. |

If the small model fails on a messy packet, show that honestly: the item goes to "Check manually". That is the design working, and judges respect it.

## Say / don't say

Say: "AI runs locally", "documents are not sent to a third-party model API", "a human verifies every flagged issue", "measured on fictional test packets".
Don't say: "nothing leaves the machine" if you used Groq, "reduces rejections by X%", "HIPAA compliant", "production ready", any accuracy figure you did not measure.

## DEV post draft (fill the brackets with truth)

Title: ClaimReady: a free, offline claim checker for small hospital billing desks
Tags: devchallenge, hf26challenge

**What I Built**
ClaimReady checks a hospital insurance claim packet (claim form, bill, discharge summary) before submission. It flags missing documents and mismatches in amounts, dates and IDs, shows the exact evidence, and lets a human mark each issue verified or resolved. It never approves or rejects a claim. The people who would pay: billing desks at small clinics that re-check packets by hand. [Say what you actually learned about this from a real person, or remove this sentence.]

**Demo**
[Video link]

**Code**
[GitHub repo link]

**How I Built It**
React + Vite frontend, Node + Express backend, SQLite for storage, built-in accounts with hospital workspaces and roles.
Open-weight model [name, size] running locally through Ollama. A regex-first pipeline reads clearly labelled fields; the model fills only what regex misses,
and every model answer must quote the document. If the quote is not in the text, the answer is rejected. All comparisons (amounts, dates, IDs) are plain code, not AI.

**Why Does Open Innovation Matter?**
- Documents are sensitive and a small clinic cannot pay per claim: a local open-weight model costs nothing per document and needs no third-party model API.
- I could swap models and measure them on my own test set: [paste your eval table: model, issues caught out of N, false alerts, seconds per packet].
- I can tune behaviour (prompts, rules, quote checking) instead of depending on a closed API's behaviour.
- Honest limits: [your laptop, model size, where the small model struggled].

**My First User**
[Only if it happened: who, what they said, would they pay. Otherwise delete this section.]
