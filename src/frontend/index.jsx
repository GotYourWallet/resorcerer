import React, { useEffect, useMemo, useState, useCallback } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  DynamicTable,
  Heading,
  Inline,
  Label,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textfield,
  UserPicker,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { compressWeeks, isoWeek, weekRange, weekStart, weeksInYear } from '../shared/weeks.js';

const QUARTERS = [
  [1, 13],
  [14, 26],
  [27, 39],
  [40, 53],
];

const fmtDate = (d) => d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

function App() {
  const today = useMemo(() => isoWeek(new Date()), []);
  const [year, setYear] = useState(today.year);
  const [block, setBlock] = useState(Math.min(3, Math.floor((today.week - 1) / 13)));
  const [boot, setBoot] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { member, week }

  const run = useCallback(async (fn) => {
    try {
      setError(null);
      return await fn();
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    run(async () => setBoot(await invoke('bootstrap')));
    run(async () => setCustomers(await invoke('listCustomers')));
  }, [run]);

  useEffect(() => {
    if (boot) run(async () => setAssignments(await invoke('getAssignments', { year })));
  }, [boot, year, run]);

  const customerName = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.label])), [customers]);
  const maxWeek = weeksInYear(year);

  const saveCells = (member, weeks, customerIds) =>
    run(async () => {
      const data = await invoke('setCells', { year, accountId: member.accountId, weeks, customerIds });
      setAssignments((a) => ({ ...a, [member.accountId]: data }));
      setEditing(null);
    });

  if (!boot) return error ? <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage> : <Spinner />;

  return (
    <Stack space="space.200">
      <Inline space="space.200" alignBlock="center">
        <Heading size="large">Resource planner</Heading>
        <Button onClick={() => setYear(year - 1)}>{'<'}</Button>
        <Heading size="medium">{year}</Heading>
        <Button onClick={() => setYear(year + 1)}>{'>'}</Button>
        {!boot.canEdit && <Lozenge>Read only</Lozenge>}
      </Inline>
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      <Tabs id="main-tabs">
        <TabList>
          <Tab>By person</Tab>
          <Tab>By customer</Tab>
          <Tab>Settings</Tab>
        </TabList>
        <TabPanel>
          <PersonGrid
            members={boot.members}
            assignments={assignments}
            customerName={customerName}
            year={year}
            maxWeek={maxWeek}
            block={block}
            setBlock={setBlock}
            today={today}
            onEdit={(member, week) => boot.canEdit && setEditing({ member, week })}
          />
        </TabPanel>
        <TabPanel>
          <CustomerView members={boot.members} assignments={assignments} customerName={customerName} />
        </TabPanel>
        <TabPanel>
          <SettingsView boot={boot} setBoot={setBoot} run={run} onCustomersChanged={() =>
            run(async () => setCustomers(await invoke('listCustomers')))} />
        </TabPanel>
      </Tabs>
      {editing && (
        <CellModal
          editing={editing}
          year={year}
          maxWeek={maxWeek}
          customers={customers}
          current={assignments[editing.member.accountId]?.[editing.week] || []}
          onClose={() => setEditing(null)}
          onSave={saveCells}
        />
      )}
    </Stack>
  );
}

function PersonGrid({ members, assignments, customerName, year, maxWeek, block, setBlock, today, onEdit }) {
  if (!members.length) {
    return <SectionMessage><Text>No team members yet. Pick them in the Settings tab.</Text></SectionMessage>;
  }
  const [from, to] = QUARTERS[block];
  const weeks = weekRange(from, to, maxWeek);

  const head = {
    cells: [
      { key: 'who', content: 'Team member' },
      ...weeks.map((w) => ({
        key: `w${w}`,
        content: `${w === today.week && year === today.year ? '● ' : ''}W${w} ${fmtDate(weekStart(year, w))}`,
      })),
    ],
  };
  const rows = members.map((m) => ({
    key: m.accountId,
    cells: [
      { key: 'name', content: m.displayName },
      ...weeks.map((w) => {
        const ids = assignments[m.accountId]?.[w] || [];
        return {
          key: `w${w}`,
          content: (
            <Button appearance="subtle" onClick={() => onEdit(m, w)}>
              {ids.length ? ids.map((id) => customerName[id] || `#${id}`).join(', ') : '–'}
            </Button>
          ),
        };
      }),
    ],
  }));

  return (
    <Stack space="space.100">
      <Inline space="space.100">
        {QUARTERS.map(([a, b], i) => (
          <Button key={a} appearance={i === block ? 'primary' : 'default'} isDisabled={a > maxWeek} onClick={() => setBlock(i)}>
            {`W${a}-${Math.min(b, maxWeek)}`}
          </Button>
        ))}
      </Inline>
      <DynamicTable head={head} rows={rows} />
    </Stack>
  );
}

