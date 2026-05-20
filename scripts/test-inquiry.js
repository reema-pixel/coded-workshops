// Local smoke test for /api/inquiry.
// Usage:
//   AIRTABLE_PAT=patXXXX node scripts/test-inquiry.js
//
// Builds a sample inquiry payload, invokes the handler with mock req/res,
// and prints the result. With AIRTABLE_PAT set, it does a real write to
// the configured base/table — handy for verifying field IDs are correct.

const path = require("path");
const handler = require(path.join(__dirname, "..", "api", "inquiry.js"));

const samplePayload = {
  source: "Program Inquiry Form",
  contact: {
    name: "Test Submission",
    email: "test+inquiry@example.com",
    phone: "+965 9000 0000",
  },
  company: {
    name: "ACME Test Co.",
  },
  answers: {
    teamAndTiming: "About 8 people, ideally late June 2026.",
  },
  programs: ["Power BI Workshop"],
  notes: "This is a local test submission from scripts/test-inquiry.js — please ignore.",
  pageUrl: "http://localhost:7333/#/programs/power-bi-workshop",
};

// Mock req — body is already parsed (matches Vercel's body parsing for JSON content type)
const req = {
  method: "POST",
  body: samplePayload,
  headers: { "content-type": "application/json" },
  on() {}, // unused since body is provided
};

// Mock res — captures status + body
const res = {
  _status: 200,
  _body: null,
  _headers: {},
  status(code) { this._status = code; return this; },
  setHeader(k, v) { this._headers[k] = v; },
  json(payload) { this._body = payload; return this; },
  end() { return this; },
};

(async () => {
  console.log("[test-inquiry] base:",  process.env.AIRTABLE_BASE_ID  || "appauC0auHC017I1X (default)");
  console.log("[test-inquiry] table:", process.env.AIRTABLE_TABLE_ID || "tblNMyPuXlftz0TAL (default)");
  console.log("[test-inquiry] PAT:", process.env.AIRTABLE_PAT ? "set" : "NOT SET (will return 500)");
  console.log("[test-inquiry] payload:", JSON.stringify(samplePayload, null, 2));
  try {
    await handler(req, res);
    console.log(`[test-inquiry] response ${res._status}:`, JSON.stringify(res._body, null, 2));
    process.exit(res._status >= 400 ? 1 : 0);
  } catch (e) {
    console.error("[test-inquiry] handler threw:", e);
    process.exit(1);
  }
})();
