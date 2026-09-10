/* ============================================================
   IRB Process Management System — Data Layer (IRPF)
   Everything is simulated client-side and persisted to localStorage.
   No server calls are made anywhere in this app.

   Scope: this build implements the IRPF (Initialisation of R&D
   Project Form) end to end, per "IRPF_Form_Specification.docx".
   IPAF / PCDF / Amendment / Incident Report are not yet built —
   the "To Create IPAF" outcome stops at a stub, by design.
   ============================================================ */

const DB_KEY = 'irb_db_irpf_v1';
const ROLE_KEY = 'irb_role';
const ACTOR_KEY = 'irb_actor';

/* ---------- Roles ------------------------------------------------------
   Modelled from IRB_Automation_Staff_Roles.docx, scoped to the roles that
   actually act on an IRPF. IRB Team (External Members) has no system
   access per that document, and INDT/System Admin's "full access" has no
   IRPF-specific action of its own — both are omitted from the switcher.
   ------------------------------------------------------------------- */

const ROLES = {
  pi: { label: 'Principal Investigator (PI)', permissions: 'Create, Read/View, Comment, Update/Edit' },
  director: { label: 'School/Department Director', permissions: 'Read/View, Comment, Update/Edit, Approve/Reject' },
  poc: { label: 'Point of Contact (POC)', permissions: 'Read/View only' },
  'admin-edu': { label: 'IRB Admin — EDU Secretariat', permissions: 'Create, Read/View, Comment, Update/Edit, Delete, Approve/Reject, Redirect' },
  'admin-tie': { label: 'IRB Admin — TIE Secretariat', permissions: 'Create, Read/View, Comment, Update/Edit, Delete, Approve/Reject, Redirect' },
  reviewer: { label: 'IRB Team Member (Reviewer)', permissions: 'Read/View, Comment, Update/Edit, Approve/Reject' },
};

const ACTORS = {
  pi: [
    { id: 'pi-tan', name: 'Dr. Tan Wei Ming', school: 'School of Electrical & Electronic Engineering' },
    { id: 'pi-farah', name: 'Ms. Farah Aziz', school: 'School of Design' },
  ],
  director: [
    { id: 'dir-lim', name: 'Prof. Lim Bee Choo', school: 'School of Electrical & Electronic Engineering' },
    { id: 'dir-rahman', name: 'Assoc Prof Rahman Hassan', school: 'School of Design' },
  ],
  poc: [
    { id: 'poc-ong', name: 'Ms. Grace Ong', school: 'Office of Research & Innovation' },
  ],
  'admin-edu': [
    { id: 'sec-edu', name: 'EDU Secretariat (CLS Co-Chairman)', school: 'Office of Research & Innovation' },
  ],
  'admin-tie': [
    { id: 'sec-tie', name: 'TIE Secretariat (CLS Co-Chairman)', school: 'Office of Research & Innovation' },
  ],
  reviewer: [
    { id: 'rev-lee', name: 'Dr. Lee Chin Huat', school: 'IRB Member' },
    { id: 'rev-priya', name: 'Dr. Priya Nair', school: 'IRB Member' },
    { id: 'rev-ahmad', name: 'Mr. Ahmad Faisal', school: 'IRB Member' },
  ],
};

function getRole() { return localStorage.getItem(ROLE_KEY) || 'pi'; }
function setRole(role) { localStorage.setItem(ROLE_KEY, role); }

function getActorId() { return localStorage.getItem(ACTOR_KEY); }
function setActorId(id) { localStorage.setItem(ACTOR_KEY, id); }

function getActor() {
  const role = getRole();
  const list = ACTORS[role];
  let id = getActorId();
  if (!list.some(a => a.id === id)) {
    id = list[0].id;
    setActorId(id);
  }
  return list.find(a => a.id === id);
}

