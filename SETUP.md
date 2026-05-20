# CODED Training For Companies — Setup

This site collects B2B training inquiries (hero chatbot + per-program form) and
writes them to Airtable via a Vercel Serverless Function. Airtable Automations
then send confirmation + lead-notification emails.

## 1) Airtable

A table `B2B Training Inquiries` has already been created in the
**Enterprise Deals** base (`appciDr5ptR27XXr9`, table `tblHfbSdiyBrq4ga9`).
Fields are wired by ID in [api/inquiry.js](api/inquiry.js).

### Personal Access Token

1. https://airtable.com/create/tokens → **Create new token**.
2. Name: `coded-workshops-b2b`.
3. Scopes: `data.records:write` (`data.records:read` is optional).
4. Access: add the **Enterprise Deals** base only.
5. Copy the token — you'll paste it into Vercel below.

### Email automations (UI only, no API)

Airtable's Automations editor is UI-only. Open the base and add **two**
automations under `Automations` → `Create automation`:

**A. Confirmation email to the inquirer**
- Trigger: `When a record is created` → table `B2B Training Inquiries`.
- Condition (optional): `Contact Email` is not empty.
- Action: `Send email`.
  - To: `{Contact Email}` (use the field-picker).
  - Subject: `Thanks for reaching out — CODED For Companies`.
  - Body (HTML or plain):
    ```
    Hi {Contact Name},

    Thanks for telling us about {Company Name} — we've received your inquiry
    and someone from the CODED Enterprise team will be in touch within one
    business day to share availability, group pricing, and next steps.

    What you shared:
    • Company: {Company Description}
    • Needs: {Training Needs}
    • Team & timing: {Team Size & Timing}
    • Programs of interest: {Programs of Interest}

    Talk soon,
    CODED For Companies
    enterprise@joincoded.com
    ```

**B. Internal notification to the sales inbox**
- Trigger: same as above.
- Action: `Send email`.
  - To: `enterprise@joincoded.com` (or any internal alias).
  - Subject: `New B2B inquiry — {Company Name}`.
  - Body: link to the record + all the chatbot fields. Use the Airtable
    Markdown helper field if you want richer formatting.

Turn both automations **On** when you're ready to go live.

## 2) Vercel

The site already deploys via Vercel. The new serverless function lives at
[api/inquiry.js](api/inquiry.js); Vercel auto-detects it on next push.

### Environment variables

Project Settings → Environment Variables (Production + Preview):

| Name                 | Value                                 |
| -------------------- | ------------------------------------- |
| `AIRTABLE_PAT`       | the token from step 1                 |
| `AIRTABLE_BASE_ID`   | `appciDr5ptR27XXr9` (optional — already the default) |
| `AIRTABLE_TABLE_ID`  | `tblHfbSdiyBrq4ga9` (optional — already the default) |

Redeploy after adding env vars.

## 3) Local dev

The static site is served via `python3 server.py` (port 7333) but the
Python server does **not** run the `/api/inquiry` function. To test the
end-to-end inquiry locally, use `vercel dev` (it serves both the static
files and the function with the same env vars).

```sh
npm i -g vercel        # one-time
vercel link            # one-time, links to the Vercel project
vercel env pull        # pulls AIRTABLE_PAT into .env.local
vercel dev             # serves on localhost:3000 with /api/inquiry working
```

Without `vercel dev`, the chatbot and modal still work as a UI; submissions
will hit the `/api/inquiry` 404 and fall back to the "email us directly"
message — that's expected.

## 4) Where things are wired

| Surface                       | File                                          |
| ----------------------------- | --------------------------------------------- |
| Hero chatbot (3 questions)    | [assets/app.js](assets/app.js) → `setupHeroChat` |
| Inquiry modal (per program)   | [assets/app.js](assets/app.js) → `openInquiryModal` |
| Modal markup                  | [index.html](index.html) → `#inquiryModal`    |
| Catalog card (minimal)        | [assets/app.js](assets/app.js) → `renderCard` |
| Airtable write                | [api/inquiry.js](api/inquiry.js)              |
| Field IDs (Airtable mapping)  | [api/inquiry.js](api/inquiry.js) → `FIELDS`   |
