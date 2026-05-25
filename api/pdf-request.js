// Vercel Serverless Function — accepts gated PDF brochure requests and writes
// them into Airtable. A separate Airtable Automation watches the same table
// for new rows and emails the requester the matching PDF brochure.
//
// We do not serve the PDF directly from the platform; delivery is owned by
// the Airtable automation so we have a clean record of every download.
//
// Required env vars (set in Vercel project settings):
//   AIRTABLE_PAT             Personal Access Token with data.records:write
//                            on the PDF Requests base.
//   AIRTABLE_PDF_BASE_ID     Default: appauC0auHC017I1X
//                            (PDF Requests live in the catalog source base.)
//   AIRTABLE_PDF_TABLE_ID    Default: tbl931DhOcYdixGHV
//
// Accepts POST application/json with this body shape:
//   {
//     contact:    { name, email, phone?, phoneCountry?, department? },
//     company:    { name },
//     programSlug: string,
//     programName: string,
//     pdfUrl?:     string,
//     pageUrl?:    string,
//     notes?:      string
//   }

const BASE_ID  = process.env.AIRTABLE_PDF_BASE_ID  || "appauC0auHC017I1X";
const TABLE_ID = process.env.AIRTABLE_PDF_TABLE_ID || "tbl931DhOcYdixGHV";

// Public / free email providers we refuse — corporate addresses only.
// Lowercased exact-match on the domain part.
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "live.com", "outlook.com", "outlook.sa", "msn.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com",
  "proton.me", "protonmail.com", "pm.me",
  "gmx.com", "gmx.net", "gmx.de",
  "mail.com", "mail.ru",
  "zoho.com",
  "yandex.com", "yandex.ru",
  "qq.com", "163.com", "126.com", "sina.com",
  "fastmail.com", "tutanota.com", "tuta.io",
  "hey.com",
  "duck.com", "duckduckgo.com",
  "inbox.com",
]);

function bad(res, status, msg, code) {
  const body = { ok: false, error: msg };
  if (code) body.code = code;
  res.status(status).json(body);
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
const trim    = (v, max = 4000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const domainOf = (email) => {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
};

// Compact dial-code → country name lookup so we can label phone numbers
// with the country the requester selected, even if the front-end only
// sends the prefix. (Same list lives in app.js for the UI.)
const DIAL_TO_COUNTRY = {
  "+965": "Kuwait", "+966": "Saudi Arabia", "+971": "United Arab Emirates",
  "+974": "Qatar", "+973": "Bahrain", "+968": "Oman",
  "+20": "Egypt", "+962": "Jordan", "+961": "Lebanon", "+963": "Syria",
  "+964": "Iraq", "+967": "Yemen", "+970": "Palestine", "+972": "Israel",
  "+1": "United States / Canada", "+44": "United Kingdom",
  "+33": "France", "+49": "Germany", "+39": "Italy", "+34": "Spain",
  "+31": "Netherlands", "+32": "Belgium", "+41": "Switzerland",
  "+43": "Austria", "+45": "Denmark", "+46": "Sweden", "+47": "Norway",
  "+48": "Poland", "+30": "Greece", "+351": "Portugal", "+353": "Ireland",
  "+358": "Finland", "+380": "Ukraine", "+40": "Romania",
  "+7": "Russia / Kazakhstan", "+90": "Turkey", "+98": "Iran",
  "+92": "Pakistan", "+91": "India", "+880": "Bangladesh", "+94": "Sri Lanka",
  "+977": "Nepal", "+93": "Afghanistan",
  "+81": "Japan", "+82": "South Korea", "+86": "China", "+852": "Hong Kong",
  "+886": "Taiwan", "+65": "Singapore", "+60": "Malaysia", "+62": "Indonesia",
  "+63": "Philippines", "+66": "Thailand", "+84": "Vietnam",
  "+212": "Morocco", "+213": "Algeria", "+216": "Tunisia", "+218": "Libya",
  "+249": "Sudan", "+251": "Ethiopia", "+254": "Kenya", "+234": "Nigeria",
  "+27": "South Africa",
  "+61": "Australia", "+64": "New Zealand",
  "+55": "Brazil", "+54": "Argentina", "+52": "Mexico",
};

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

  const contact = body.contact || {};
  const company = body.company || {};

  const contactName   = trim(contact.name, 200);
  const contactEmail  = trim(contact.email, 200).toLowerCase();
  const department    = trim(contact.department, 200);
  const phoneCountry  = trim(contact.phoneCountry, 10);
  const phoneNumber   = trim(contact.phone, 50);
  const companyName   = trim(company.name, 200);
  const programSlug   = trim(body.programSlug, 200);
  const programName   = trim(body.programName, 200);
  const pdfUrl        = trim(body.pdfUrl, 500);
  const pageUrl       = trim(body.pageUrl, 500);
  const notes         = trim(body.notes, 4000);

  if (!contactName)  return bad(res, 400, "Full name is required", "name_required");
  if (!companyName)  return bad(res, 400, "Company name is required", "company_required");
  if (!department)   return bad(res, 400, "Department is required", "department_required");
  if (!isEmail(contactEmail)) return bad(res, 400, "A valid email is required", "email_invalid");

  const domain = domainOf(contactEmail);
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
    return bad(
      res,
      400,
      "Please use your company email — public addresses (Gmail, Hotmail, Yahoo, etc.) are not accepted.",
      "email_public"
    );
  }

  // Combine country dial code + national number into a single, dialable
  // string for the Airtable phone field (avoids ambiguity when the same
  // record is read from email tools or the Automation runtime).
  const phoneFull = phoneNumber
    ? (phoneCountry ? `${phoneCountry} ${phoneNumber}` : phoneNumber)
    : "";
  const phoneCountryName = phoneCountry ? (DIAL_TO_COUNTRY[phoneCountry] || "") : "";

  // Fields are passed by *name* so the Airtable team can rename / add columns
  // without coordinating a code deploy. typecast: true lets new select
  // options materialise on the fly.
  const fields = {
    "Company Name":   companyName,
    "Contact Name":   contactName,
    "Department":     department,
    "Work Email":     contactEmail,
    "Email Domain":   domain,
    "Phone":          phoneFull || undefined,
    "Phone Country":  phoneCountryName || undefined,
    "Phone Code":     phoneCountry || undefined,
    "Notes":          notes || undefined,
    "Program":        programName || programSlug || "(unspecified)",
    "Program Slug":   programSlug || undefined,
    "PDF URL":        pdfUrl || undefined,
    "Page URL":       pageUrl || undefined,
    "Submitted At":   new Date().toISOString(),
    "Status":         "New",
    "Source":         "PDF Download",
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