/* ---------- Reference number generation ---------------------------------
   Format: IRB-MM-YYYY-XXX
   - Generated once, at the first successful Submit from Draft (not at
     Draft creation).
   - XXX resets to 001 at the start of each calendar month (scope is the
     MM-YYYY pair), zero-padded to 3 digits.
   - Immutable thereafter; carried unchanged through every later stage,
     including a resubmission from "Returned for Amendments".
   - Single-session counter (browser localStorage) — adequate for this
     client-side demo; a production multi-user deployment would need a
     server-side atomic sequence keyed by MM-YYYY instead.
   ------------------------------------------------------------------- */

function generateReferenceNumber(db) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const key = `${mm}-${yyyy}`;
  const next = (db.refCounters[key] || 0) + 1;
  db.refCounters[key] = next;
  return `IRB-${key}-${String(next).padStart(3, '0')}`;
}

/* ---------- IRPF field configuration -------------------------------------
   Mirrors IRPF_Form_Specification.docx section 3. Drives both the form
   renderer and the required/conditional validation.
   ------------------------------------------------------------------- */

const IRPF_SECTIONS = [
  {
    title: 'Project Details',
    fields: [
      { key: 'title', label: 'Project Title', type: 'text', required: true, maxWords: 100 },
      { key: 'schoolDept', label: 'School / Department', type: 'text', required: true, maxWords: 100 },
      { key: 'startDate', label: 'Project Start Date', type: 'date', required: true, note: 'Must be after the date the form was filled.' },
      { key: 'endDate', label: 'Project End Date', type: 'date', required: true, note: 'Must be after Project Start Date.' },
    ],
  },
  {
    title: 'Section 1 — Particulars of Research',
    fields: [
      {
        key: 'category', label: 'Category of Research', type: 'radio', required: true,
        options: ['Educational Research', 'Biomedical Research', 'Others'],
        tooltip: '"Others" e.g. food, cosmetics, social & behavioural, digital technologies, etc.',
      },
      {
        key: 'categoryOther', label: 'Category — Others (specify)', type: 'text', maxWords: 100,
        requiredIf: d => d.category === 'Others',
      },
    ],
  },
  {
    title: 'Section 1B — Nature of Research',
    fields: [
      { key: 'involvesHumanSubjects', label: 'Involves Human Subjects', type: 'yesno', required: true },
      { key: 'involvesBiologicalMaterials', label: 'Involves Biological Materials', type: 'yesno', required: true },
      { key: 'involvesHealthInfo', label: 'Involves Health or Physiological Information', type: 'yesno', required: true },
    ],
  },
  {
    title: 'Section 2 — Project Description',
    fields: [
      { key: 'synopsis', label: 'Synopsis and Objective', type: 'textarea', required: true, maxWords: 300 },
      { key: 'collabIndustry', label: 'Collaboration with Industry or Financial Support', type: 'yesno', required: true },
      { key: 'collabIndustryDetails', label: 'Details of Collaboration with Industry or Financial Support', type: 'textarea', requiredIf: d => d.collabIndustry === 'Yes' },
      { key: 'collabOtherSchool', label: 'Involves collaboration with other school(s) or research institute(s)?', type: 'yesno', requiredIf: d => section1BAnyYes(d) },
      { key: 'otherIrbApproval', label: 'Is approval obtained from IRB of other school(s)/institute(s)?', type: 'yesno', requiredIf: d => d.collabOtherSchool === 'Yes' },
      { key: 'collabSchoolName', label: 'Name of Collaborating School/Institute', type: 'text', maxWords: 100, requiredIf: d => d.otherIrbApproval === 'Yes' },
      { key: 'externalPiName', label: 'Name of External PI', type: 'text', maxWords: 100, requiredIf: d => d.otherIrbApproval === 'Yes' },
      { key: 'externalIrbApprovalDate', label: 'Date of External IRB Approval', type: 'date', requiredIf: d => d.otherIrbApproval === 'Yes' },
      {
        key: 'methodology', label: 'Methodology', type: 'textarea', maxWords: 10000,
        requiredIf: d => section1BAnyYes(d),
        tooltip: 'Guiding questions Q1–9 (see Annex A): who/how subjects are selected; inclusion/exclusion criteria; age range and number of subjects; whether participation is free choice; special conditions/vulnerabilities; nature of intervention/interaction; types of biological materials, health or physiological information collected; types of data collected; how participant data is handled.',
      },
      {
        key: 'appendixDocs', label: 'Appendix / Supporting Documents', type: 'files',
        requiredIf: d => section1BAnyYes(d),
        tooltip: 'Informed consent form, introductory message for participants, and survey/questionnaire/interview/focus-group questions. Multiple files; PDF, DOC, JPG, PNG.',
      },
      {
        key: 'ethicsKnowledgeDocs', label: 'Knowledge of Research Ethics', type: 'files',
        requiredIf: d => section1BAnyYes(d),
        tooltip: 'Evidence of prior research-ethics knowledge (e.g. CITI Programme certificate, training certificate, IRB member experience), or a screenshot of the SP Ethics module quiz pass. Multiple files; PDF, DOC, JPG, PNG.',
      },
    ],
  },
  {
    title: 'Section 3 — Declaration',
    fields: [
      { key: 'priorIrbConfirm', label: 'I confirm any work involving human subjects, biological materials, or health/physiological information has been submitted to or approved by SP IRB or a relevant IRB.', type: 'yesna', required: true },
      { key: 'conflictsIdentified', label: 'I declare that any potential conflicts of interest that could influence the research outcomes/interpretations has been identified.', type: 'yesna', required: true },
      { key: 'conflictsDetails', label: 'Please state the identified potential conflicts of interest.', type: 'text', requiredIf: d => d.conflictsIdentified === 'Yes' },
      { key: 'honestyDeclaration', label: 'I declare that I shall maintain honesty in data collection, analysis, and reporting in my project/research.', type: 'yesna', required: true, mustBeYes: true },
      { key: 'consentDeclaration', label: 'I declare that for research involving human subjects, I shall obtain informed consent and inform participants of purpose, methods, and risks.', type: 'yesna', required: true, mustBeYes: true },
      { key: 'intentionToPublish', label: 'Intention to Publish/Present', type: 'yesno', required: true },
      { key: 'paperTitle', label: 'Title of Paper', type: 'text', maxChars: 300, requiredIf: d => d.intentionToPublish === 'Yes', note: 'May enter "TBC" if not yet known.' },
      { key: 'conferenceJournal', label: 'Name of Conference / Journal', type: 'text', maxChars: 300, requiredIf: d => d.intentionToPublish === 'Yes', note: 'May enter "TBC" if not yet known.' },
      { key: 'coPiNames', label: 'Name(s) of Co-PI(s) / Project Team Members', type: 'textarea', maxWords: 150 },
    ],
  },
  {
    title: 'Section 4 — Signatures (Principal Investigator)',
    fields: [
      { key: 'piName', label: 'Name of PI', type: 'text', required: true, maxWords: 150 },
      { key: 'piSchoolDept', label: 'School / Department / Centre (PI)', type: 'text', required: true, maxWords: 150 },
    ],
  },
];

