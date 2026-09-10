/* ============================================================
   IRB Process Management System — Data Layer
   All data is simulated client-side and persisted to localStorage.
   No server calls are made anywhere in this app.
   ============================================================ */

const DB_KEY = 'irb_db_v1';
const ROLE_KEY = 'irb_role';
const USER_KEY = 'irb_current_user';

/* ---------- Workflow definitions ------------------------------------- */

// Each process type has an ordered list of stages and the role that must
// act to move OUT of a given stage ("owner"). This drives routing.
const WORKFLOWS = {
  'New Application': {
    label: 'New Application',
    stages: ['Submitted', 'Screening', 'Under Review', 'Revisions Requested', 'Approved'],
    owners: {
      'Submitted': 'admin',
      'Screening': 'admin',
      'Under Review': 'admin',
      'Revisions Requested': 'user',
      'Approved': null
    },
    terminal: ['Approved', 'Rejected', 'Withdrawn']
  },
  'Amendment': {
    label: 'Amendment',
    stages: ['Submitted', 'Under Review', 'Revisions Requested', 'Approved'],
    owners: {
      'Submitted': 'admin',
      'Under Review': 'admin',
      'Revisions Requested': 'user',
      'Approved': null
    },
    terminal: ['Approved', 'Rejected', 'Withdrawn']
  },
  'Incident Report': {
    label: 'Incident Report',
    stages: ['Reported', 'Under Investigation', 'Corrective Action Required', 'Resolved'],
    owners: {
      'Reported': 'admin',
      'Under Investigation': 'admin',
      'Corrective Action Required': 'user',
      'Resolved': null
    },
    terminal: ['Resolved', 'Closed']
  },
  'Publication Clearance': {
    label: 'Publication Clearance',
    stages: ['Requested', 'Under Review', 'Cleared'],
    owners: {
      'Requested': 'admin',
      'Under Review': 'admin',
      'Cleared': null
    },
    terminal: ['Cleared', 'Rejected']
  }
};

// Required fields per submission type — used by the AI Assist "missing
// information" detector.
const REQUIRED_FIELDS = {
  'New Application': ['title', 'researcher', 'school', 'summary', 'riskLevel', 'participants'],
  'Amendment': ['title', 'researcher', 'school', 'linkedProjectId', 'summary'],
  'Incident Report': ['title', 'researcher', 'school', 'linkedProjectId', 'summary', 'severity'],
  'Publication Clearance': ['title', 'researcher', 'school', 'linkedProjectId', 'summary']
};

/* ---------- Seed data --------------------------------------------------*/

