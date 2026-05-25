// Test cockpit + AI sales-handoff endpoints (Mini CRM tab)
// Run: node scripts/test-cockpit-endpoints.mjs
import jwt from 'jsonwebtoken';

const USER_ID = '55ae009c-4d3a-4775-937d-e765f5af7ff7';
const ORG_ID = '50d7a1a4-5eec-42f3-a077-0ef7770d834c';
const API = 'http://localhost:3000/api/v1';

const secret = process.env.JWT_SECRET || 'devsecret-changeme-min-32-chars-long-please';
const token = jwt.sign({ userId: USER_ID, orgId: ORG_ID, role: 'owner' }, secret, { expiresIn: '5m' });

async function call(method, path, body) {
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

console.log('=== Cockpit + Sales-Handoff endpoint smoke test ===\n');

// 1. Tìm 1 contact bất kỳ để test
const contactsRes = await call('GET', '/contacts?limit=5');
console.log('[GET /contacts?limit=5] status=' + contactsRes.status);
if (contactsRes.status !== 200) {
  console.error('Cannot list contacts. Stop.');
  process.exit(1);
}
const contacts = contactsRes.data.contacts || contactsRes.data;
if (!contacts?.length) {
  console.error('No contacts found in this org.');
  process.exit(1);
}
const contactId = contacts[0].id;
console.log('  → Using contactId=' + contactId + ' (' + (contacts[0].fullName || contacts[0].crmName || 'no name') + ')');

// 2. GET /contacts/:id/cockpit
console.log('\n[GET /contacts/:id/cockpit]');
const cockpit = await call('GET', `/contacts/${contactId}/cockpit`);
console.log('  status=' + cockpit.status);
if (cockpit.status === 200) {
  console.log('  contactId    = ' + cockpit.data.contactId);
  console.log('  fullName     = ' + cockpit.data.fullName);
  console.log('  priorityScore= ' + cockpit.data.priorityScore);
  console.log('  pattern      = ' + cockpit.data.engagementPattern);
  console.log('  trend        = ' + cockpit.data.engagementTrend);
  console.log('  lastInboundAt= ' + cockpit.data.lastInboundAt);
  console.log('  nextAppt     = ' + JSON.stringify(cockpit.data.nextAppointment));
  console.log('  getflyLink   = ' + JSON.stringify(cockpit.data.getflyLink));
  console.log('  assigned     = ' + JSON.stringify(cockpit.data.assignedUser));
} else {
  console.error('  ERROR: ' + JSON.stringify(cockpit.data));
}

// 3. GET /contacts/:id/teammates
console.log('\n[GET /contacts/:id/teammates]');
const teammates = await call('GET', `/contacts/${contactId}/teammates`);
console.log('  status=' + teammates.status);
if (teammates.status === 200) {
  console.log('  total teammates = ' + (teammates.data.teammates?.length ?? 0));
  for (const t of (teammates.data.teammates || []).slice(0, 3)) {
    console.log(`    - nick="${t.nick.displayName}" owner="${t.owner?.fullName}" in=${t.totalInbound} out=${t.totalOutbound} lastIn=${t.lastInboundAt}`);
  }
} else {
  console.error('  ERROR: ' + JSON.stringify(teammates.data));
}

// 4. POST /ai/sales-handoff-message (nếu có teammate)
if (teammates.status === 200 && teammates.data.teammates?.length > 0) {
  const target = teammates.data.teammates.find((t) => t.owner?.id && t.owner.id !== USER_ID) || teammates.data.teammates[0];
  if (target?.owner?.id) {
    console.log('\n[POST /ai/sales-handoff-message]');
    const handoff = await call('POST', '/ai/sales-handoff-message', {
      contactId,
      targetUserId: target.owner.id,
      targetZaloAccountId: target.zaloAccountId,
    });
    console.log('  status=' + handoff.status);
    if (handoff.status === 200) {
      console.log('  source = ' + handoff.data.source);
      console.log('  content= ' + handoff.data.content);
    } else {
      console.error('  ERROR: ' + JSON.stringify(handoff.data));
    }
  } else {
    console.log('\n[POST /ai/sales-handoff-message] SKIP — no teammate có owner User');
  }
}

console.log('\n=== Done ===');