function CustomerView({ members, assignments, customerName }) {
  // customerId -> accountId -> weeks[]
  const byCustomer = {};
  for (const m of members) {
    for (const [week, ids] of Object.entries(assignments[m.accountId] || {})) {
      for (const id of ids) {
        ((byCustomer[id] ??= {})[m.accountId] ??= []).push(Number(week));
      }
    }
  }
  const ids = Object.keys(byCustomer).sort((a, b) => (customerName[a] || a).localeCompare(customerName[b] || b));
  if (!ids.length) return <Text>No assignments for this year yet.</Text>;

  const rows = ids.map((id) => ({
    key: id,
    cells: [
      { key: 'c', content: customerName[id] || `#${id}` },
      {
        key: 'p',
        content: (
          <Stack>
            {members
              .filter((m) => byCustomer[id][m.accountId])
              .map((m) => (
                <Text key={m.accountId}>{`${m.displayName}: ${compressWeeks(byCustomer[id][m.accountId])}`}</Text>
              ))}
          </Stack>
        ),
      },
    ],
  }));
  return (
    <DynamicTable
      head={{ cells: [{ key: 'c', content: 'Customer' }, { key: 'p', content: 'Who, and when' }] }}
      rows={rows}
    />
  );
}

function CellModal({ editing, year, maxWeek, customers, current, onClose, onSave }) {
  const options = useMemo(() => customers.map((c) => ({ label: c.label, value: c.id })), [customers]);
  const [selected, setSelected] = useState(options.filter((o) => current.includes(o.value)));
  const [from, setFrom] = useState(String(editing.week));
  const [to, setTo] = useState(String(editing.week));
  const weeks = weekRange(parseInt(from, 10) || editing.week, parseInt(to, 10) || editing.week, maxWeek);

  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>{`${editing.member.displayName} - ${year}`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.150">
          <Box>
            <Label labelFor="customers">Customers</Label>
            <Select
              inputId="customers"
              isMulti
              isSearchable
              options={options}
              value={selected}
              onChange={(v) => setSelected(v || [])}
              placeholder="Select customers"
            />
          </Box>
          <Inline space="space.150">
            <Box>
              <Label labelFor="from">From week</Label>
              <Textfield id="from" type="number" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Box>
            <Box>
              <Label labelFor="to">To week</Label>
              <Textfield id="to" type="number" value={to} onChange={(e) => setTo(e.target.value)} />
            </Box>
          </Inline>
          <Text>{`Applies to ${compressWeeks(weeks)}. Saving with no customer selected clears those weeks.`}</Text>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>Cancel</Button>
        <Button appearance="primary" onClick={() => onSave(editing.member, weeks, selected.map((s) => s.value))}>
          Save
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function SettingsView({ boot, setBoot, run, onCustomersChanged }) {
  const [accountIds, setAccountIds] = useState(boot.members.map((m) => m.accountId));
  const [objectTypeId, setObjectTypeId] = useState(boot.settings.objectTypeId);
  const [saved, setSaved] = useState(false);

  if (!boot.canEdit) return <Text>Only the team lead or a Jira administrator can change settings.</Text>;

  const save = () =>
    run(async () => {
      const members = await invoke('saveTeam', { accountIds });
      const settings = await invoke('saveSettings', { objectTypeId });
      setBoot({ ...boot, members, settings });
      onCustomersChanged();
      setSaved(true);
    });

  return (
    <Stack space="space.200">
      <Box>
        <Label labelFor="team">Team members (max 10)</Label>
        <UserPicker
          inputId="team"
          isMulti
          name="team"
          defaultValue={accountIds}
          onChange={(users) => setAccountIds((users || []).map((u) => u.id))}
        />
      </Box>
      <Box>
        <Label labelFor="objtype">Assets object type id of "Customer" (schema CRM)</Label>
        <Textfield id="objtype" value={objectTypeId} onChange={(e) => setObjectTypeId(e.target.value)} />
      </Box>
      <Inline space="space.100" alignBlock="center">
        <Button appearance="primary" onClick={save}>Save settings</Button>
        {saved && <Lozenge appearance="success">Saved</Lozenge>}
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
