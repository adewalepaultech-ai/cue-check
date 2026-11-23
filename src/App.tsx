import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
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
} from 'lucide-react';
import { auth } from '@appdeploy/client';
import { jsPDF } from 'jspdf';

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
function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
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
  useEffect(() => saveStore(data), [data]);
  useEffect(() => {
    auth.getUser()
      .then(setUser)
      .catch(err => setAuthError(err?.message || 'Unable to restore your sign-in. Please try again.'))
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cuecheck-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (user) setCheckName(user.name || user.email || '');
  }, [user]);
  const current = data.checks.find(c => c.id === active);
  const completed = current?.entries.filter(e => e.done).length || 0;
  const pct = current
    ? Math.round((completed / Math.max(current.entries.length, 1)) * 100)
    : 0;
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
      checkerEmail: user?.email || '',
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
    setActive(c.id);
    setTemplateItemsOverride(null);
    setShowNew(false);
    setPage('Run a check');
  };
  const toggleEntry = id =>
    updateCheck({
      entries: current.entries.map(e =>
        e.id === id ? { ...e, done: !e.done } : e
      ),
    });
  const updateNote = (id, note) =>
    updateCheck({
      entries: current.entries.map(e => (e.id === id ? { ...e, note } : e)),
    });
  const download = () => {
    if (!current) return;
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
  if (authLoading) {
    return <div className="login-screen"><div className="login-card"><ShieldCheck size={34} /><h1>Cue Check</h1><p>Restoring your secure session…</p></div></div>;
  }
  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-mark"><ShieldCheck size={28} /></div>
          <small className="eyebrow">MEDIA READINESS</small>
          <h1>Welcome to Cue Check</h1>
          <p>Sign in with your email address to access service checks, activity records and PDF reports.</p>
          {authError && <div className="login-error">{authError}</div>}
          <button className="primary login-button" disabled={authBusy} onClick={async () => {
            setAuthBusy(true);
            setAuthError('');
            try { await auth.signInWithRedirect({ scope: 'openid email profile offline_access' }); }
            catch (err) { setAuthError(err?.message || 'Sign-in could not start. Please try again.'); setAuthBusy(false); }
          }}>{authBusy ? 'Opening email sign-in…' : 'Continue with email'}</button>
          <small className="login-foot">A secure email sign-in link will be sent to you.</small>
        </div>
      </div>
    );
  }
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
            ['Run a check', ClipboardCheck],
            ['History', History],
            ['Checklist', ListChecks],
            ['Special Programs', CalendarDays],
            ['Settings', Settings],
          ].map(([n, I]) => (
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
        <header className="topbar">
          <div className="crumb">
            MEDIA OPERATIONS <span>/</span> {page.toUpperCase()}
          </div>
          <div className="top-right">
            <button className="theme-toggle" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label="Toggle day and night mode" title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? 'Day mode' : 'Night mode'}
            </button>
            <span className="live-dot" />
            <span className="user-email">{user.email}</span>
            <button className="signout-btn" onClick={async () => { await auth.signOut(); setUser(null); }} title="Sign out"><LogOut size={14} /></button>
          </div>
        </header>
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
              <button className="quiet" onClick={() => go('Checklist')}>
                Edit checklist <ChevronRight size={15} />
              </button>
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
                  onClick={() =>
                    updateCheck({
                      ready: true,
                      completedAt: new Date().toISOString(),
                    })
                  }
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
              </span>
              <button className="primary" onClick={download}>
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
            <div className="task-list">
              {data.items.map((item, i) => (
                <div className="task" key={i}>
                  <div className="task-main">
                    <span>{item}</span>
                  </div>
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
            <div className="section-head"><div><small className="eyebrow">YOUR TEMPLATES</small><h2>Configured programs</h2></div></div>
            {(data.specialPrograms || []).length === 0 ? (
              <div className="empty"><CalendarDays size={28} /><h3>No special programs yet</h3><p>Create a program above and add the activities that should be checked for it.</p></div>
            ) : (data.specialPrograms || []).map(p => (
              <div className="history-row program-row" key={p.id}>
                <div className="history-icon"><ListChecks size={18} /></div>
                <div className="program-info"><b>{p.name}</b><small>{p.items.length} checklist activities</small></div>
                <button className="text-btn" onClick={() => { setEditingProgramId(p.id); setProgramName(p.name); setProgramTasks(p.items.join('\n')); }}>Edit</button>
                <button className="primary" onClick={() => { setService(p.name); setTemplateItemsOverride(p.items); setShowNew(true); }}>Use checklist</button>
                <button className="remove" aria-label="Delete program" onClick={() => setData(d => ({ ...d, specialPrograms: (d.specialPrograms || []).filter(x => x.id !== p.id) }))}><X size={16} /></button>
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
            <div className="settings-card">
              <label>
                Department name
                <input
                  value={data.settings.department}
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
                  onChange={e =>
                    setData(d => ({
                      ...d,
                      settings: { ...d.settings, reminder: e.target.value },
                    }))
                  }
                />
              </label>
              <p className="saved">
                <CheckCircle2 size={15} /> Changes save automatically on this
                device.
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
export default App;