function seedData() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const submissions = [
    mkSubmission({
      id: 'IRB-2026-0001',
      type: 'New Application',
      title: 'Wearable Sensors for Student Wellbeing Monitoring',
      researcher: 'Dr. Tan Wei Ming',
      school: 'School of Electrical & Electronic Engineering',
      summary: 'A study evaluating low-cost wearable sensors to track stress indicators among polytechnic students.',
      riskLevel: 'Minimal Risk',
      participants: '60 students, aged 17-20',
      stage: 'Under Review',
      assignedTo: 'IRB Admin (Grants & Compliance)',
      createdAt: now - 12 * day,
      updatedAt: now - 2 * day,
      dueDate: now + 3 * day,
      history: [
        h('Submitted', 'user', now - 12 * day, 'Application submitted for review.'),
        h('Screening', 'admin', now - 10 * day, 'Passed completeness screening.'),
        h('Under Review', 'admin', now - 8 * day, 'Routed to full board review.')
      ],
      comments: []
    }),
    mkSubmission({
      id: 'IRB-2026-0002',
      type: 'New Application',
      title: 'AI-Assisted Feedback in Engineering Design Studios',
      researcher: 'Ms. Farah Aziz',
      school: 'School of Design',
      summary: 'Investigating the effect of AI-generated design critique on student iteration speed.',
      riskLevel: 'Minimal Risk',
      participants: '40 students',
      stage: 'Revisions Requested',
      assignedTo: 'IRB Admin (Grants & Compliance)',
      createdAt: now - 20 * day,
      updatedAt: now - 5 * day,
      dueDate: now - 1 * day, // overdue on purpose to demo reminders
      history: [
        h('Submitted', 'user', now - 20 * day, 'Application submitted.'),
        h('Screening', 'admin', now - 18 * day, 'Completeness OK.'),
        h('Under Review', 'admin', now - 15 * day, 'Board review in progress.'),
        h('Revisions Requested', 'admin', now - 5 * day, 'Please clarify data retention period and add a participant withdrawal procedure.')
      ],
      comments: [
        c('admin', 'IRB Admin', now - 5 * day, 'Please clarify data retention period and add a participant withdrawal procedure.')
      ]
    }),
    mkSubmission({
      id: 'IRB-2026-0003',
      type: 'New Application',
      title: 'Peer Mentoring Impact on First-Year Retention',
      researcher: 'Dr. Tan Wei Ming',
      school: 'School of Electrical & Electronic Engineering',
      summary: 'Longitudinal study on structured peer mentoring and first-year retention rates.',
      riskLevel: 'Minimal Risk',
      participants: '120 students',
      stage: 'Approved',
      assignedTo: 'IRB Admin (Grants & Compliance)',
      createdAt: now - 60 * day,
      updatedAt: now - 40 * day,
      dueDate: null,
      history: [
        h('Submitted', 'user', now - 60 * day, 'Application submitted.'),
        h('Screening', 'admin', now - 58 * day, 'Completeness OK.'),
        h('Under Review', 'admin', now - 55 * day, 'Board review in progress.'),
        h('Approved', 'admin', now - 40 * day, 'Approved with no conditions. Approval valid for 12 months.')
      ],
      comments: []
    }),
    mkSubmission({
      id: 'IRB-2026-0004',
      type: 'Amendment',
      title: 'Amendment: Extend recruitment period',
      researcher: 'Dr. Tan Wei Ming',
      school: 'School of Electrical & Electronic Engineering',
      summary: 'Requesting a 3-month extension to participant recruitment due to slower-than-expected sign-up.',
      linkedProjectId: 'IRB-2026-0003',
      stage: 'Submitted',
      assignedTo: 'IRB Admin (Grants & Compliance)',
      createdAt: now - 2 * day,
      updatedAt: now - 2 * day,
      dueDate: now + 5 * day,
      history: [
        h('Submitted', 'user', now - 2 * day, 'Amendment submitted, linked to IRB-2026-0003.')
      ],
      comments: []
    }),
    mkSubmission({
      id: 'IRB-2026-0005',
      type: 'Incident Report',
      title: 'Data file inadvertently shared with wrong distribution list',
      researcher: 'Ms. Farah Aziz',
      school: 'School of Design',
      summary: 'A de-identified interim dataset was briefly shared with an incorrect internal mailing list.',
      linkedProjectId: 'IRB-2026-0002',
      severity: 'Moderate',
      stage: 'Reported',
      assignedTo: 'IRB Admin (Grants & Compliance)',
      createdAt: now - 1 * day,
      updatedAt: now - 1 * day,
      dueDate: now + 1 * day,
      history: [
        h('Reported', 'user', now - 1 * day, 'Incident reported by research team within 24 hours of discovery.')
      ],
      comments: []
    })
  ];

  const db = {
    submissions,
    counters: { next: 6 },
    users: [
      { id: 'u-tan', name: 'Dr. Tan Wei Ming', role: 'user', school: 'School of Electrical & Electronic Engineering' },
      { id: 'u-farah', name: 'Ms. Farah Aziz', role: 'user', school: 'School of Design' },
      { id: 'a-irb', name: 'IRB Admin (Grants & Compliance)', role: 'admin', school: 'Office of Research & Innovation' }
    ]
  };
  return db;
}

function h(stage, actor, ts, note) {
  return { stage, actor, ts, note };
}
function c(actorRole, actorName, ts, text) {
  return { actorRole, actorName, ts, text };
}
function mkSubmission(obj) {
  return Object.assign({
    documents: [],
    comments: [],
    history: []
  }, obj);
}

/* ---------- Persistence ------------------------------------------------*/

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const seeded = seedData();
    saveDB(seeded);
    return seeded;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const seeded = seedData();
    saveDB(seeded);
    return seeded;
  }
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function resetDB() {
  localStorage.removeItem(DB_KEY);
  return loadDB();
}

/* ---------- Role / current user ----------------------------------------*/

function getRole() {
  return localStorage.getItem(ROLE_KEY) || 'user';
}
function setRole(role) {
  localStorage.setItem(ROLE_KEY, role);
}

function getCurrentUserName() {
  return localStorage.getItem(USER_KEY) || (getRole() === 'admin' ? 'IRB Admin (Grants & Compliance)' : 'Dr. Tan Wei Ming');
}
function setCurrentUserName(name) {
  localStorage.setItem(USER_KEY, name);
}

/* ---------- Submission helpers -----------------------------------------*/

