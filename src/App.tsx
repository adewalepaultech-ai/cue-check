import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  LayoutDashboard,
  ClipboardList,
  Users,
  Database,
  FileSpreadsheet,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  History,
  ListChecks,
  CalendarDays,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  X,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from './lib/supabase';

const initialItems = [
  'Attendance',
  'Video recording',
  'Output monitoring across platforms',
  'TV screen display',
  'Sound card charging',
  'Sound input Telegram',
  'Sound input Transcript',
  'Sound input OBS',
  'Sound check directly from V8',
  'Facebook stream camera check',
  'Data speed and balance check',
  'Video recording stopped',
  'Telegram stopped',
  'Sermon transcript stopped',
  'Sermon transcript audio downloaded',
  'Sermon transcript text downloaded',
  'Stage light',
  'Service Timer',
  'Gadget Packed',
  'Start Facebook Live',
  'Start Telegram',
  'Start Transcript',
  'Charge PC',
];
const storeKey = 'cuecheck-v1';
const readStore = () => {
  try {
    return JSON.parse(localStorage.getItem(storeKey) || '{}');
  } catch {
    return {};
  }
};
const saveStore = v => localStorage.setItem(storeKey, JSON.stringify(v));
const dateLabel = d =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
function Workspace({ user }) {
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [accountRole, setAccountRole] = useState(null);
  const [staffProfiles, setStaffProfiles] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('cuecheck-theme') || 'dark');
  const [data, setData] = useState(() => ({
    items: initialItems,
    checks: [],
    settings: {
      department: 'MEDIA DEPARTMENT',
      reminder: 'Start a check at least 60 minutes before doors open.',
    },
    ...readStore(),
  }));
  const [page, setPage] = useState('Run a check');
  const [active, setActive] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [service, setService] = useState('Sunday Service');
  const [checkName, setCheckName] = useState('');
  const [checkDate, setCheckDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [checkTime, setCheckTime] = useState('07:30');
  const [filter, setFilter] = useState('All');
  const [newItem, setNewItem] = useState('');
  const [notice, setNotice] = useState('');
  const [programName, setProgramName] = useState('');
  const [programTasks, setProgramTasks] = useState('');
  const [editingProgramId, setEditingProgramId] = useState(null);
  const [templateItemsOverride, setTemplateItemsOverride] = useState(null);
  useEffect(() => {
    let alive = true;
    const loadCloud = async () => {
      try {
        const [{ data: config, error: configError }, { data: rows, error: checksError }, { data: profile }] = await Promise.all([
          supabase.from('cuecheck_config').select('data').eq('id', true).maybeSingle(),
          supabase.from('cuecheck_checks').select('id,payload').order('created_at', { ascending: false }),
          supabase.from('cuecheck_profiles').select('role').eq('id', user.id).maybeSingle(),
        ]);
        if (configError) throw configError;
        if (checksError) throw checksError;
        if (!alive) return;
        setAccountRole(profile?.role || 'staff');
        const { data: auditRows, error: auditLoadError } = await supabase.from('cuecheck_audit').select('*').order('created_at', { ascending: false }).limit(300);
        if (!auditLoadError && alive) setAuditEvents(auditRows || []);
        const local = readStore();
        if (!config && (!rows || rows.length === 0)) {
          const seedConfig = {
            items: local.items || initialItems,
            settings: local.settings || { department: 'MEDIA DEPARTMENT', reminder: 'Start a check at least 60 minutes before doors open.' },
            specialPrograms: local.specialPrograms || [],
          };
          if (profile?.role === 'admin') {
            const { error: seedError } = await supabase.from('cuecheck_config').upsert({ id: true, data: seedConfig, updated_by: user.id });
            if (seedError) throw seedError;
          }
          if ((local.checks || []).length) {
            const { error: seedChecksError } = await supabase.from('cuecheck_checks').upsert(
              local.checks.map(check => ({ id: check.id, payload: { ...check, checkerEmail: check.checkerEmail || user.email || '' }, updated_by: user.id }))
            );
            if (seedChecksError) throw seedChecksError;
            setData({ ...seedConfig, checks: local.checks });
          } else {
            setData({ ...seedConfig, checks: [] });
          }
        } else {
          let cloudRows = rows || [];
          // Recover locally saved service checks if the shared checks table is still empty.
          // This does not overwrite existing cloud records.
          if (cloudRows.length === 0 && (local.checks || []).length > 0) {
            const localRows = local.checks.map(check => ({
              id: check.id,
              payload: { ...check, checkerEmail: check.checkerEmail || user.email || '' },
              updated_by: user.id,
            }));
            const { error: importError } = await supabase
              .from('cuecheck_checks')
              .upsert(localRows);
            if (importError) throw importError;
            cloudRows = localRows.map(row => ({ payload: row.payload }));
          }
          setData({
            items: config?.data?.items || initialItems,
            settings: config?.data?.settings || { department: 'MEDIA DEPARTMENT', reminder: 'Start a check at least 60 minutes before doors open.' },
            specialPrograms: config?.data?.specialPrograms || [],
            checks: cloudRows.map(row => row.payload).filter(Boolean),
          });
        }
        setCloudReady(true);
      } catch (error) {
        if (alive) setCloudError(error.message || 'Could not load shared Cue Check data. Check that the Supabase SQL setup has been completed.');
      }
    };
    loadCloud();
    const channel = supabase.channel('cuecheck-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuecheck_checks' }, payload => {
        if (!alive) return;
        // Our own writes are already reflected in local state. Re-fetching the
        // whole table here can replace a fresh click with an older snapshot.
        const row = payload.new;
        if (row?.updated_by === user.id) return;
        if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id;
          if (deletedId) setData(current => ({ ...current, checks: current.checks.filter(check => check.id !== deletedId) }));
          return;
        }
        if (row?.id && row?.payload) {
          setData(current => ({
            ...current,
            checks: [row.payload, ...current.checks.filter(check => check.id !== row.id)],
          }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuecheck_config' }, async payload => {
        if (!alive || payload.new?.updated_by === user.id) return;
        const { data: config } = await supabase.from('cuecheck_config').select('data').eq('id', true).maybeSingle();
        if (alive && config?.data) setData(current => ({ ...current, ...config.data }));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [user.id]);
  useEffect(() => {
    if (accountRole !== 'admin') return;
    let alive = true;
    const loadProfiles = async () => {
      const { data, error } = await supabase
        .from('cuecheck_profiles')
        .select('id,email,role,approval_status')
        .order('email');
      if (!alive) return;
      if (error) setCloudError(error.message);
      else setStaffProfiles(data || []);
    };
    loadProfiles();
    const channel = supabase
      .channel(`cuecheck-admin-profiles-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuecheck_profiles' }, loadProfiles)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [accountRole, user.id]);
  const changeStaffRole = async (id, role) => {
    const { error } = await supabase.from('cuecheck_profiles').update({ role }).eq('id', id);
    if (error) setCloudError(error.message);
    else setStaffProfiles(list => list.map(profile => profile.id === id ? { ...profile, role } : profile));
  };
  const changeApprovalStatus = async (id, approval_status) => {
    const { error } = await supabase.from('cuecheck_profiles').update({ approval_status }).eq('id', id);
    if (error) setCloudError(error.message);
    else setStaffProfiles(list => list.map(profile => profile.id === id ? { ...profile, approval_status } : profile));
  };
  const deleteStaffAccount = async profile => {
    if (!profile || profile.id === user.id || profile.role === 'admin') return;
    const confirmed = window.confirm(`Permanently delete ${profile.email || 'this staff account'}? They will no longer be able to sign in. This cannot be undone.`);
    if (!confirmed) return;
    const { error } = await supabase.rpc('cuecheck_delete_user', { target_user_id: profile.id });
    if (error) {
      setCloudError(error.message || 'Could not delete this account.');
      return;
    }
    setStaffProfiles(list => list.filter(item => item.id !== profile.id));
  };
  const pendingProfiles = staffProfiles.filter(profile => profile.approval_status === 'pending');
  const writeAudit = async (action, checkId = null, details = {}) => {
    const { data: savedEvent, error } = await supabase.from('cuecheck_audit').insert({
      actor_id: user.id, actor_email: user.email || '', action, check_id: checkId, details,
    }).select().single();
    if (error) { setCloudError(error.message || 'Could not save the activity record. Apply the Cue Check audit migration.'); return; }
    setAuditEvents(events => [savedEvent, ...events].slice(0, 300));
  };
  const exportBackup = async () => {
    const backup = {
      format: 'cuecheck-backup', version: 1, exportedAt: new Date().toISOString(), exportedBy: user.email || '',
      config: { items: data.items, settings: data.settings, specialPrograms: data.specialPrograms || [] },
      checks: data.checks,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `cue-check-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    await writeAudit('backup_exported', null, { checks: data.checks.length });
  };
  const restoreBackup = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setBackupBusy(true);
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== 'cuecheck-backup' || !Array.isArray(backup.checks) || !Array.isArray(backup.config?.items) || !backup.config?.settings)
        throw new Error('This file is not a valid Cue Check backup.');
      if (!window.confirm(`Restore ${backup.checks.length} service checks and checklist settings? Matching IDs will be updated; other cloud records will remain.`)) return;
      const config = { items: backup.config.items, settings: backup.config.settings, specialPrograms: Array.isArray(backup.config.specialPrograms) ? backup.config.specialPrograms : [] };
      const { error: configError } = await supabase.from('cuecheck_config').upsert({ id: true, data: config, updated_by: user.id });
      if (configError) throw configError;
      if (backup.checks.length) {
        const rows = backup.checks.map(check => {
          if (!check?.id || !Array.isArray(check.entries)) throw new Error('The backup contains an invalid service check.');
          return { id: check.id, payload: { ...check, checkerEmail: check.checkerEmail || user.email || '' }, updated_by: user.id };
        });
        const { error: checksError } = await supabase.from('cuecheck_checks').upsert(rows);
        if (checksError) throw checksError;
      }
      setData({ ...config, checks: backup.checks });
      await writeAudit('backup_restored', null, { checks: backup.checks.length, source: file.name });
      setNotice('Backup restored. Cloud records not included in the backup have been kept.');
    } catch (error) { setCloudError(error.message || 'Could not restore this backup.'); }
    finally { setBackupBusy(false); event.target.value = ''; }
  };
  const downloadStaffReport = () => {
    const rows = [['Staff', 'Checks', 'Ready', 'Average completion', 'Latest service'],
      ...staffPerformance.map(person => [person.name, person.checks, person.ready, `${person.average}%`, person.latest || ''])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `cue-check-staff-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };
  useEffect(() => {
    // Do not sync anything until the user's role has been loaded from Supabase.
    if (!cloudReady || !accountRole) return;
    saveStore(data);
    const persist = async () => {
      const config = { items: data.items, settings: data.settings, specialPrograms: data.specialPrograms || [] };
      const [{ error: configError }, { error: checksError }] = await Promise.all([
        accountRole === 'admin'
          ? supabase.from('cuecheck_config').upsert({ id: true, data: config, updated_by: user.id })
          : Promise.resolve({ error: null }),
        data.checks.length
          ? supabase.from('cuecheck_checks').upsert(data.checks.map(check => ({ id: check.id, payload: { ...check, checkerEmail: check.checkerEmail || user.email || '' }, updated_by: user.id })))
          : Promise.resolve({ error: null }),
      ]);
      if (configError || checksError) setCloudError((configError || checksError).message);
      else setCloudError('');
    };
    const timer = window.setTimeout(persist, 350);
    return () => window.clearTimeout(timer);
  }, [data, cloudReady, user.id, user.email, accountRole]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cuecheck-theme', theme);
  }, [theme]);
  const current = data.checks.find(c => c.id === active);
  const completed = current?.entries.filter(e => e.done).length || 0;
  const pct = current
    ? Math.round((completed / Math.max(current.entries.length, 1)) * 100)
    : 0;
  const canFinalize = Boolean(current && pct >= 40);
  const dashboardMetrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const total = data.checks.length;
    const ready = data.checks.filter(check => check.ready).length;
    const average = total ? Math.round(data.checks.reduce((sum, check) => sum + (check.entries.length ? check.entries.filter(entry => entry.done).length / check.entries.length : 0), 0) / total * 100) : 0;
    return { total, ready, open: total - ready, average,
      delayed: data.checks.filter(check => !check.ready && check.date < today).length,
      thisMonth: data.checks.filter(check => check.date?.slice(0, 7) === today.slice(0, 7)).length };
  }, [data.checks]);
  const staffPerformance = useMemo(() => {
    const groups = new Map();
    data.checks.forEach(check => {
      const key = check.checkerEmail || check.checker || 'Unassigned';
      const person = groups.get(key) || { name: check.checker || key, checks: 0, ready: 0, progressTotal: 0, latest: '' };
      person.checks += 1; if (check.ready) person.ready += 1;
      person.progressTotal += check.entries?.length ? check.entries.filter(entry => entry.done).length / check.entries.length : 0;
      if (!person.latest || (check.date || '') > person.latest) person.latest = check.date || '';
      groups.set(key, person);
    });
    return [...groups.values()].map(person => ({ ...person, average: person.checks ? Math.round(person.progressTotal / person.checks * 100) : 0 })).sort((a,b) => b.checks - a.checks);
  }, [data.checks]);
  const updateCheck = patch =>
    setData(d => ({
      ...d,
      checks: d.checks.map(c => (c.id === active ? { ...c, ...patch } : c)),
    }));
  const startCheck = e => {
    e.preventDefault();
    if (!checkName.trim()) return;
    const c = {
      id: crypto.randomUUID(),
      service: service.trim() || 'Service',
      checker: checkName.trim(),
      checkerEmail: '',
      date: checkDate,
      time: checkTime,
      createdAt: new Date().toISOString(),
      ready: false,
      entries: (templateItemsOverride || data.items).map((label, i) => ({
        id: String(i),
        label,
        done: false,
        note: '',
      })),
    };
    setData(d => ({ ...d, checks: [c, ...d.checks] }));
    writeAudit('service_started', c.id, { service: c.service, date: c.date, checker: c.checker });
    setActive(c.id);
    setTemplateItemsOverride(null);
    setShowNew(false);
    setPage('Run a check');
  };
  const toggleEntry = id => {
    const entry = current?.entries.find(item => item.id === id);
    if (entry) writeAudit(entry.done ? 'task_unchecked' : 'task_completed', current.id, { task: entry.label });
    setData(d => ({
      ...d,
      checks: d.checks.map(check => check.id === active
        ? { ...check, entries: check.entries.map(item => item.id === id ? { ...item, done: !item.done } : item) }
        : check),
    }));
  };
  const updateNote = (id, note) =>
    setData(d => ({
      ...d,
      checks: d.checks.map(check =>
        check.id === active
          ? { ...check, entries: check.entries.map(entry =>
              entry.id === id ? { ...entry, note } : entry
            ) }
          : check
      ),
    }));
  const download = () => {
    if (!current) return;
    if (!canFinalize) {
      setNotice(`PDF download is locked. Complete at least 40% of this checklist first. Your current progress is ${pct}%.`);
      return;
    }
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const left = 16;
    const width = 178;
    let y = 20;
    const addText = (value, size = 10, bold = false) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(String(value ?? ''), width);
      const lineHeight = size * 0.42 + 2;
      if (y + lines.length * lineHeight > 280) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(lines, left, y);
      y += lines.length * lineHeight + 2;
    };
    addText(data.settings.department, 11, true);
    addText('SERVICE READINESS REPORT', 18, true);
    addText(`Service: ${current.service}`, 11, true);
    addText(`Date: ${dateLabel(current.date)}    Start time: ${current.time}`);
    addText(`Checked by: ${current.checker}`, 10, true);
    if (current.checkerEmail) addText(`Account email: ${current.checkerEmail}`);
    addText(`Progress: ${current.entries.filter(item => item.done).length}/${current.entries.length} activities completed (${pct}%)`);
    addText(`Status: ${current.ready ? 'READY' : 'IN PROGRESS'}`);
    addText(`Outstanding activities: ${current.entries.filter(item => !item.done).length}`);
    addText(`Report generated: ${new Date().toLocaleString()}`);
    y += 3;
    pdf.setDrawColor(170);
    pdf.line(left, y, left + width, y);
    y += 8;
    addText('ACTIVITY CHECKLIST', 12, true);
    current.entries.forEach((item, index) => {
      addText(`${index + 1}. [${item.done ? 'COMPLETED' : 'PENDING'}] ${item.label}`, 10, true);
      if (item.note?.trim()) addText(`   Note: ${item.note.trim()}`, 9);
    });
    const outstanding = current.entries.filter(item => !item.done);
    addText(`OUTSTANDING ACTIVITIES: ${outstanding.length}`, 11, true);
    if (outstanding.length) outstanding.forEach(item => addText(`• ${item.label}`, 9));
    else addText('All checklist activities are complete.', 9);
    y += 3;
    if (y > 275) { pdf.addPage(); y = 20; }
    pdf.line(left, y, left + width, y);
    y += 8;
    addText(`Checked and recorded by: ${current.checker}`, 10, true);
    if (current.checkerEmail) addText(`Verified account: ${current.checkerEmail}`, 9);
    addText('Generated with Cue Check · Media Readiness', 8);
    const safeName = current.service.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    pdf.save(`cue-check-${safeName || 'service'}-${current.date}.pdf`);
  };
  const filtered = useMemo(
    () =>
      current?.entries.filter(
        e => filter === 'All' || (filter === 'Completed' ? e.done : !e.done)
      ) || [],
    [current, filter]
  );
  const go = p => {
    setPage(p);
    setActive(null);
  };
  return (
    <div className={`shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <b>Cue Check</b>
            <small>MEDIA READINESS</small>
          </div>
        </div>
        <nav>
          {[
            ['Dashboard', LayoutDashboard],
            ['Run a check', ClipboardCheck],
            ['Activity log', ClipboardList],
            ['Staff reports', Users],
            ['History', History],
            ['Checklist', ListChecks],
            ['Special Programs', CalendarDays],
            ['Settings', Settings],
          ].filter(([n]) => n !== 'Staff reports' || accountRole === 'admin').map(([n, I]) => (
            <button
              className={page === n ? 'nav active' : 'nav'}
              onClick={() => go(n)}
              key={n}
            >
              <I size={17} />
              {n}
            </button>
          ))}
        </nav>
        <div className="reminder">
          <small>REMINDER</small>
          <p>{data.settings.reminder}</p>
        </div>
        <div className="side-foot">SERVICE READINESS • v1.0</div>
      </aside>
      <main className="main">
        {cloudError && <div className="cloud-warning">Cloud sync issue: {cloudError}</div>}
        {!cloudReady && <div className="cloud-loading">Connecting to shared Cue Check workspace…</div>}
        <header className="topbar">
          <div className="crumb">
            MEDIA OPERATIONS <span>/</span> {page.toUpperCase()}
          </div>
          <div className="top-right">
            <button className="theme-toggle" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label="Toggle day and night mode" title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? 'Day mode' : 'Night mode'}
            </button>
            {accountRole === 'admin' && pendingProfiles.length > 0 && (
              <button className="pending-alert" onClick={() => go('Settings')} title="Review pending staff registrations">
                {pendingProfiles.length} pending approval{pendingProfiles.length === 1 ? '' : 's'}
              </button>
            )}
            <span className="live-dot" />
            <span className="user-email">{user.email} · {accountRole}</span>
            <button className="signout-btn" onClick={() => supabase.auth.signOut()}><LogOut size={14} /> Sign out</button>
          </div>
        </header>
        {page === 'Dashboard' && (
          <>
            <div className="page-title"><small className="eyebrow">OPERATIONS OVERVIEW</small><h1>Management dashboard</h1><p>Shared service readiness across your media team.</p></div>
            <div className="stats dashboard-stats">
              <div className="stat"><small>TOTAL SERVICE CHECKS</small><strong>{dashboardMetrics.total}</strong><span>All recorded services</span></div>
              <div className="stat"><small>READY SERVICES</small><strong>{dashboardMetrics.ready}</strong><span>Marked ready</span></div>
              <div className="stat"><small>OPEN CHECKS</small><strong>{dashboardMetrics.open}</strong><span>Still in progress</span></div>
              <div className="stat"><small>AVERAGE COMPLETION</small><strong>{dashboardMetrics.average}%</strong><span>Across all checks</span></div>
              <div className="stat"><small>OVERDUE CHECKS</small><strong>{dashboardMetrics.delayed}</strong><span>Past date and not ready</span></div>
              <div className="stat"><small>THIS MONTH</small><strong>{dashboardMetrics.thisMonth}</strong><span>Recorded this month</span></div>
            </div>
            <div className="section-head"><div><small className="eyebrow">TEAM ACTIVITY</small><h2>Recent service checks</h2></div><button className="text-btn" onClick={() => go('History')}>Full history <ChevronRight size={14} /></button></div>
            {data.checks.slice(0, 6).map(check => {
              const progress = check.entries?.length ? Math.round(check.entries.filter(entry => entry.done).length / check.entries.length * 100) : 0;
              return <button className="history-row" key={check.id} onClick={() => { setPage('Run a check'); setActive(check.id); }}><div className="history-icon"><FileText size={18} /></div><div><b>{check.service} · {dateLabel(check.date)}</b><small>{check.checker} · {progress}% complete</small></div><span className={'tag ' + (check.ready ? 'ready' : '')}>{check.ready ? 'READY' : 'IN PROGRESS'}</span></button>;
            })}
            {!data.checks.length && <div className="empty"><ClipboardCheck size={28} /><h3>No service data yet</h3><p>Start the first service check to populate this dashboard.</p><button className="primary" onClick={() => { go('Run a check'); setShowNew(true); }}>Start a check</button></div>}
          </>
        )}
        {page === 'Activity log' && (
          <>
            <div className="page-title"><small className="eyebrow">AUDIT TRAIL</small><h1>Activity history</h1><p>Records of service starts, checklist changes, readiness decisions and backup actions.</p></div>
            {auditEvents.length ? auditEvents.map(event => <div className="history-row audit-row" key={event.id}><div className="history-icon"><Activity size={18} /></div><div><b>{String(event.action || '').replaceAll('_', ' ')}</b><small>{event.actor_email || 'Staff'} · {new Date(event.created_at).toLocaleString()}</small>{event.details?.task && <small>Task: {event.details.task}</small>}{event.details?.service && <small>Service: {event.details.service}</small>}</div></div>) : <div className="empty"><ClipboardList size={28} /><h3>No activity events yet</h3><p>Activity appears as staff use Cue Check. Apply the audit migration in Supabase first.</p></div>}
          </>
        )}
        {page === 'Staff reports' && accountRole === 'admin' && (
          <>
            <div className="page-title"><small className="eyebrow">PEOPLE & PERFORMANCE</small><h1>Staff performance</h1><p>Service-check volume, readiness outcomes and average checklist completion.</p></div>
            <div className="report-actions"><span>{staffPerformance.length} staff members with recorded checks</span><button className="primary" onClick={downloadStaffReport}><FileSpreadsheet size={16} /> Export CSV</button></div>
            {staffPerformance.length ? staffPerformance.map(person => <div className="history-row staff-report-row" key={person.name}><div className="history-icon"><Users size={18} /></div><div className="staff-report-info"><b>{person.name}</b><small>{person.checks} checks · {person.ready} marked ready · Latest: {person.latest ? dateLabel(person.latest) : '—'}</small><div className="progress-line"><i style={{ width: person.average + '%' }} /></div></div><strong>{person.average}%</strong></div>) : <div className="empty"><Users size={28} /><h3>No staff report data yet</h3><p>Reports appear after staff complete service checks.</p></div>}
          </>
        )}
        {page === 'Run a check' && !current && (
          <section className="welcome">
            <div className="eyebrow">
              <span /> MEDIA READINESS
            </div>
            <h1>
              Every service, ready
              <br />
              before doors open.
            </h1>
            <p>
              Walk the same checklist through audio, cameras, streaming,
              lighting and more — so a muted mic or a dead camera never
              surprises you mid-service.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => setShowNew(true)}>
                <Plus size={16} /> Start a service check
              </button>
              {accountRole === 'admin' && (
                <button className="quiet" onClick={() => go('Checklist')}>
                  Edit checklist <ChevronRight size={15} />
                </button>
              )}
            </div>
            <div className="welcome-orb" />
          </section>
        )}
        {page === 'Run a check' && !current && (
          <>
            <div className="stats">
              <div className="stat">
                <small>LAST SERVICE READINESS</small>
                <strong>
                  {data.checks[0]?.ready
                    ? '100%'
                    : data.checks[0]
                      ? Math.round(
                          (data.checks[0].entries.filter(e => e.done).length /
                            data.checks[0].entries.length) *
                            100
                        ) + '%'
                      : '—'}
                </strong>
                <span>Most recent check</span>
              </div>
              <div className="stat">
                <small>OPEN CHECKS</small>
                <strong>{data.checks.filter(c => !c.ready).length}</strong>
                <span>Awaiting completion</span>
              </div>
              <div className="stat">
                <small>CHECKS THIS MONTH</small>
                <strong>
                  {
                    data.checks.filter(
                      c =>
                        c.date.slice(0, 7) ===
                        new Date().toISOString().slice(0, 7)
                    ).length
                  }
                </strong>
                <span>Recorded services</span>
              </div>
            </div>
            <div className="section-head">
              <div>
                <small className="eyebrow">IN PROGRESS</small>
                <h2>Live service checks</h2>
              </div>
              <button className="text-btn" onClick={() => go('History')}>
                View history <ChevronRight size={14} />
              </button>
            </div>
            <div className="check-grid">
              {data.checks
                .filter(c => !c.ready)
                .slice(0, 3)
                .map(c => (
                  <button
                    className="check-card"
                    key={c.id}
                    onClick={() => setActive(c.id)}
                  >
                    <div className="ring small-ring">
                      {Math.round(
                        (c.entries.filter(e => e.done).length /
                          c.entries.length) *
                          100
                      )}
                      %
                    </div>
                    <div>
                      <span className="tag">IN PROGRESS</span>
                      <b>{c.service}</b>
                      <small>
                        {dateLabel(c.date)} · {c.checker}
                      </small>
                      <span className="continue">Continue check →</span>
                    </div>
                  </button>
                ))}
            </div>
            <div className="section-head">
              <div>
                <small className="eyebrow">RECENT</small>
                <h2>Completed checks</h2>
              </div>
              <button className="text-btn" onClick={() => go('History')}>
                View all <ChevronRight size={14} />
              </button>
            </div>
            {data.checks
              .filter(c => c.ready)
              .slice(0, 2)
              .map(c => (
                <button
                  className="history-row"
                  key={c.id}
                  onClick={() => setActive(c.id)}
                >
                  <CheckCircle2 />
                  <div>
                    <b>{c.service}</b>
                    <small>
                      {dateLabel(c.date)} · Checked by {c.checker}
                    </small>
                  </div>
                  <span className="tag ready">READY</span>
                </button>
              ))}
          </>
        )}
        {page === 'Run a check' && current && (
          <>
            <div className="service-hero">
              <div>
                <button className="back" onClick={() => setActive(null)}>
                  ← All checks
                </button>
                <div className="eyebrow">
                  <span /> {current.ready ? 'COMPLETED' : 'IN PROGRESS'}
                </div>
                <h1>
                  {current.service} · {dateLabel(current.date)}
                </h1>
                <p>
                  Today · {current.time} · Checked by <b>{current.checker}</b>
                </p>
              </div>
              <div className="progress-box">
                <div className="ring">{pct}%</div>
                <span>
                  {completed} of {current.entries.length} checked
                </span>
              </div>
              {!current.ready && (
                <button
                  className="primary ready-btn"
                  title={!canFinalize ? 'Complete at least 40% of the checklist first.' : 'Mark this service ready'}
                  onClick={() => {
                    if (!canFinalize) {
                      setNotice(`Service readiness is locked. Complete at least 40% of this checklist first. Your current progress is ${pct}%.`);
                      return;
                    }
                    const completedAt = new Date().toISOString();
                    updateCheck({ ready: true, completedAt });
                    writeAudit('service_marked_ready', current.id, { service: current.service, completion: pct });
                  }}
                >
                  <Check size={16} /> Mark service ready
                </button>
              )}
            </div>
            <div className="progress-line">
              <i style={{ width: pct + '%' }} />
            </div>
            <div className="section-head checklist-head">
              <div>
                <small className="eyebrow">SERVICE CHECKLIST</small>
                <h2>Readiness tasks</h2>
              </div>
              <div className="filters">
                {['All', 'Pending', 'Completed'].map(f => (
                  <button
                    className={filter === f ? 'selected' : ''}
                    onClick={() => setFilter(f)}
                    key={f}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="task-list">
              {filtered.map(e => (
                <div className={'task ' + (e.done ? 'done' : '')} key={e.id}>
                  <button
                    type="button"
                    className="task-check"
                    onClick={() => toggleEntry(e.id)}
                  >
                    {e.done && <Check size={14} />}
                  </button>
                  <div className="task-main">
                    <span>{e.label}</span>
                    {e.note && <small>{e.note}</small>}
                    <input
                      className="note-input"
                      placeholder="Add a note (optional)"
                      value={e.note}
                      onChange={ev => updateNote(e.id, ev.target.value)}
                      onBlur={() => writeAudit('task_note_updated', current.id, { task: e.label, note: e.note })}
                    />
                  </div>
                  <span className="task-state">
                    {e.done ? 'DONE' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
            <div className="report-actions">
              <span>
                Checked by <b>{current.checker}</b>
                {!canFinalize && <small className="threshold-hint">Complete at least 40% to unlock service readiness and PDF download.</small>}
              </span>
              <button className="primary" onClick={download} title={!canFinalize ? 'Complete at least 40% of the checklist first.' : 'Download service report'}>
                <Download size={16} /> Download PDF
              </button>
            </div>
          </>
        )}
        {page === 'History' && (
          <>
            <div className="page-title">
              <small className="eyebrow">RECORDS</small>
              <h1>Check history</h1>
              <p>
                Every service check, saved with its checker and completion
                record.
              </p>
            </div>
            {data.checks.length === 0 ? (
              <div className="empty">
                <Archive size={28} />
                <h3>No checks recorded yet</h3>
                <p>Start a service check to build your history.</p>
                <button
                  className="primary"
                  onClick={() => {
                    go('Run a check');
                    setShowNew(true);
                  }}
                >
                  Start a check
                </button>
              </div>
            ) : (
              data.checks.map(c => (
                <button
                  className="history-row"
                  key={c.id}
                  onClick={() => {
                    setPage('Run a check');
                    setActive(c.id);
                  }}
                >
                  <div className="history-icon">
                    <FileText size={18} />
                  </div>
                  <div>
                    <b>
                      {c.service} · {dateLabel(c.date)}
                    </b>
                    <small>
                      {c.time} · Checked by {c.checker} ·{' '}
                      {c.entries.filter(e => e.done).length}/{c.entries.length}{' '}
                      completed
                    </small>
                  </div>
                  <span className={'tag ' + (c.ready ? 'ready' : '')}>
                    {c.ready ? 'READY' : 'IN PROGRESS'}
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            )}
          </>
        )}
        {page === 'Checklist' && (
          <>
            <div className="page-title">
              <small className="eyebrow">CONFIGURATION</small>
              <h1>Service checklist</h1>
              <p>
                Manage the activities that appear every time a service check is
                started.
              </p>
            </div>
            {accountRole === 'admin' ? (
              <div className="add-item">
                <input
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  placeholder="Add a checklist activity..."
                />
                <button
                  className="primary"
                  onClick={() => {
                    if (newItem.trim()) {
                      setData(d => ({
                        ...d,
                        items: [...d.items, newItem.trim()],
                      }));
                      setNewItem('');
                    }
                  }}
                >
                  <Plus size={16} /> Add activity
                </button>
              </div>
            ) : (
              <p className="saved">This checklist is managed by the administrator. You can view it and complete its tasks during a service check.</p>
            )}
            <div className="task-list">
              {data.items.map((item, i) => (
                <div className="task" key={i}>
                  <div className="task-main">
                    <span>{item}</span>
                  </div>
                  {accountRole === 'admin' && (
                    <button
                      className="remove"
                      onClick={() =>
                        setData(d => ({
                          ...d,
                          items: d.items.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {page === 'Special Programs' && (
          <>
            <div className="page-title">
              <small className="eyebrow">CUSTOM CONFIGURATION</small>
              <h1>Special programs</h1>
              <p>Create a dedicated checklist for conferences, concerts, conventions, outreaches and other special events.</p>
            </div>
            {accountRole === 'admin' ? (
            <div className="settings-card program-editor">
              <h2>{editingProgramId ? 'Edit special program' : 'Configure a special program'}</h2>
              <label>Program name
                <input value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g. Annual Convention 2027" />
              </label>
              <label>Program checklist — enter one activity per line
                <textarea value={programTasks} onChange={e => setProgramTasks(e.target.value)} placeholder={'Test microphones and speakers\nCheck projector and screens\nConfirm livestream connection\nPrepare stage lighting'} />
              </label>
              <div className="program-actions">
                <button className="primary" onClick={() => {
                  const tasks = programTasks.split('\n').map(x => x.trim()).filter(Boolean);
                  if (!programName.trim() || !tasks.length) return;
                  const item = { id: editingProgramId || crypto.randomUUID(), name: programName.trim(), items: tasks };
                  setData(d => ({ ...d, specialPrograms: editingProgramId ? (d.specialPrograms || []).map(p => p.id === editingProgramId ? item : p) : [...(d.specialPrograms || []), item] }));
                  setProgramName(''); setProgramTasks(''); setEditingProgramId(null);
                }}><Plus size={16} /> {editingProgramId ? 'Save changes' : 'Save program'}</button>
                {editingProgramId && <button className="quiet" onClick={() => { setEditingProgramId(null); setProgramName(''); setProgramTasks(''); }}>Cancel edit</button>}
              </div>
            </div>
            ) : (
              <p className="saved">Special program templates are managed by the administrator. You can still use an existing template to start a check.</p>
            )}
            <div className="section-head"><div><small className="eyebrow">YOUR TEMPLATES</small><h2>Configured programs</h2></div></div>
            {(data.specialPrograms || []).length === 0 ? (
              <div className="empty"><CalendarDays size={28} /><h3>No special programs yet</h3><p>Create a program above and add the activities that should be checked for it.</p></div>
            ) : (data.specialPrograms || []).map(p => (
              <div className="history-row program-row" key={p.id}>
                <div className="history-icon"><ListChecks size={18} /></div>
                <div className="program-info"><b>{p.name}</b><small>{p.items.length} checklist activities</small></div>
                {accountRole === 'admin' && <button className="text-btn" onClick={() => { setEditingProgramId(p.id); setProgramName(p.name); setProgramTasks(p.items.join('\n')); }}>Edit</button>}
                <button className="primary" onClick={() => { setService(p.name); setTemplateItemsOverride(p.items); setShowNew(true); }}>Use checklist</button>
                {accountRole === 'admin' && <button className="remove" aria-label="Delete program" onClick={() => setData(d => ({ ...d, specialPrograms: (d.specialPrograms || []).filter(x => x.id !== p.id) }))}><X size={16} /></button>}
              </div>
            ))}
          </>
        )}
        {page === 'Settings' && (
          <>
            <div className="page-title">
              <small className="eyebrow">PREFERENCES</small>
              <h1>Settings</h1>
              <p>Set the details shown across your service reports.</p>
            </div>
            {accountRole === 'admin' && (
              <div className="settings-card backup-card">
                <h2>Backup & recovery</h2><p>Download checklist settings, special-program templates and service records. Restore a previous backup when needed.</p>
                <div className="backup-actions">
                  <button className="primary" type="button" onClick={exportBackup}><Database size={16} /> Download backup</button>
                  <label className="backup-upload"><span><UploadCloud size={16} /> {backupBusy ? 'Restoring…' : 'Restore backup'}</span><input type="file" accept="application/json,.json" disabled={backupBusy} onChange={restoreBackup} /></label>
                </div>
                <small className="backup-note">Restore merges records by ID and keeps other cloud records. Store downloaded backups securely.</small>
              </div>
            )}
            {accountRole === 'admin' && (
              <div className="settings-card admin-users">
                <h2>Staff access management</h2>
                <p>Review new registration requests and control who can enter the shared Cue Check workspace.</p>
                <div className="approval-summary">
                  <strong>{pendingProfiles.length}</strong>
                  <span>pending registration{pendingProfiles.length === 1 ? '' : 's'}</span>
                </div>
                {pendingProfiles.length === 0 ? (
                  <p className="approval-empty">There are no pending registration requests.</p>
                ) : pendingProfiles.map(profile => (
                  <div className="staff-row approval-row" key={profile.id}>
                    <div className="staff-identity">
                      <b>{profile.email || profile.id}</b>
                      <small>Awaiting administrator approval</small>
                    </div>
                    <div className="approval-actions">
                      <button className="approve-btn" onClick={() => changeApprovalStatus(profile.id, 'approved')}>Approve</button>
                      <button className="reject-btn" onClick={() => changeApprovalStatus(profile.id, 'rejected')}>Reject</button>
                    </div>
                  </div>
                ))}
                <h3 className="staff-list-title">All registered accounts</h3>
                {staffProfiles.map(profile => (
                  <div className="staff-row" key={profile.id}>
                    <div className="staff-identity">
                      <b>{profile.email || profile.id}</b>
                      <small className={`approval-status ${profile.approval_status || 'pending'}`}>{profile.approval_status || 'pending'}</small>
                    </div>
                    <select value={profile.role} onChange={event => changeStaffRole(profile.id, event.target.value)} disabled={profile.id === user.id || profile.role === 'admin'}>
                      <option value="staff">Staff</option>
                      <option value="admin">Administrator</option>
                    </select>
                    {profile.role !== 'admin' && profile.id !== user.id && (
                      <button className="remove" type="button" title="Delete staff account" aria-label={`Delete ${profile.email || 'staff account'}`} onClick={() => deleteStaffAccount(profile)}>
                        <Trash2 size={16} /> Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="settings-card">
              <label>
                Department name
                <input
                  value={data.settings.department}
                  readOnly={accountRole !== 'admin'}
                  onChange={e =>
                    setData(d => ({
                      ...d,
                      settings: { ...d.settings, department: e.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Reminder message
                <textarea
                  value={data.settings.reminder}
                  readOnly={accountRole !== 'admin'}
                  onChange={e =>
                    setData(d => ({
                      ...d,
                      settings: { ...d.settings, reminder: e.target.value },
                    }))
                  }
                />
              </label>
              <p className="saved">
                <CheckCircle2 size={15} /> {accountRole === 'admin' ? 'Changes save automatically and are shared with authorised staff.' : 'These settings are read-only. Contact the administrator to request a change.'}
              </p>
            </div>
          </>
        )}
      </main>
      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <form
            className="modal"
            onSubmit={startCheck}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <small className="eyebrow">NEW SESSION</small>
                <h2>Start a service check</h2>
                <p>
                  Every checklist item is copied into this run so you can track
                  progress.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowNew(false)}
              >
                <X />
              </button>
            </div>
            <label>
              Service
              <select
                value={service}
                onChange={e => setService(e.target.value)}
              >
                <option>Sunday Service</option>
                <option>Midweek Service</option>
                <option>Special Programme</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Service name (optional)
              <input
                value={service}
                onChange={e => setService(e.target.value)}
                placeholder="e.g. Sunday First Service"
              />
            </label>
            <label>
              Name of checker{' '}
              <input
                required
                value={checkName}
                onChange={e => setCheckName(e.target.value)}
                placeholder="Enter the name of the person checking"
              />
            </label>
            <div className="two-fields">
              <label>
                Date
                <input
                  required
                  type="date"
                  value={checkDate}
                  onChange={e => setCheckDate(e.target.value)}
                />
              </label>
              <label>
                Start time
                <input
                  required
                  type="time"
                  value={checkTime}
                  onChange={e => setCheckTime(e.target.value)}
                />
              </label>
            </div>
            <button className="primary full" type="submit">
              Begin check <ChevronRight size={16} />
            </button>
          </form>
        </div>
      )}
      {notice && (
        <div className="modal-backdrop" onClick={() => setNotice('')}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="threshold-title" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <small className="eyebrow">ACTION REQUIRED</small>
                <h2 id="threshold-title">40% completion required</h2>
                <p>{notice}</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close message" onClick={() => setNotice('')}><X /></button>
            </div>
            <button type="button" className="primary full" onClick={() => setNotice('')}>I understand</button>
          </div>
        </div>
      )}
      <div className="print-report">
        <div className="print-brand">
          CUE CHECK · {data.settings.department}
        </div>
        <h1>{current?.service} — Service Readiness Report</h1>
        <p>
          Date: {current ? dateLabel(current.date) : ''} · Start time:{' '}
          {current?.time}
        </p>
        <p>
          Checked by: <b>{current?.checker}</b>
        </p>
        <p>
          Completion: {completed}/{current?.entries.length} ({pct}%) · Status:{' '}
          {current?.ready ? 'READY' : 'IN PROGRESS'}
        </p>
        <hr />
        {current?.entries.map(e => (
          <div className="print-task" key={e.id}>
            <b>
              {e.done ? '✓' : '○'} {e.label}
            </b>
            {e.note && <p>Note: {e.note}</p>}
          </div>
        ))}
        <hr />
        <p>Generated by Cue Check · Media Readiness</p>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [verifiedNotice, setVerifiedNotice] = useState(false);
  const [profileAccess, setProfileAccess] = useState({ loading: false, status: null, role: null, error: '' });
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSession(data.session); setAuthLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_IN' && window.location.hash.includes('type=signup')) setVerifiedNotice(true);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!session?.user?.id) {
      setProfileAccess({ loading: false, status: null, role: null, error: '' });
      return () => { alive = false; };
    }
    setProfileAccess({ loading: true, status: null, role: null, error: '' });
    supabase.from('cuecheck_profiles')
      .select('approval_status,role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setProfileAccess({ loading: false, status: null, role: null, error: error.message });
        else if (!data) setProfileAccess({ loading: false, status: 'missing', role: null, error: '' });
        else setProfileAccess({ loading: false, status: data.approval_status, role: data.role, error: '' });
      });
    return () => { alive = false; };
  }, [session?.user?.id]);
  if (authLoading) return <div className="login-screen"><div className="login-card">Loading Cue Check…</div></div>;
  if (recoveryMode) return <PasswordRecoveryScreen onComplete={() => setRecoveryMode(false)} />;
  if (!session) return <AuthScreen verifiedNotice={verifiedNotice} />;
  if (profileAccess.loading) return <div className="login-screen"><div className="login-card">Checking your Cue Check access…</div></div>;
  if (profileAccess.error || profileAccess.status === 'missing') {
    return <ApprovalStatusScreen status="unavailable" detail={profileAccess.error || 'Your account profile has not been created yet. Please contact the administrator.'} />;
  }
  if (profileAccess.role !== 'admin' && profileAccess.status !== 'approved') {
    return <ApprovalStatusScreen status={profileAccess.status || 'pending'} />;
  }
  return <Workspace user={session.user} />;
}
function ApprovalStatusScreen({ status, detail = '' }) {
  const rejected = status === 'rejected';
  const unavailable = status === 'unavailable';
  return (
    <div className="login-screen">
      <div className="login-card approval-card">
        <div className="login-mark"><ShieldCheck size={28} /></div>
        <small className="eyebrow">CUE CHECK ACCESS</small>
        <h1>{rejected ? 'Registration not approved' : unavailable ? 'Access could not be checked' : 'Awaiting administrator approval'}</h1>
        <p>{rejected
          ? 'Your registration request was not approved. Please contact the Cue Check administrator if you believe this is a mistake.'
          : unavailable
            ? detail
            : 'Your email account is registered, but an administrator must approve your access before you can use the shared checklists.'}</p>
        {!rejected && !unavailable && <div className="approval-waiting">Your request is safely recorded. You can sign out while it is being reviewed.</div>}
        <button className="primary login-button" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}
function PasswordRecoveryScreen({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submit = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage('Your password has been updated. You can now continue to Cue Check.');
      setPassword('');
      setConfirmPassword('');
      window.setTimeout(() => onComplete(), 900);
    } catch (e) {
      setError(e.message || 'Unable to update your password. Please request a new reset email.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="login-screen"><form className="login-card" onSubmit={submit}>
    <div className="login-mark"><ShieldCheck size={28} /></div>
    <small className="eyebrow">ACCOUNT SECURITY</small>
    <h1>Set a new password</h1>
    <p>Choose a new password for your Cue Check account.</p>
    <label className="auth-label">New password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
    <label className="auth-label">Confirm new password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter password again" /></label>
    {error && <div className="login-error">{error}</div>}
    {message && <div className="login-success">{message}</div>}
    <button className="primary login-button" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
  </form></div>;
}
function friendlyAuthError(error) {
  const raw = error?.message || '';
  const message = raw.toLowerCase();
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('over_email_send_rate_limit') ||
    message.includes('email rate limit exceeded')
  ) {
    return 'Too many emails have been requested in a short time. Cue Check could not send another email yet. Please wait a while before trying again, and avoid repeatedly clicking the send button. If this keeps happening, the administrator may need to configure a custom email provider in Supabase.';
  }
  if (message.includes('email not confirmed')) {
    return 'Your email address has not been verified yet. Open the confirmation link sent to your inbox, then return here to sign in.';
  }
  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect. Check your details or use Forgot password to reset your password.';
  }
  return raw || 'Unable to continue. Please try again.';
}
function AuthScreen({ verifiedNotice = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(verifiedNotice ? 'Your email has been verified. You can now sign in.' : '');
  const [resetMode, setResetMode] = useState(false);
  const [signupMode, setSignupMode] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (resetMode) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (resetError) throw resetError;
        setMessage('Password reset instructions have been sent if this email is registered.');
      } else if (signupMode) {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signupError) throw signupError;
        if (data.session) {
          setMessage('Your account has been created. Cue Check will check its approval status before granting access.');
        } else {
          setMessage('Your registration has been received. Verify your email, then sign in. An administrator must approve your access before you can use Cue Check.');
          setSignupMode(false);
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
      }
    } catch (e) { setError(friendlyAuthError(e)); }
    finally { setBusy(false); }
  };
  const switchMode = mode => {
    setResetMode(mode === 'reset');
    setSignupMode(mode === 'signup');
    setError(''); setMessage(''); setPassword(''); setConfirmPassword('');
  };
  return <div className="login-screen"><form className="login-card" onSubmit={submit}>
    <div className="login-mark"><ShieldCheck size={28} /></div>
    <small className="eyebrow">MEDIA READINESS</small>
    <h1>Cue Check</h1>
    <p>{resetMode ? 'Enter your account email and we will send password reset instructions.' : signupMode ? 'Create your staff account to access the shared Cue Check workspace.' : 'Sign in with your staff email and password to access shared service records.'}</p>
    <label className="auth-label">Email address<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
    {!resetMode && <label className="auth-label">Password<input type="password" required minLength={8} autoComplete={signupMode ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={signupMode ? 'At least 8 characters' : 'Your password'} /></label>}
    {signupMode && <label className="auth-label">Confirm password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter password again" /></label>}
    {error && <div className="login-error">{error}</div>}
    {message && <div className="login-success">{message}</div>}
    <button className="primary login-button" disabled={busy}>{busy ? 'Please wait…' : resetMode ? 'Send reset email' : signupMode ? 'Create staff account' : 'Sign in'}</button>
    {resetMode ? <button type="button" className="auth-link" onClick={() => switchMode('login')}>Back to sign in</button> : <>
      <button type="button" className="auth-link" onClick={() => switchMode(signupMode ? 'login' : 'signup')}>{signupMode ? 'Already have an account? Sign in' : 'New staff member? Create account'}</button>
      {!signupMode && <button type="button" className="auth-link" onClick={() => switchMode('reset')}>Forgot password?</button>}
    </>}
    <small className="login-foot">New accounts are assigned the staff role. Administrator access is managed by the Cue Check administrator.</small>
  </form></div>;
}
export default App;

