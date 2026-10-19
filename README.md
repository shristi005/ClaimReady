# ClaimReady

**A claims workbench for hospital front-desk and billing teams.** ClaimReady helps staff review claim documents, keep track of insurer questions, and reconcile payments in one place.

> ClaimReady is a hackathon prototype for demonstrating a workflow. It supports staff review; it does not make coverage decisions, approve or reject claims, or submit claims to an insurer.

## The problem

Preparing and following up on a health insurance claim can leave staff juggling forms, bills, insurer messages, deadlines, and payment records. A missing document or an unexplained payment difference can mean more calls and more work. When each task is tracked in a different place, it is easy to lose sight of what needs attention next.

ClaimReady brings those tasks into one workflow: check a claim, manage insurer requests, and account for the payment.

## Inspiration

ClaimReady was inspired by the administrative work around healthcare claims: staff need to find the right information in documents, respond to insurer requests on time, and understand whether the payment matches the claim. The project explores how a local-first, human-reviewed tool can make those steps easier to follow. It does not claim to be based on formal clinical or billing research.

## Who it is for

The prototype is designed around a hospital front-desk or billing staff member helping a patient prepare and follow up on an insurance claim. For example, Rachael helps Ritu submit a claim for treatment, answers an insurer's follow-up request, and checks the resulting payment.

## The three features

### 1. Claim Check — review before sending

Staff upload claim documents, such as the claim form, hospital bill, and discharge summary. ClaimReady extracts available details and flags items that may need review, such as a missing document or a difference in amounts, dates, or IDs. Staff inspect the evidence and decide what to do. They send the claim to the insurer themselves.

**Where the AI model is used:** ordinary field matching runs first. If required information or bill line items are not found that way, the configured model (Ollama by default) may try to extract only those missing items. Each model-extracted value must include a quote that is checked against the document text; ungrounded answers are rejected. The model does **not** decide whether a claim is valid or compare the claim to policy rules. Document-presence checks and comparisons between extracted values are handled by ClaimReady's regular code.

**It helps answer:** “Does anything in this claim need attention before I send it?”

### 2. Query Desk — manage insurer questions

When an insurer asks for information or another document, staff record the request and its due date. Query Desk can search the claim's extracted document information, show source-file references, and draft a reply for staff to review and edit. Staff obtain any missing information, send the reply themselves, and track the request through Open, Waiting for documents, Ready to review, and Responded.

**Where the AI model is used:** the current Query Desk evidence search and reply draft use matching logic and a response template over information already extracted from the claim. They do not call the model to interpret the insurer's request or write the draft. Source references point to the files or review findings used.

**It helps answer:** “What did the insurer ask us for, when is it due, and have we replied?”

### 3. Payment Tracking — account for settlement

Staff manually record the amount claimed, approved, and received, plus any deductions or adjustments. ClaimReady calculates the remaining difference so unexplained amounts stay visible. For example, if a ₹45,000 claim receives ₹40,000, the ₹5,000 difference remains outstanding until staff record a valid adjustment or follow it up.

**Where the AI model is used:** staff can upload insurer remittance advice as a PDF, PNG, or JPG. ClaimReady reads the file and asks the configured model to return structured JSON with the claimed, approved, and paid amounts plus explicitly stated deductions. Each suggested amount must be supported by a quote found in the extracted text. Matching settlement fields fill automatically for staff to review; nothing is saved until staff click Save. ClaimReady's code still calculates the balance, and the model does not decide whether a deduction is valid.

**It helps answer:** “How much did we receive, and is any difference explained?”

## Example workflow

1. **Ritu asks for help with a claim.** Rachael opens **New claim check** and uploads the documents Ritu provided.
2. **ClaimReady checks the uploaded information.** It identifies possible issues and shows the supporting evidence. Rachael reviews each item and asks for anything missing.
3. **Rachael submits the claim outside ClaimReady.** The app does not send it to the insurer.
4. **The insurer asks for the discharge summary and admission and discharge dates.** Rachael records the request and deadline in **Query Desk**. ClaimReady finds date information in the available files and flags that the discharge summary is missing. Rachael gets the document, reviews and edits the suggested reply, then sends it herself.
5. **The insurer pays ₹40,000 on the ₹45,000 claim.** Rachael enters the settlement in **Payment Tracking**, checks the ₹5,000 difference against the remittance details, and records a valid deduction or follows up if it is unexplained.

## How it works