function section1BAnyYes(d) {
  return d.involvesHumanSubjects === 'Yes' || d.involvesBiologicalMaterials === 'Yes' || d.involvesHealthInfo === 'Yes';
}

function wordCount(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean).length;
}

// Returns an array of { key, label, message } problems for the fields a PI
// is responsible for (Draft / Returned for Amendments editing).
function validateIrpfFields(data) {
  const problems = [];
  IRPF_SECTIONS.forEach(section => {
    section.fields.forEach(f => {
      const val = data[f.key];
      const isRequired = f.required || (f.requiredIf && f.requiredIf(data));
      const empty = f.type === 'files' ? !(val && val.length) : (val == null || String(val).trim() === '');
      if (isRequired && empty) {
        problems.push({ key: f.key, label: f.label, message: 'Required' });
        return;
      }
      if (empty) return;
      if (f.mustBeYes && val !== 'Yes') {
        problems.push({ key: f.key, label: f.label, message: 'Must be "Yes" to submit' });
      }
      if (f.maxWords && wordCount(val) > f.maxWords) {
        problems.push({ key: f.key, label: f.label, message: `Exceeds ${f.maxWords} word limit (currently ${wordCount(val)})` });
      }
      if (f.maxChars && String(val).length > f.maxChars) {
        problems.push({ key: f.key, label: f.label, message: `Exceeds ${f.maxChars} character limit (currently ${String(val).length})` });
      }
    });
  });
  if (data.startDate && data.endDate && data.endDate <= data.startDate) {
    problems.push({ key: 'endDate', label: 'Project End Date', message: 'Must be after Project Start Date' });
  }
  return problems;
}

