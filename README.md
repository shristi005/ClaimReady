# ClaimReady

**A claims workbench for hospital front-desk and billing teams.** ClaimReady brings claim checks, insurer follow-up, and payment reconciliation into one place.

> ClaimReady is a hackathon prototype that supports staff review. It does not decide coverage, approve or reject claims, or send claims or replies to insurers.

## The problem

Staff helping with health insurance claims often need to coordinate forms, bills, insurer messages, deadlines, and payment records. When that work is scattered across folders, spreadsheets, and messages, it is easy to miss a missing document, forget a response deadline, or overlook a payment difference.

ClaimReady gives staff one workflow to review a claim, manage insurer questions, and account for settlement amounts.

## Who it is for

The prototype is designed for hospital front-desk and billing staff who help patients prepare and follow up on insurance claims.

## Features

### Claim Check — review a claim before submission

Staff upload documents such as a claim form, hospital bill, and discharge summary. ClaimReady extracts available information and flags possible issues, such as missing documents or inconsistent amounts, dates, or IDs. Staff check the evidence and decide what to do. They submit the claim to the insurer themselves.

**AI role:** Regular matching and validation rules run first. If required information or bill line items are not found, the configured model (Ollama by default) can try to extract them. Model-extracted values must include a quote that matches the document text. The model does not judge whether a claim is valid or covered.

**Answers:** “Is anything in this claim worth checking before I send it?”

### Query Desk — manage insurer questions

Staff record an insurer's request and response deadline. Query Desk finds relevant information already extracted from the claim, shows source references, and prepares a draft for staff to review and edit. Staff obtain missing information and send the reply themselves. Each query can be tracked as **Open**, **Waiting for documents**, **Ready to review**, or **Responded**.

**AI role:** The current evidence search and response draft use matching logic and a response template. They do not call the model to interpret the insurer's request or write the reply.

**Answers:** “What did the insurer ask for, when is it due, and have we replied?”

### Payment Tracking — reconcile the settlement

Staff record the amount claimed, approved, and received, along with any deductions or adjustments. ClaimReady calculates and displays the remaining difference. For example, if a ₹45,000 claim receives ₹40,000, the ₹5,000 difference stays outstanding until it is explained and recorded.

**AI role:** Staff can upload a remittance advice as a PDF, PNG, or JPG. The configured model can return structured suggestions for settlement amounts and stated deductions. Suggestions include supporting text from the advice and prefill the form for staff to review. Nothing is saved until staff save the settlement. ClaimReady calculates the balance; it does not decide whether a deduction is valid.

**Answers:** “How much did we receive, and is any difference explained?”

## Example workflow

Ritu asks Rachael, a front-desk staff member, for help with an insurance claim.

1. Rachael opens **New claim check** and uploads the documents Ritu provided.
2. ClaimReady checks the available information and flags items for review. Rachael checks those findings against the source documents and asks Ritu for anything missing.
3. Rachael submits the claim to the insurer outside ClaimReady.
4. The insurer asks for a discharge summary and admission and discharge dates. Rachael records the request and deadline in **Query Desk**. She uses the evidence and draft to prepare a reply, obtains any missing document, then sends the response herself.
5. The insurer pays ₹40,000 on the ₹45,000 claim. Rachael records the settlement in **Payment Tracking**, checks the ₹5,000 difference against the remittance advice, and records a confirmed adjustment or follows up if the amount is unexplained.

## How AI is used

The open-source model is an assistant for specific document-reading tasks, not a claims decision-maker. Ollama can run a configured model locally on the machine hosting it. The model can help extract fields missed by ordinary matching and read settlement figures from remittance advice. The app checks extracted values against quoted source text and asks staff to review them.

Query Desk drafts are assembled by application code from available evidence. Claim checks use deterministic rules for document presence and comparisons. Settlement balances are calculated by application code. An optional Groq provider sends relevant text to a hosted service; select and disclose the provider appropriately.

## Run locally

### Requirements

- Node.js 18 or newer and npm
- Ollama and a compatible model are optional

### Start on Windows

Open the **inner project folder** in VS Code—the folder containing `backend` and `frontend`. In the VS Code PowerShell terminal, run:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run demo
```

`npm run demo` builds the frontend and starts the backend. Open **http://localhost:4000** and create an account and hospital workspace. The app creates its local database and upload folder when needed.

If `backend/.env` already exists, keep it instead of copying over it. After the frontend has been built, you can start the backend with `npm start` from `backend`.

### Optional: set up Ollama

1. Install and start Ollama.
2. Download a model, for example:

   ```powershell
   ollama pull qwen2.5:3b
   ```

3. In `backend/.env`, set the provider and model name to match the model you downloaded:

   ```env
   LLM_PROVIDER=ollama
   OLLAMA_MODEL=qwen2.5:3b
   ```

4. Restart ClaimReady. The local AI indicator should show when the configured model is available.

The model runs on the computer hosting Ollama. If you choose Groq, relevant document text is sent to that cloud provider. Use fictional data for demos.

### Development mode

To run the frontend and backend with live reload, use two VS Code terminals.

**Terminal 1 — backend**

```powershell
cd backend
npm install
npm run dev
```

**Terminal 2 — frontend**

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite address printed in the frontend terminal, usually **http://localhost:5173**.

## Project structure

```text
claimready/
├── README.md
├── DEMO_AND_POST.md          # Demo and presentation notes
├── backend/
│   ├── src/
│   │   ├── routes/           # Claims, queries, payments, and files APIs
│   │   ├── services/         # Document reading, extraction, and storage
│   │   ├── rules/            # Claim workflow rules
│   │   ├── llm/              # Ollama and Groq providers
│   │   ├── middleware/       # Authentication, uploads, and error handling
│   │   ├── db.js             # SQLite setup
│   │   └── server.js         # Express startup and frontend hosting
│   ├── eval/testClaims/      # Fictional sample claims
│   ├── scripts/              # Data setup and smoke-check scripts
│   ├── tests/                # Automated tests
│   ├── data/                 # Local database and uploads (runtime)
│   ├── .env.example          # Backend configuration template
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/            # Dashboard and feature screens
    │   ├── components/       # Shared interface components
    │   ├── context/          # Sign-in state
    │   └── lib/              # API client
    ├── .env.example
    └── package.json
```

## Demo materials

- Use fictional sample claims from `backend/eval/testClaims/` or the files in `demo-assets/`.
- A clear demo can show a claim issue, an insurer query and its evidence-backed draft, then a payment difference.
- Explain that staff review findings, submit claims, send replies, and follow up on payments.
- See [`DEMO_AND_POST.md`](DEMO_AND_POST.md) for a longer presentation outline. Use results measured from your own run; do not present sample or placeholder figures as measured results.

## Limitations and responsible use

- This is a hackathon prototype, not a certified billing, clinical, or insurance decision system or compliance certification.
- Use fictional data in demos. Local storage is not encrypted by the app; protect the computer and its data folder.
- Document extraction and OCR can miss or misread information. Staff must verify source documents and every suggestion.
- ClaimReady does not connect to insurer payment systems, send claims or replies, determine coverage, or decide whether a deduction is contractually valid.
- Local AI processing stays on the configured machine. Optional cloud AI sends relevant text to the selected provider.