- **Frontend:** React, Vite, and Tailwind CSS.
- **Backend:** Node.js and Express API.
- **Storage:** SQLite database and uploaded files under `backend/data/` by default.
- **Document reading:** PDF text extraction, labelled-field parsing, and OCR support for uploaded images. Results depend on document quality; staff must check them.
- **Claim review:** deterministic rules compare extracted values and check configured document requirements. The model is an optional fallback to extract required fields or bill line items that ordinary field matching did not find. Extracted model answers must be supported by a quote from the source text.
- **Query Desk:** uses extracted fields, matching logic, and a response template; it does not currently use a model to generate the reply.
- **Payment Tracking:** staff enter settlement details manually or ask the configured model to suggest figures from an uploaded remittance PDF or image. Structured model output fills the matching fields with source quotes for review. Staff save the settlement and record deductions; deterministic code calculates balances and does not determine whether a deduction is valid.
- **Claim-document checklist:** uses checklist status and staff confirmation; it does not use a model to determine whether a file or signature is present.
- **AI provider:** the default provider, Ollama, runs the configured model on the machine where Ollama is installed. Groq is an optional hosted provider for open-weight models. The provider and model are selected in `backend/.env`; actual behavior depends on that configuration and model availability.
- **Accounts:** hospital workspaces, sign-in, and team roles are supported by the prototype.

The system is designed to show its work: staff can review flagged evidence and source references. When a model extracts claim fields or reads pasted remittance advice, its suggested amounts and values are accepted only when supported by quoted source text. Suggestions require staff review. Query Desk drafts are assembled with code from available evidence, and nothing is sent automatically.

## Run locally

### Requirements

- Node.js 18 or newer and npm.
- Ollama and a compatible model are optional; without a model, some less clearly labelled information may require manual review.

### Start the app on Windows (PowerShell)

Open the **inner project folder** that contains `backend` and `frontend` in VS Code. In the VS Code terminal:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run demo
```

`npm run demo` builds the frontend and starts the backend, which serves the app at **http://localhost:4000**. Keep that terminal running while using the app. On first use, create an account and a hospital workspace. The app creates its local database and uploads folder automatically.

If `backend/.env` already exists, keep it and do not overwrite it with the example file. For future starts, use `npm start` from `backend` after the frontend has been built. `npm run demo` rebuilds the frontend each time.

### Optional: configure local AI with Ollama

1. Install and start Ollama, then download a model that fits your computer. For example, `ollama pull qwen2.5:3b`.
2. In `backend/.env`, set `LLM_PROVIDER=ollama` and `OLLAMA_MODEL=qwen2.5:3b` (use the exact model name you downloaded).
3. Restart ClaimReady. The local AI indicator should show when the configured model is available.

The model runs on the computer hosting Ollama. If you choose the optional Groq provider instead, document text sent for AI processing goes to that cloud service. Do not use real patient information in a public demo.

### Development mode

For frontend and backend live reload, use two terminals:

```powershell
# Terminal 1
cd backend
npm install
npm run dev
```

```powershell
# Terminal 2
cd frontend
npm install
npm run dev
```

Open the Vite address printed in the frontend terminal, usually **http://localhost:5173**.

## Project structure

```text
claimready/
├── README.md
├── DEMO_AND_POST.md          # Optional hackathon demo and presentation notes
├── backend/
│   ├── src/
│   │   ├── routes/           # API endpoints: claims, queries, payments, files
│   │   ├── services/         # Document reading, extraction, validation, storage
│   │   ├── rules/            # Claim workflow requirements
│   │   ├── llm/              # Ollama and Groq providers
│   │   ├── middleware/       # Authentication, uploads, error handling
│   │   ├── db.js             # SQLite setup
│   │   └── server.js         # Express startup and frontend hosting
│   ├── eval/testClaims/      # Fictional sample claims for evaluation/demo
│   ├── scripts/              # Sample-data, readiness, and smoke-check scripts
│   ├── tests/                # Automated test files
│   ├── data/                 # Local database and uploaded documents (created at runtime)
│   ├── .env.example          # Backend configuration template
│   └── package.json
└── frontend/
    ├── src/
    │   ├── pages/            # Dashboard and feature screens
    │   ├── components/       # Shared layout and interface components
    │   ├── context/          # Sign-in state
    │   └── lib/              # API client
    ├── .env.example
    └── package.json
```

## Demo suggestions

- Use fictional or sample claim documents from `backend/eval/testClaims/`.
- Show a missing-document or amount-mismatch review, then show how staff record an insurer question and a settlement difference.
- Explain that the app assists staff and that the staff member reviews, submits, and follows up.
- `DEMO_AND_POST.md` contains a longer demo outline and notes for presenting model evaluation. Use measured results from your own run; do not present example or placeholder numbers as results.

## Limitations and responsible use

- This is a hackathon prototype, not a certified billing, clinical, or insurance decision system. It is not a compliance certification.
- Use fictional data for demos. Local storage is not encrypted by the app; protect the computer and its data folder.
- Extraction and OCR can miss or misread information. Staff must verify source documents and every suggested response.
- Payment details are entered manually. ClaimReady does not connect to insurer payment systems or determine whether a deduction is contractually valid.
- ClaimReady does not send claims or insurer replies and does not approve, reject, or determine coverage for claims.
- Local AI keeps processing on the configured machine. An optional cloud AI provider sends the relevant text to that provider; configure and disclose this choice appropriately.

#   C l a i m R e a d y  
 