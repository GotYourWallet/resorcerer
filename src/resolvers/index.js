import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { weeksInYear } from '../shared/weeks.js';

const MAX_TEAM = 10;
// CRM schema (id 1) -> "Customer" object type (id 1) on philipp.atlassian.net.
const DEFAULT_SETTINGS = { objectTypeId: '1' };

const resolver = new Resolver();

const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...((await kvs.get('settings')) || {}) });
const assignKey = (year, accountId) => `assign:${year}:${accountId}`;

async function jiraJson(res) {
  if (!res.ok) throw new Error(`Jira request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function isJiraAdmin() {
  const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  const body = await jiraJson(res);
  return Boolean(body.permissions?.ADMINISTER?.havePermission);
}

/** Editors: the lead (first person to save the team) and Jira administrators. */
async function canEdit(accountId) {
  const team = await kvs.get('team');
  if (team?.lead && team.lead === accountId) return true;
  return isJiraAdmin();
}

async function requireEditor(req) {
  if (!(await canEdit(req.context.accountId))) {
    throw new Error('Only the team lead or a Jira administrator can change assignments.');
  }
}

async function getWorkspaceId() {
  const cached = await kvs.get('workspaceId');
  if (cached) return cached;
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/assets/workspace`);
  const body = await jiraJson(res);
  const id = body.values?.[0]?.workspaceId;
  if (!id) throw new Error('No Assets workspace found on this site.');
  await kvs.set('workspaceId', id);
  return id;
}

async function getUser(accountId) {
  const res = await api.asUser().requestJira(route`/rest/api/3/user?accountId=${accountId}`);
  if (!res.ok) return { accountId, displayName: accountId };
  const u = await res.json();
  return { accountId, displayName: u.displayName, avatarUrl: u.avatarUrls?.['24x24'] };
}

resolver.define('bootstrap', async (req) => {
  const [team, settings, editable] = await Promise.all([
    kvs.get('team'),
    getSettings(),
    canEdit(req.context.accountId),
  ]);
  const members = await Promise.all((team?.accountIds || []).map(getUser));
  return { members, settings, canEdit: editable };
});

resolver.define('saveTeam', async (req) => {
  await requireEditor(req);
  const accountIds = [...new Set(req.payload.accountIds || [])];
  if (accountIds.length > MAX_TEAM) throw new Error(`A team can have at most ${MAX_TEAM} members.`);
  const existing = (await kvs.get('team')) || {};
  await kvs.set('team', { accountIds, lead: existing.lead || req.context.accountId });
  return Promise.all(accountIds.map(getUser));
});

resolver.define('saveSettings', async (req) => {
  await requireEditor(req);
  const objectTypeId = String(req.payload.objectTypeId || '').trim();
  if (!/^\d+$/.test(objectTypeId)) throw new Error('Object type id must be a number.');
  await kvs.set('settings', { objectTypeId });
  return { objectTypeId };
});

/** All customers (id + Name label) of the configured Assets object type. */
resolver.define('listCustomers', async () => {
  const { objectTypeId } = await getSettings();
  const workspaceId = await getWorkspaceId();
  const customers = [];
  for (let startAt = 0; ; ) {
    const res = await api.asUser().requestJira(
      route`/jsm/assets/workspace/${workspaceId}/v1/object/aql?startAt=${startAt}&maxResults=500&includeAttributes=false`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ qlQuery: `objectTypeId = ${objectTypeId}` }),
      },
    );
    const page = await jiraJson(res);
    for (const o of page.values || []) customers.push({ id: String(o.id), label: o.label });
    if (page.isLast !== false || !page.values?.length) break;
    startAt += page.values.length;
  }
  return customers.sort((a, b) => a.label.localeCompare(b.label));
});

/** { [accountId]: { [week]: customerId[] } } for the current team. */
resolver.define('getAssignments', async (req) => {
  const { year } = req.payload;
  const team = await kvs.get('team');
  const entries = await Promise.all(
    (team?.accountIds || []).map(async (id) => [id, (await kvs.get(assignKey(year, id))) || {}]),
  );
  return Object.fromEntries(entries);
});

/** Replace the customers of one person for several weeks at once (empty list clears). */
resolver.define('setCells', async (req) => {
  await requireEditor(req);
  const { year, accountId, weeks, customerIds } = req.payload;
  const team = await kvs.get('team');
  if (!team?.accountIds?.includes(accountId)) throw new Error('Unknown team member.');
  const max = weeksInYear(year);
  const key = assignKey(year, accountId);
  const data = (await kvs.get(key)) || {};
  for (const w of weeks) {
    if (!Number.isInteger(w) || w < 1 || w > max) throw new Error(`Invalid week ${w} for ${year}.`);
    if (customerIds.length) data[w] = [...new Set(customerIds)];
    else delete data[w];
  }
  await kvs.set(key, data);
  return data;
});

export const handler = resolver.getDefinitions();
