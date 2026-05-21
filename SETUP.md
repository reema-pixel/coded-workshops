# CODED Training For Companies — Production setup

This site collects B2B training inquiries from three places:

1. **Hero chatbot** (4-step concierge on the landing page).
2. **Per-program inquiry modal** (each program detail page).
3. **Enterprise form** (`/#/enterprise`, the long custom-program form).

All three POST the same shape to **`/api/inquiry`** (a Vercel serverless function),
which writes a single row into the **B2B Training Inquiries** table in the
Enterprise Deals base. An **Airtable Automation** watches that table and sends
the confirmation email — no extra server code, no separate ESP.

Production stack:

```
landing page → /api/inquiry (Vercel fn) → Airtable: B2B Training Inquiries
                                            └── Automation 1: confirmation email → lead
                                            └── Automation 2: internal notification → enterprise@joincoded.com
```

---

## 1) Airtable — the table is already there

Base: **Enterprise Deals** (`appciDr5ptR27XXr9`)
Table: **B2B Training Inquiries** (`tblHfbSdiyBrq4ga9`)

The schema is wired by field ID in [`api/inquiry.js`](api/inquiry.js):

| Field name              | Type                | Used for                                          |
| ----------------------- | ------------------- | ------------------------------------------------- |
| Company Name            | singleLineText      | Primary field — appears in row titles, automations |
| Submitted At            | dateTime            | ISO timestamp                                     |
| Status                  | singleSelect        | Set to `New` on every insert                      |
| Contact Name            | singleLineText      | Required                                          |
| Contact Email           | email               | Required — automation pulls from here             |
| Contact Phone           | phoneNumber         | Optional                                          |
| Company Description     | multilineText       | Hero chatbot Q1                                   |
| Training Needs          | multilineText       | Hero chatbot Q2                                   |
| Team Size & Timing      | multilineText       | Hero chatbot Q3 + modal Q                         |
| Programs of Interest    | multipleSelects     | Catalog program names — new ones auto-create      |
| Source                  | singleSelect        | `Hero Chatbot` / `Program Inquiry Form` / `Enterprise Form` / `Direct Email` |
| Page URL                | url                 | Where the form was submitted from                 |
| Internal Notes          | multilineText       | Free-text from the user                           |
| Assignee                | singleCollaborator  | BD owner — manual                                 |

The serverless function uses **`typecast: true`**, so any new program name added to
the public catalog automatically becomes a new option in `Programs of Interest`
(and likewise for any new value in `Source`). You never have to touch the table
schema when the catalog changes.

### Personal Access Token

1. https://airtable.com/create/tokens → **Create new token**.
2. Name: `coded-workshops-b2b`.
3. **Scopes**: `data.records:write`. (Read is not needed by the API.)
4. **Access**: add the **Enterprise Deals** base only.
5. Copy the token — paste into Vercel below.

---

## 2) Vercel — env vars

Project Settings → Environment Variables (Production + Preview):

| Name                | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| `AIRTABLE_PAT`      | the token from step 1 *(required)*                             |
| `AIRTABLE_BASE_ID`  | `appciDr5ptR27XXr9` *(optional — same as the code default)*    |
| `AIRTABLE_TABLE_ID` | `tblHfbSdiyBrq4ga9` *(optional — same as the code default)*    |

Redeploy after adding env vars. The function is at [`api/inquiry.js`](api/inquiry.js)
and is auto-detected by Vercel on every push.

---

## 3) Airtable Automations — the email

Both automations live inside the Enterprise Deals base under **Automations →
Create automation**. They share the same trigger; they differ in the action.

### Automation A — confirmation email to the lead

**Trigger:** `When a record matches conditions`
- Table: `B2B Training Inquiries`
- Conditions: `Status` `is` `New`
- This fires once per new inquiry. (Using "is New" rather than "record created"
  means re-running the automation manually on an old row still works.)

**Action:** `Send email` (built-in — no Gmail connection required)
- **To:** insert the `Contact Email` field via the blue **+** token picker.
- **Bcc:** `enterprise@joincoded.com` (so the team gets a copy of every confirmation).
- **Reply-to:** `enterprise@joincoded.com`.
- **Subject:** type `We got your inquiry — ` then insert the `Programs of Interest`
  field via **+**.
- **Body:** switch the body editor's format toggle to **Markdown**, then paste
  the template below and replace every `{Field Name}` with a token from the
  **+** picker. The colored chips that appear are correct; plain typed braces
  do not substitute.

