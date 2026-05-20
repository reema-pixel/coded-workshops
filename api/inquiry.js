// Vercel Serverless Function — accepts B2B Training inquiries and writes
// them into Airtable. A separate Airtable Automation watches that table
// and fires the confirmation email.
//
// Required env vars (set in Vercel project settings):
//   AIRTABLE_PAT          Personal Access Token with data.records:write on the base
//   AIRTABLE_BASE_ID      Default: appauC0auHC017I1X
//   AIRTABLE_TABLE_ID     Default: tblNMyPuXlftz0TAL
//
// Accepts POST application/json with this body shape:
//   {
//     source: "Hero Chatbot" | "Program Inquiry Form" | "Enterprise Form" | "Direct Email",
//     contact:  { name, email, phone? },
//     company:  { name, description? },
//     answers:  { needs?, teamAndTiming? },
//     programs: string[],   // names from the multiselect
//     pageUrl?: string,
//     notes?:   string
//   }

const BASE_ID  = process.env.AIRTABLE_BASE_ID  || "appauC0auHC017I1X";
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || "tblNMyPuXlftz0TAL";

// Field IDs from the "Company Requesting Graduate" table — the table the
// Airtable Automation is wired to. This table is reused for B2B training
// inquiries because the email-on-new-row automation already exists there.
const FIELDS = {
  name:           "fldRYl5OkRv9Hocsc", // primary singleLineText — we put the company name here so rows are scannable
  companyName:    "fldm7bUtR56aZQKee",
  contactName:    "fldAGQR6FkiytLchs",
  companyEmail:   "fldKKrLdBXAJvW1wz",
  phone:          "fld45NXAGfAJH5zzL",
  roleType:       "fldsVcagbh7JSK3AF", // repurposed: holds the program of interest
  requestMessage: "fldBGGCgcvpQ4DDKx", // consolidated body (needs, timing, notes, page URL)
  requestSource:  "fldtMjlfumOlNqPZO",
  submittedAt:    "fldLCBUyaFuxOeJMe",
};

function bad(res, status, msg) {
  res.status(status).json({ ok: false, error: msg });
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 100_000) reject(new Error("payload too large")); });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const isEmail = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const trim = (v, max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : "";

// Build the consolidated request-message body so a single multilineText field
// captures everything that doesn't have its own column.
function buildMessage({ programs, answers, company, notes, pageUrl }) {
  const lines = [];
  if (programs && programs.length) {
    lines.push(`Programs of interest: ${programs.join(", ")}`);
  }
  if (answers.needs) {
    lines.push("");
    lines.push("Training needs:");
    lines.push(answers.needs);
  }
  if (answers.teamAndTiming) {
    lines.push("");
    lines.push("Team size & timing:");
    lines.push(answers.teamAndTiming);
  }
  if (company.description) {
    lines.push("");
    lines.push("About the company:");
    lines.push(company.description);
  }
  if (notes) {
    lines.push("");
    lines.push("Additional notes:");
    lines.push(notes);
  }
  if (pageUrl) {
    lines.push("");
    lines.push(`Submitted from: ${pageUrl}`);
  }
  return lines.join("\n").trim();
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(204).end();
  }
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");
  if (!process.env.AIRTABLE_PAT) return bad(res, 500, "Server not configured: missing AIRTABLE_PAT");

  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return bad(res, 400, e.message || "Invalid body"); }

  const contact  = body.contact  || {};
  const company  = body.company  || {};
  const answers  = body.answers  || {};
  const programs = Array.isArray(body.programs) ? body.programs.filter(Boolean).slice(0, 11) : [];
  const source   = ["Hero Chatbot", "Program Inquiry Form", "Enterprise Form", "Direct Email"].includes(body.source) ? body.source : "Program Inquiry Form";

  const contactName  = trim(contact.name, 200);
  const contactEmail = trim(contact.email, 200);
  const companyName  = trim(company.name, 200) || "(Unknown company)";

  if (!contactName)  return bad(res, 400, "Contact name is required");
  if (!isEmail(contactEmail)) return bad(res, 400, "A valid email is required");

  const message = buildMessage({
    programs,
    answers: {
      needs:         trim(answers.needs, 4000),
      teamAndTiming: trim(answers.teamAndTiming, 4000),
    },
    company:  { description: trim(company.description, 4000) },
    notes:    trim(body.notes, 4000),
    pageUrl:  trim(body.pageUrl, 500),
  });

  const fields = {
    [FIELDS.name]:           companyName,
    [FIELDS.companyName]:    companyName,
    [FIELDS.contactName]:    contactName,
    [FIELDS.companyEmail]:   contactEmail,
    [FIELDS.phone]:          trim(contact.phone, 50) || undefined,
    [FIELDS.roleType]:       programs[0] || undefined,
    [FIELDS.requestMessage]: message || undefined,
    [FIELDS.requestSource]:  source,
    [FIELDS.submittedAt]:    new Date().toISOString(),
  };
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.AIRTABLE_PAT}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!r.ok) {
    const errText = await r.text();
    return res.status(502).json({ ok: false, error: "Airtable write failed", detail: errText });
  }
  const data = await r.json();
  return res.status(200).json({ ok: true, id: data.records?.[0]?.id });
};
