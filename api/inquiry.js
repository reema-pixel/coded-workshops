// Vercel Serverless Function — accepts B2B Training inquiries and writes
// them into Airtable. An Airtable Automation watches the same table for
// new rows and sends the confirmation + internal-notification emails.
//
// Required env vars (set in Vercel project settings):
//   AIRTABLE_PAT          Personal Access Token with data.records:write
//                         on the Enterprise Deals base.
//   AIRTABLE_BASE_ID      Default: appciDr5ptR27XXr9 (Enterprise Deals)
//   AIRTABLE_TABLE_ID     Default: tblHfbSdiyBrq4ga9 (B2B Training Inquiries)
//
// Accepts POST application/json with this body shape:
//   {
//     source: "Hero Chatbot" | "Program Inquiry Form" | "Enterprise Form" | "Direct Email",
//     contact:  { name, email, phone? },
//     company:  { name, description? },
//     answers:  { needs?, teamAndTiming? },
//     programs: string[],   // catalog names (multi-select)
//     pageUrl?: string,
//     notes?:   string
//   }
//
// All select fields are typecast — Airtable creates missing options on the fly,
// so new programs added to the catalog never break the inquiry flow.

const BASE_ID  = process.env.AIRTABLE_BASE_ID  || "appciDr5ptR27XXr9";
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || "tblHfbSdiyBrq4ga9";

// Field IDs from the Enterprise Deals → B2B Training Inquiries table.
// Field IDs are stable across renames; safer than field names.
const FIELDS = {
  companyName:        "fld7cI9lIeqn8hNoA", // primary singleLineText
  submittedAt:        "fldocxuV6tyMyet6a", // dateTime (ISO)
  status:             "fld57mQHkbCc4KJW4", // singleSelect — set to "New"
  contactName:        "fldFtZAgk1Jf9OvVu",
  contactEmail:       "fld62UaF91b9ma1SC", // email
  contactPhone:       "fldfL4XbaWrOYf35L", // phoneNumber
  companyDescription: "fldliUya5iHz7AWIK", // multilineText
  trainingNeeds:      "fldmIB8cODE9qVU4O", // multilineText
  teamSizeAndTiming:  "fldGHjNhl4h0eEaep", // multilineText
  programsOfInterest: "fldCo9ES2xZOoF1AP", // multipleSelects
  source:             "fld2sUz05RhshSAnz", // singleSelect
  pageUrl:            "fldfw6rtMKceGQnX5", // url
  internalNotes:      "fld7iXFuEwicnGzEg", // multilineText
};

const ALLOWED_SOURCES = [
  "Hero Chatbot",
  "Program Inquiry Form",
  "Enterprise Form",
  "Direct Email",
];

function bad(res, status, msg) {
  res.status(status).json({ ok: false, error: msg });
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 100_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const isEmail = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const trim = (v, max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : "";

module.exports = async function handler(req, res) {
  // CORS for the production domain isn't strictly needed (same-origin), but
  // we keep it permissive so preview deploys + custom domains all work.
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
  const source   = ALLOWED_SOURCES.includes(body.source) ? body.source : "Program Inquiry Form";

  const contactName  = trim(contact.name, 200);
  const contactEmail = trim(contact.email, 200);
  const companyName  = trim(company.name, 200);

  if (!contactName)  return bad(res, 400, "Contact name is required");
  if (!isEmail(contactEmail)) return bad(res, 400, "A valid email is required");

  const fields = {
    [FIELDS.companyName]:        companyName || "(unspecified)",
    [FIELDS.submittedAt]:        new Date().toISOString(),
    [FIELDS.status]:             "New",
    [FIELDS.contactName]:        contactName,
    [FIELDS.contactEmail]:       contactEmail,
    [FIELDS.contactPhone]:       trim(contact.phone, 50)         || undefined,
    [FIELDS.companyDescription]: trim(company.description, 4000) || undefined,
    [FIELDS.trainingNeeds]:      trim(answers.needs, 4000)        || undefined,
    [FIELDS.teamSizeAndTiming]:  trim(answers.teamAndTiming, 4000) || undefined,
    [FIELDS.programsOfInterest]: programs.length ? programs : undefined,
    [FIELDS.source]:             source,
    [FIELDS.pageUrl]:            trim(body.pageUrl, 500) || undefined,
    [FIELDS.internalNotes]:      trim(body.notes, 4000)  || undefined,
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
    const errText = await r.text().catch(() => "");
    return res.status(502).json({ ok: false, error: "Airtable write failed", detail: errText });
  }
  const data = await r.json().catch(() => ({}));
  return res.status(200).json({ ok: true, id: data.records?.[0]?.id });
};