function nextId(db) {
  const year = new Date().getFullYear();
  const n = db.counters.next++;
  return `IRB-${year}-${String(n).padStart(4, '0')}`;
}

function getSubmissions(db) {
  return db.submissions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

function getSubmissionsForUser(db, userName) {
  return getSubmissions(db).filter(s => s.researcher === userName);
}

function getSubmissionById(db, id) {
  return db.submissions.find(s => s.id === id);
}

function addSubmission(db, data) {
  const id = nextId(db);
  const now = Date.now();
  const wf = WORKFLOWS[data.type];
  const stage = wf.stages[0];
  const sub = mkSubmission(Object.assign({}, data, {
    id,
    stage,
    assignedTo: 'IRB Admin (Grants & Compliance)',
    createdAt: now,
    updatedAt: now,
    dueDate: now + 7 * 24 * 60 * 60 * 1000,
    history: [h(stage, 'user', now, 'Submission created.')]
  }));
  db.submissions.push(sub);
  saveDB(db);
  return sub;
}

function advanceStage(db, id, newStage, actorRole, note) {
  const sub = getSubmissionById(db, id);
  if (!sub) return null;
  sub.stage = newStage;
  sub.updatedAt = Date.now();
  const wf = WORKFLOWS[sub.type];
  if (wf.terminal.includes(newStage)) {
    sub.dueDate = null;
  } else {
    sub.dueDate = Date.now() + 7 * 24 * 60 * 60 * 1000;
  }
  sub.history.push(h(newStage, actorRole, Date.now(), note || ''));
  saveDB(db);
  return sub;
}

function addComment(db, id, actorRole, actorName, text) {
  const sub = getSubmissionById(db, id);
  if (!sub) return null;
  sub.comments.push(c(actorRole, actorName, Date.now(), text));
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

/* ---------- AI Assist (simulated, fully client-side) --------------------*/

// Suggests the correct workflow/route for a free-text description by
// simple keyword matching — simulates "AI identifies the correct workflow".
function aiSuggestType(text) {
  const t = (text || '').toLowerCase();
  const scores = {
    'Incident Report': ['breach', 'incident', 'leak', 'lost data', 'adverse event', 'complaint', 'shared', 'unauthorised', 'unauthorized'],
    'Amendment': ['amend', 'extend', 'change', 'modify', 'add investigator', 'update consent', 'extension'],
    'Publication Clearance': ['publish', 'publication', 'journal', 'conference paper', 'manuscript', 'clearance'],
    'New Application': ['new study', 'new project', 'propose', 'protocol', 'recruit participants']
  };
  let best = null, bestScore = 0;
  for (const [type, kws] of Object.entries(scores)) {
    let score = 0;
    kws.forEach(k => { if (t.includes(k)) score++; });
    if (score > bestScore) { bestScore = score; best = type; }
  }
  return { type: best, confidence: bestScore > 0 ? Math.min(0.95, 0.5 + bestScore * 0.15) : 0 };
}

// Detects missing required fields for a given type.
function aiDetectMissing(type, data) {
  const req = REQUIRED_FIELDS[type] || [];
  return req.filter(f => !data[f] || String(data[f]).trim() === '');
}

// Generates a plain-language status summary for admins ("actionable status update").
function aiStatusSummary(db) {
  const subs = db.submissions;
  const overdue = subs.filter(isOverdue);
  const pendingAdmin = subs.filter(s => WORKFLOWS[s.type].owners[s.stage] === 'admin' && !WORKFLOWS[s.type].terminal.includes(s.stage));
  const pendingUser = subs.filter(s => WORKFLOWS[s.type].owners[s.stage] === 'user' && !WORKFLOWS[s.type].terminal.includes(s.stage));
  const parts = [];
  parts.push(`${subs.length} total submission${subs.length === 1 ? '' : 's'} in the system.`);
  parts.push(`${pendingAdmin.length} awaiting IRB administrator action.`);
  parts.push(`${pendingUser.length} awaiting researcher response.`);
  if (overdue.length) {
    parts.push(`⚠ ${overdue.length} item${overdue.length === 1 ? ' is' : 's are'} past its target action date and need${overdue.length === 1 ? 's' : ''} follow-up.`);
  } else {
    parts.push('No items are currently overdue.');
  }
  return parts.join(' ');
}

function isOverdue(sub) {
  const wf = WORKFLOWS[sub.type];
  if (!sub.dueDate) return false;
  if (wf.terminal.includes(sub.stage)) return false;
  return sub.dueDate < Date.now();
}

function daysUntil(ts) {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000));
}