/* ---------- Persistence --------------------------------------------------*/

function seedData() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const db = {
    submissions: [],
    refCounters: {},
    nextId: 1,
  };

  // One example already in Pending Review, with reviewers mid-flight, so
  // the demo isn't empty on first load.
  const sub = newIrpfRecord(db, 'pi-tan');
  Object.assign(sub, {
    title: 'Wearable Sensors for Student Wellbeing Monitoring',
    schoolDept: 'School of Electrical & Electronic Engineering',
    startDate: fmtInputDate(now + 20 * day),
    endDate: fmtInputDate(now + 200 * day),
    category: 'Educational Research',
    involvesHumanSubjects: 'Yes',
    involvesBiologicalMaterials: 'No',
    involvesHealthInfo: 'No',
    synopsis: 'A study evaluating low-cost wearable sensors to track stress indicators among polytechnic students.',
    collabIndustry: 'No',
    methodology: 'Students will be recruited via opt-in sign-up. Wearables record heart-rate variability during class hours over one term.',
    appendixDocs: [{ name: 'Participant_Information_Sheet.pdf', size: 88213 }],
    ethicsKnowledgeDocs: [{ name: 'CITI_Certificate_TanWM.pdf', size: 51022 }],
    priorIrbConfirm: 'N.A.',
    conflictsIdentified: 'N.A.',
    honestyDeclaration: 'Yes',
    consentDeclaration: 'Yes',
    intentionToPublish: 'No',
    piName: 'Dr. Tan Wei Ming',
    piSchoolDept: 'School of Electrical & Electronic Engineering',
  });
  sub.stage = 'Pending Review';
  sub.referenceNumber = generateReferenceNumber(db);
  sub.secretariat = 'EDU';
  sub.piSubmissionDate = fmtInputDate(now - 9 * day);
  sub.directorName = 'Prof. Lim Bee Choo';
  sub.directorSchoolDept = 'School of Electrical & Electronic Engineering';
  sub.directorDate = fmtInputDate(now - 7 * day);
  sub.reviewers = [
    { actorId: 'rev-lee', name: 'Dr. Lee Chin Huat', decision: 'Agree', comment: 'Methodology is sound. No concerns.', ts: now - 3 * day },
    { actorId: 'rev-priya', name: 'Dr. Priya Nair', decision: 'pending', comment: '', ts: null },
    { actorId: 'rev-ahmad', name: 'Mr. Ahmad Faisal', decision: 'pending', comment: '', ts: null },
  ];
  sub.updatedAt = now - 3 * day;
  sub.history = [
    hist('Draft created', 'pi-tan', 'Dr. Tan Wei Ming', now - 12 * day, ''),
    hist('Submitted', 'pi-tan', 'Dr. Tan Wei Ming', now - 10 * day, 'Submitted for Director approval.'),
    hist('For Review', 'dir-lim', 'Prof. Lim Bee Choo', now - 7 * day, 'Approved.'),
    hist('Pending Review', 'sec-edu', 'EDU Secretariat', now - 5 * day, 'Routed to 3 IRB reviewers.'),
    hist('Reviewer recommendation', 'rev-lee', 'Dr. Lee Chin Huat', now - 3 * day, 'Agree — methodology is sound. No concerns.'),
  ];
  db.submissions.push(sub);

  return db;
}

function fmtInputDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function hist(event, actorId, actorName, ts, note) {
  return { event, actorId, actorName, ts, note };
}

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
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function resetDB() { localStorage.removeItem(DB_KEY); return loadDB(); }

/* ---------- IRPF record lifecycle ----------------------------------------*/

function newIrpfRecord(db, piActorId) {
  const rec = {
    recordId: 'rec-' + (db.nextId++),
    referenceNumber: null, // assigned on first successful Submit
    stage: 'Draft',
    piActorId,
    secretariat: null, // 'EDU' | 'TIE', set once Category of Research is known & routed
    reviewers: [],
    comments: [],
    history: [hist('Draft created', piActorId, actorName(piActorId), Date.now(), '')],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    piSubmissionDate: null,
    directorName: '', directorSchoolDept: '', directorDate: null,
  };
  return rec;
}

function actorName(actorId) {
  for (const role of Object.keys(ACTORS)) {
    const found = ACTORS[role].find(a => a.id === actorId);
    if (found) return found.name;
  }
  return actorId;
}
function actorRoleOf(actorId) {
  for (const role of Object.keys(ACTORS)) {
    if (ACTORS[role].some(a => a.id === actorId)) return role;
  }
  return null;
}

function getSubmissions(db) {
  return db.submissions.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}
function getSubmissionById(db, id) {
  return db.submissions.find(s => s.recordId === id);
}

