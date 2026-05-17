/**
 * Tiny Airtable HTTP client. Wraps the Web + Metadata APIs with the bits we use.
 *
 * Env vars:
 *   CATALOG_AIRTABLE_PAT   Personal Access Token. Needs scopes:
 *                            schema.bases:write   (setup)
 *                            schema.bases:read    (setup, sync)
 *                            data.records:read    (sync)
 *                            data.records:write   (seed)
 *   CATALOG_AIRTABLE_BASE_ID  Optional. If unset, setup will prompt you to add it after creating the base.
 *   CATALOG_AIRTABLE_WORKSPACE_ID  Required only for setup (creates a new base in this workspace).
 */

const PAT = process.env.CATALOG_AIRTABLE_PAT;
const META = "https://api.airtable.com/v0/meta";
const DATA = "https://api.airtable.com/v0";

function requirePat() {
  if (!PAT) {
    throw new Error(
      "CATALOG_AIRTABLE_PAT is not set. Create a Personal Access Token at " +
      "https://airtable.com/create/tokens with these scopes:\n" +
      "  - schema.bases:read\n  - schema.bases:write\n" +
      "  - data.records:read\n  - data.records:write\n" +
      "Then export it: `export CATALOG_AIRTABLE_PAT=patXXXXXXXX...`",
    );
  }
}

async function call(url, { method = "GET", body, expectJson = true } = {}) {
  requirePat();
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${PAT}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text();
    const err = new Error(`Airtable ${method} ${url} → ${r.status}: ${text}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return expectJson ? r.json() : r;
}

// ── Metadata API ──────────────────────────────────────────────────────────────

const meta = {
  async listWorkspaces() {
    return call(`${META}/workspaces`);
  },
  async createBase(workspaceId, name, tables) {
    return call(`${META}/bases`, {
      method: "POST",
      body: { workspaceId, name, tables },
    });
  },
  async listBases() {
    return call(`${META}/bases`);
  },
  async getBaseSchema(baseId) {
    return call(`${META}/bases/${baseId}/tables`);
  },
  async createTable(baseId, table) {
    return call(`${META}/bases/${baseId}/tables`, {
      method: "POST",
      body: table,
    });
  },
  async createField(baseId, tableId, field) {
    return call(`${META}/bases/${baseId}/tables/${tableId}/fields`, {
      method: "POST",
      body: field,
    });
  },
};

// ── Data API ──────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const data = {
  async listAll(baseId, tableId, { pageSize = 100 } = {}) {
    const all = [];
    let offset;
    do {
      const url = new URL(`${DATA}/${baseId}/${tableId}`);
      url.searchParams.set("pageSize", String(pageSize));
      if (offset) url.searchParams.set("offset", offset);
      const r = await call(url.toString());
      all.push(...r.records);
      offset = r.offset;
    } while (offset);
    return all;
  },
  // NOTE: typecast defaults to true (for singleSelect string→option coercion),
  // but callers writing attachment fields should pass typecast:false — with
  // typecast:true Airtable drops the Image attachment array silently.
  async createRecords(baseId, tableId, records, { typecast = true } = {}) {
    const created = [];
    for (const batch of chunk(records, 10)) {
      const r = await call(`${DATA}/${baseId}/${tableId}`, {
        method: "POST",
        body: { records: batch, typecast },
      });
      created.push(...r.records);
      // Stay well below the 5 req/sec/base rate limit.
      await new Promise((res) => setTimeout(res, 250));
    }
    return created;
  },
  async updateRecords(baseId, tableId, records, { typecast = true } = {}) {
    const updated = [];
    for (const batch of chunk(records, 10)) {
      const r = await call(`${DATA}/${baseId}/${tableId}`, {
        method: "PATCH",
        body: { records: batch, typecast },
      });
      updated.push(...r.records);
      await new Promise((res) => setTimeout(res, 250));
    }
    return updated;
  },
};

module.exports = { meta, data, requirePat };
