// The Everyday Prize List: free sample MCP connector.
// Gene, 2026-11-05: "Build the mcp connector" (free sample: today's top 10, full list by email).
// Stateless MCP over Streamable HTTP. Every POST gets one JSON answer. No sessions, no storage.
const SITE = 'https://www.coffeeshopoffice.com';
const LIST_URL = SITE + '/prizes/today/';
const SIGNUP_URL = SITE + '/prizes/';
const MAX_SAMPLE = 10;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'get_todays_top_sweepstakes',
    title: "Today's top sweepstakes",
    description: "Returns the biggest sweepstakes on today's Everyday Prize List (up to 10), with prize value, sponsor and the sponsor's own entry link. Sweepstakes are free to enter; check each official rules page before entering.",
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_SAMPLE, description: 'How many to return (1 to 10). Default 10.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'get_full_list_signup',
    title: 'Get the full daily list',
    description: 'Tells the user how to get the full Everyday Prize List (every sweepstakes, every day) by email.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

function decode(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Internal notes such as "sponsor unconfirmed" or "(legal name not verified)" stay off the answer.
function cleanSponsor(s) {
  const t = s.replace(/\s*\([^)]*not verified[^)]*\)/gi, '').trim();
  return !t || /unconfirmed|unknown/i.test(t) ? null : t;
}

function parseList(html) {
  const head = /<p class="eyebrow">DAILY LIST<\/p>[\s\S]*?(\d[\d,]*) sweepstakes, worth (\$[\d,]+) in prizes\. ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(html);
  const items = [];
  const re = /<div class="email-preview-entry">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1];
    const a = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/strong>(?:,\s*([^<]*))?/.exec(block);
    if (!a) continue;
    const v = /Prize value: \$([\d,]+)/.exec(block);
    const link = a[1];
    if (!/^https?:\/\//i.test(link)) continue;
    items.push({
      name: decode(a[2]),
      sponsor: cleanSponsor(decode(a[3] || '')),
      prize_value_usd: v ? Number(v[1].replace(/,/g, '')) : null,
      age_21_plus: />\s*21\+\s*</.test(block),
      entry_link: link,
    });
  }
  return { date: head ? head[3] : null, count: head ? Number(head[1].replace(/,/g, '')) : items.length, total: head ? head[2] : null, items };
}

async function loadList() {
  const r = await fetch(LIST_URL, { headers: { 'user-agent': 'everyday-prize-list-mcp/1.0' }, redirect: 'follow' });
  if (!r.ok) throw new Error('list page returned HTTP ' + r.status);
  return parseList(await r.text());
}

function text(t, structured) {
  const out = { content: [{ type: 'text', text: t }] };
  if (structured) out.structuredContent = structured;
  return out;
}

async function callTool(name, args) {
  if (name === 'get_full_list_signup') {
    return text(`The full Everyday Prize List comes out every day by email. It is free at launch, needs no card, and you can unsubscribe anytime. Sign up here: ${SIGNUP_URL}`, { signup_url: SIGNUP_URL });
  }
  if (name === 'get_todays_top_sweepstakes') {
    let limit = Number(args && args.limit);
    if (!Number.isInteger(limit) || limit < 1) limit = MAX_SAMPLE;
    limit = Math.min(limit, MAX_SAMPLE);
    const list = await loadList();
    const top = list.items.slice(0, limit);
    const lines = top.map((s, i) => `${i + 1}. ${s.name}${s.sponsor ? ` (${s.sponsor})` : ''}: ${s.prize_value_usd != null ? '$' + s.prize_value_usd.toLocaleString('en-US') : 'value not listed'}${s.age_21_plus ? ', 21+ only' : ''}. Enter: ${s.entry_link}`);
    const more = list.count > top.length ? list.count - top.length : 0;
    const t = `The Everyday Prize List${list.date ? ' for ' + list.date : ''}: top ${top.length} of ${list.count} sweepstakes${list.total ? ` (${list.total} in prizes in all)` : ''}.\n\n${lines.join('\n')}\n\n${more ? `${more} more are on today's full list. ` : ''}Get the full list free by email every day: ${SIGNUP_URL}\nCheck each sweepstakes' official rules before you enter.`;
    return text(t, { date: list.date, total_on_list: list.count, total_prize_value: list.total, sweepstakes: top, full_list_signup: SIGNUP_URL });
  }
  return null;
}

async function handle(msg) {
  const id = msg && msg.id;
  const isNote = id === undefined || id === null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: isNote ? null : id, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Invalid Request');
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'everyday-prize-list', title: 'The Everyday Prize List', version: '1.0.0' },
        instructions: "Use get_todays_top_sweepstakes when someone asks which sweepstakes or giveaways they can enter today. Always include the entry links and the signup link for the full list.",
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const p = msg.params || {};
      try {
        const r = await callTool(p.name, p.arguments || {});
        if (!r) return err(-32602, 'Unknown tool: ' + p.name);
        return ok(r);
      } catch (e) {
        return ok({ isError: true, content: [{ type: 'text', text: "Today's list could not be loaded. Please try again in a few minutes, or see " + LIST_URL }] });
      }
    }
    default:
      if (isNote) return null; // notifications/initialized and others need no answer
      return err(-32601, 'Method not found: ' + msg.method);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method === 'GET') {
    if (String(req.headers.accept || '').includes('text/event-stream')) { res.statusCode = 405; return res.end(); }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('The Everyday Prize List MCP connector. Add this URL to Claude as a custom connector: https://' + req.headers.host + '/mcp\n');
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  let body = req.body;
  if (body === undefined || typeof body === 'string' || Buffer.isBuffer(body)) {
    let raw = body;
    if (raw === undefined) { raw = ''; for await (const c of req) raw += c; }
    try { body = JSON.parse(String(raw)); } catch { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); }
  }
  const batch = Array.isArray(body);
  const answers = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!answers.length) { res.statusCode = 202; return res.end(); }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(batch ? answers : answers[0]));
};
module.exports.parseList = parseList;
module.exports.handle = handle;