function saveDraft(db, recordId, actorId, fields) {
  const sub = getSubmissionById(db, recordId);
  Object.assign(sub, fields);
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

// Draft -> For Review (validated; reference number assigned here if absent;
// also used to resubmit from "Returned for Amendments", which goes
// straight back to "For Review" without a fresh Director approval, per
// spec — the reference number is NOT regenerated in that case).
function submitIrpf(db, recordId, actorId, fields) {
  const sub = getSubmissionById(db, recordId);
  Object.assign(sub, fields);
  const problems = validateIrpfFields(sub);
  if (problems.length) return { ok: false, problems };

  const fromAmendments = sub.stage === 'Returned for Amendments';
  if (!sub.referenceNumber) {
    sub.referenceNumber = generateReferenceNumber(db);
  }
  sub.secretariat = sub.category === 'Educational Research' ? 'EDU' : 'TIE';
  sub.piSubmissionDate = sub.piSubmissionDate || fmtInputDate(Date.now());

  if (fromAmendments) {
    sub.stage = 'For Review';
    sub.reviewers = []; // fresh reviewer round once it reaches Pending Review again
    sub.history.push(hist('For Review', actorId, actorName(actorId), Date.now(),
      `Resubmitted after amendments. Re-routed to ${sub.secretariat} Secretariat.`));
  } else {
    sub.stage = 'For Review';
    sub.history.push(hist('Submitted', actorId, actorName(actorId), Date.now(),
      `Reference Number ${sub.referenceNumber} assigned. Sent to S/D Director for approval.`));
  }
  sub.updatedAt = Date.now();
  saveDB(db);
  return { ok: true, sub };
}

// Director acts on "For Review" (which, per spec naming, is really "awaiting
// Director approval" the first time through — see UI copy).
function directorDecision(db, recordId, actorId, approve, note) {
  const sub = getSubmissionById(db, recordId);
  const actor = ACTORS.director.find(a => a.id === actorId);
  if (approve) {
    sub.directorName = actor.name;
    sub.directorSchoolDept = actor.school;
    sub.directorDate = fmtInputDate(Date.now());
    sub.secretariat = sub.category === 'Educational Research' ? 'EDU' : 'TIE';
    sub.stage = 'For Review'; // now owned by the Secretariat, awaiting "Send"
    sub.history.push(hist('Director approved', actorId, actor.name, Date.now(), note || `Routed to ${sub.secretariat} Secretariat.`));
  } else {
    sub.stage = 'Draft';
    sub.history.push(hist('Returned by Director', actorId, actor.name, Date.now(), note || 'Returned to PI for changes.'));
  }
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

// Secretariat "Send": assign reviewers and move into Pending Review.
function sendToReview(db, recordId, actorId, reviewerActorIds, note) {
  const sub = getSubmissionById(db, recordId);
  sub.reviewers = reviewerActorIds.map(id => ({
    actorId: id, name: actorName(id), decision: 'pending', comment: '', ts: null,
  }));
  sub.stage = 'Pending Review';
  sub.history.push(hist('Pending Review', actorId, actorName(actorId), Date.now(),
    note || `Routed to ${reviewerActorIds.length} IRB reviewer(s).`));
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

function reviewerRespond(db, recordId, actorId, decision, comment) {
  const sub = getSubmissionById(db, recordId);
  const r = sub.reviewers.find(x => x.actorId === actorId);
  if (!r) return null;
  r.decision = decision;
  r.comment = comment;
  r.ts = Date.now();
  sub.history.push(hist('Reviewer recommendation', actorId, actorName(actorId), Date.now(),
    `${decision}${comment ? ' — ' + comment : ''}`));
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

function allReviewersResponded(sub) {
  return sub.reviewers.length > 0 && sub.reviewers.every(r => r.decision !== 'pending');
}

// Secretariat's final call at Pending Review, once every reviewer has responded.
function secretariatDecide(db, recordId, actorId, outcome, note) {
  const sub = getSubmissionById(db, recordId);
  sub.stage = outcome; // 'Approved for Exemption' | 'Returned for Amendments' | 'To Create IPAF'
  sub.acknowledged = false;
  sub.history.push(hist(outcome, actorId, actorName(actorId), Date.now(), note || ''));
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

function acknowledgeOutcome(db, recordId, actorId) {
  const sub = getSubmissionById(db, recordId);
  sub.acknowledged = true;
  sub.history.push(hist('Acknowledged', actorId, actorName(actorId), Date.now(), ''));
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

function addComment(db, recordId, actorId, text) {
  const sub = getSubmissionById(db, recordId);
  sub.comments.push({ actorId, actorName: actorName(actorId), role: actorRoleOf(actorId), ts: Date.now(), text });
  sub.updatedAt = Date.now();
  saveDB(db);
  return sub;
}

/* ---------- Stage → ownership/status helpers -----------------------------*/

const TERMINAL_STAGES = ['Approved for Exemption', 'To Create IPAF'];

function isTerminal(sub) { return TERMINAL_STAGES.includes(sub.stage); }

function ownerRoleOf(sub) {
  switch (sub.stage) {
    case 'Draft': return 'pi';
    case 'For Review': return sub.directorDate ? (sub.secretariat === 'EDU' ? 'admin-edu' : 'admin-tie') : 'director';
    case 'Pending Review': return allReviewersResponded(sub) ? (sub.secretariat === 'EDU' ? 'admin-edu' : 'admin-tie') : 'reviewer';
    case 'Returned for Amendments': return 'pi';
    case 'Approved for Exemption':
    case 'To Create IPAF':
      return sub.acknowledged ? null : 'pi';
    default: return null;
  }
}

function stageStatusLabel(sub) {
  if (sub.stage === 'For Review' && !sub.directorDate) return 'Awaiting Director Approval';
  if (sub.stage === 'For Review' && sub.directorDate) return `For Review (${sub.secretariat} Secretariat)`;
  if (sub.stage === 'Pending Review' && !allReviewersResponded(sub)) return 'Pending Review (reviewers)';
  if (sub.stage === 'Pending Review' && allReviewersResponded(sub)) return 'Pending Review (Secretariat decision)';
  if (isTerminal(sub) && !sub.acknowledged) return `${sub.stage} — Pending Acknowledgement`;
  if (isTerminal(sub) && sub.acknowledged) return `${sub.stage} — Closed`;
  return sub.stage;
}