```markdown
**Thanks {Contact Name} — we got your inquiry.**

Someone from the CODED enterprise team will reply within **one business day**
with availability, group pricing, and the next steps for
**{Programs of Interest}**.

---

**What you sent us:**

- **Company:** {Company Name}
- **Program(s):** {Programs of Interest}
- **Team size & timing:** {Team Size & Timing}
- **Notes:** {Internal Notes}

---

Need to update anything or add context? Just reply to this email — it goes
straight to the enterprise inbox.

—
CODED Campus · Free Trade Zone, Kuwait
[coded.kw](https://coded.kw) · enterprise@joincoded.com
```

Test against the most recent record, confirm the email arrives, then **turn
the automation On** (toggle in the top-right of the automation editor).

#### Want the branded HTML version?

The built-in `Send email` action only supports Markdown. For the full HTML
design — same look as the site — swap the action for **`Send Gmail`**:

1. Replace the action with **Send Gmail** (Airtable connects to a Google Workspace account).
2. Sign in once to connect `enterprise@joincoded.com`.
3. Body format: **HTML**. Paste the template from
   [`docs/inquiry-confirmation.html`](docs/inquiry-confirmation.html).
4. In the editor, replace every `{Field Name}` with the matching field token via **+**.

The Gmail action sends from a real branded address and respects your domain's
SPF/DKIM — no separate ESP needed.

### Automation B — internal notification to the enterprise inbox

Same trigger as Automation A. Action:

- **To:** `enterprise@joincoded.com`
- **Subject:** `New B2B inquiry — ` + `Company Name` (token)
- **Body (markdown):**

```markdown
**New B2B inquiry — {Company Name}**

- **Source:** {Source}
- **Contact:** {Contact Name} · {Contact Email} · {Contact Phone}
- **Programs:** {Programs of Interest}
- **Team & timing:** {Team Size & Timing}
- **Page:** {Page URL}

**Their description:**
{Company Description}

**What they need:**
{Training Needs}

**Notes:**
{Internal Notes}

---
[Open the record in Airtable]({Airtable record URL})
```

For the `Airtable record URL`, click **+** in the body editor and pick
"Record URL" from the trigger's outputs.

Turn it on, and every new inquiry pings the enterprise inbox while the lead
gets their confirmation.

---

## 4) Local dev

The static site is served via `python3 server.py` (port 7333) but that
server does **not** run `/api/inquiry`. To test the end-to-end flow locally,
use `vercel dev`:

```sh
npm i -g vercel        # one-time
vercel link            # one-time, links to the Vercel project
vercel env pull        # pulls AIRTABLE_PAT into .env.local
vercel dev             # serves on localhost:3000 with /api/inquiry working
```

Without `vercel dev`, the forms still work as a UI — submissions hit a 404
and the UI falls back to "email us directly". That's expected.

---

## 5) Where things are wired

| Surface                       | File                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| Hero chatbot (4 steps)        | [assets/app.js](assets/app.js) → `setupHeroPrompt` / `submitHeroPrompt` |
| Per-program inquiry modal     | [assets/app.js](assets/app.js) → `openInquiryModal` / `setupInquiryModal` |
| Enterprise form (`/#/enterprise`) | [assets/app.js](assets/app.js) → `renderEnterpriseForm`         |
| Program-finder helper chat    | [assets/app.js](assets/app.js) → `setupHelperChat`                  |
| Inquiry modal markup          | [index.html](index.html) → `#inquiryModal`                          |
| Airtable write                | [api/inquiry.js](api/inquiry.js)                                    |
| Field-ID map                  | [api/inquiry.js](api/inquiry.js) → `FIELDS`                         |
| HTML email template           | [docs/inquiry-confirmation.html](docs/inquiry-confirmation.html)    |

---

## 6) Sanity checklist before going live

- [ ] `AIRTABLE_PAT` is set in Vercel (Production + Preview).
- [ ] Test inquiry from the live site lands in the Airtable table as a new row.
- [ ] The new row has `Status = New`, `Source = Hero Chatbot` (or the right source).
- [ ] Automation A fires → the lead receives the confirmation email.
- [ ] Automation B fires → `enterprise@joincoded.com` receives the internal notification.
- [ ] Both automations are toggled **On** in the editor.
- [ ] Add yourself as `Assignee` on a few test rows to confirm BD ownership flow.
