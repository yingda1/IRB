/* ============================================================
   IRB Process Management System — App Shell / Router / Views
   Plain HTML/CSS/JS. All actions are simulated client-side.
   ============================================================ */

let DB = loadDB();

const DEMO_USERS = {
  user: [
    { name: 'Dr. Tan Wei Ming', school: 'School of Electrical & Electronic Engineering' },
    { name: 'Ms. Farah Aziz', school: 'School of Design' }
  ],
  admin: [
    { name: 'IRB Admin (Grants & Compliance)', school: 'Office of Research & Innovation' }
  ]
};

/* ---------- boot ---------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  renderChrome();
  window.addEventListener('hashchange', route);
  route();
});

function renderChrome() {
  const role = getRole();
  document.getElementById('role-select').value = role;
  populateUserSelect();
  document.getElementById('role-select').addEventListener('change', (e) => {
    setRole(e.target.value);
    populateUserSelect(true);
    renderNav();
    route();
  });
  document.getElementById('user-select').addEventListener('change', (e) => {
    setCurrentUserName(e.target.value);
    route();
  });
  document.getElementById('reset-demo').addEventListener('click', () => {
    if (confirm('Reset all demo data back to the seeded sample? This clears everything stored in this browser.')) {
      DB = resetDB();
      route();
    }
  });
  renderNav();
}

function populateUserSelect(forceDefault) {
  const role = getRole();
  const sel = document.getElementById('user-select');
  sel.innerHTML = '';
  DEMO_USERS[role].forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.name;
    opt.textContent = u.name;
    sel.appendChild(opt);
  });
  const current = getCurrentUserName();
  const valid = DEMO_USERS[role].some(u => u.name === current);
  if (forceDefault || !valid) {
    setCurrentUserName(DEMO_USERS[role][0].name);
  }
  sel.value = getCurrentUserName();
}

function renderNav() {
  const role = getRole();
  const nav = document.getElementById('main-nav');
  const items = [
    ['#/dashboard', 'Dashboard'],
    ['#/submit', 'New Submission'],
    ['#/submissions', role === 'admin' ? 'All Submissions' : 'My Submissions']
  ];
  if (role === 'admin') {
    items.push(['#/admin', 'Routing Queue']);
  }
  nav.innerHTML = items.map(([href, label]) =>
    `<a href="${href}" data-nav="${href}">${label}</a>`
  ).join('');
  highlightNav();
}

function highlightNav() {
  const hash = location.hash || '#/dashboard';
  document.querySelectorAll('#main-nav a').forEach(a => {
    const base = a.getAttribute('data-nav');
    a.classList.toggle('active', hash === base || hash.startsWith(base + '/'));
  });
}

/* ---------- router ---------------------------------------------------- */

function route() {
  DB = loadDB();
  const hash = location.hash || '#/dashboard';
  highlightNav();
  const root = document.getElementById('view-root');
  const [, path, param] = hash.split('/');

  if (!path || path === 'dashboard') return renderDashboard(root);
  if (path === 'submit') return renderSubmit(root);
  if (path === 'submissions' && !param) return renderList(root);
  if (path === 'submissions' && param) return renderDetail(root, param);
  if (path === 'admin') return renderAdminQueue(root);
  root.innerHTML = `<div class="empty-state"><h2>Not found</h2></div>`;
}

/* ---------- shared render helpers ------------------------------------- */

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function stageBadgeClass(sub) {
  const wf = WORKFLOWS[sub.type];
  if (wf.terminal.includes(sub.stage)) {
    if (['Approved', 'Cleared', 'Resolved'].includes(sub.stage)) return 'badge badge-success';
    return 'badge badge-danger';
  }
  if (sub.stage.toLowerCase().includes('revision') || sub.stage.toLowerCase().includes('corrective')) return 'badge badge-warning';
  return 'badge badge-info';
}

function typeBadgeClass(type) {
  return 'badge badge-type badge-type-' + type.replace(/\s+/g, '-').toLowerCase();
}

function ownerOf(sub) {
  const wf = WORKFLOWS[sub.type];
  return wf.owners[sub.stage];
}

function ownerLabel(sub) {
  const owner = ownerOf(sub);
  if (owner === 'admin') return 'IRB Administrator';
  if (owner === 'user') return 'Researcher';
  return '—';
}

/* ---------- Dashboard --------------------------------------------------*/

function renderDashboard(root) {
  const role = getRole();
  const me = getCurrentUserName();
  const all = getSubmissions(DB);
  const mine = role === 'admin' ? all : getSubmissionsForUser(DB, me);

  const counts = { total: mine.length, pendingAdmin: 0, pendingUser: 0, overdue: 0, terminal: 0 };
  mine.forEach(s => {
    const wf = WORKFLOWS[s.type];
    if (wf.terminal.includes(s.stage)) counts.terminal++;
    else if (ownerOf(s) === 'admin') counts.pendingAdmin++;
    else if (ownerOf(s) === 'user') counts.pendingUser++;
    if (isOverdue(s)) counts.overdue++;
  });

  const outstanding = mine
    .filter(s => !WORKFLOWS[s.type].terminal.includes(s.stage))
    .filter(s => role === 'admin' ? ownerOf(s) === 'admin' : ownerOf(s) === 'user')
    .sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));

  const summary = role === 'admin' ? aiStatusSummary(DB) :
    `You have ${mine.length} submission${mine.length === 1 ? '' : 's'} on record. ` +
    (counts.pendingUser ? `${counts.pendingUser} need${counts.pendingUser === 1 ? 's' : ''} your response. ` : 'Nothing is currently waiting on you. ') +
    (counts.overdue ? `⚠ ${counts.overdue} item${counts.overdue === 1 ? ' is' : 's are'} overdue.` : '');

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle">Welcome back, ${escapeHtml(me)}${role === 'admin' ? ' · IRB Administrator view' : ''}</p>
      </div>
      <a class="btn btn-primary" href="#/submit">+ New Submission</a>
    </div>

    <div class="ai-panel">
      <div class="ai-panel-icon">✨</div>
      <div>
        <div class="ai-panel-title">AI Status Summary</div>
        <div class="ai-panel-text">${escapeHtml(summary)}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${counts.total}</div><div class="stat-label">Total submissions</div></div>
      <div class="stat-card"><div class="stat-value">${counts.pendingAdmin}</div><div class="stat-label">Awaiting IRB action</div></div>
      <div class="stat-card"><div class="stat-value">${counts.pendingUser}</div><div class="stat-label">Awaiting researcher</div></div>
      <div class="stat-card ${counts.overdue ? 'stat-card-alert' : ''}"><div class="stat-value">${counts.overdue}</div><div class="stat-label">Overdue</div></div>
      <div class="stat-card"><div class="stat-value">${counts.terminal}</div><div class="stat-label">Closed / Approved</div></div>
    </div>

    <div class="card">
      <h2>Outstanding actions ${role === 'admin' ? '(assigned to IRB Office)' : '(waiting on you)'}</h2>
      ${outstanding.length ? renderTable(outstanding, role) : `<div class="empty-state">Nothing outstanding right now.</div>`}
    </div>

    <div class="card">
      <h2>Recent activity</h2>
      ${renderTable(mine.slice(0, 6), role)}
    </div>
  `;
}

/* ---------- List / table ------------------------------------------------*/

function renderTable(subs, role) {
  if (!subs.length) return `<div class="empty-state">No submissions.</div>`;
  return `
    <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>ID</th><th>Title</th><th>Type</th>
          ${role === 'admin' ? '<th>Researcher</th>' : ''}
          <th>Stage</th><th>Waiting on</th><th>Target date</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${subs.map(s => `
          <tr>
            <td class="mono">${s.id}</td>
            <td>${escapeHtml(s.title)}</td>
            <td><span class="${typeBadgeClass(s.type)}">${s.type}</span></td>
            ${role === 'admin' ? `<td>${escapeHtml(s.researcher)}</td>` : ''}
            <td><span class="${stageBadgeClass(s)}">${escapeHtml(s.stage)}</span></td>
            <td>${ownerLabel(s)}</td>
            <td class="${isOverdue(s) ? 'text-danger' : ''}">${s.dueDate ? fmtDate(s.dueDate) + (isOverdue(s) ? ' (overdue)' : '') : '—'}</td>
            <td><a class="btn btn-sm" href="#/submissions/${s.id}">Open →</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function renderList(root) {
  const role = getRole();
  const me = getCurrentUserName();
  const all = role === 'admin' ? getSubmissions(DB) : getSubmissionsForUser(DB, me);

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${role === 'admin' ? 'All Submissions' : 'My Submissions'}</h1>
        <p class="subtitle">${all.length} submission${all.length === 1 ? '' : 's'}</p>
      </div>
      <a class="btn btn-primary" href="#/submit">+ New Submission</a>
    </div>
    <div class="card filter-bar">
      <label>Type
        <select id="f-type">
          <option value="">All types</option>
          ${Object.keys(WORKFLOWS).map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </label>
      <label>Stage
        <select id="f-stage"><option value="">All stages</option></select>
      </label>
      <label class="checkbox-label"><input type="checkbox" id="f-overdue"> Overdue only</label>
    </div>
    <div class="card" id="list-table-wrap">${renderTable(all, role)}</div>
  `;

  const typeSel = document.getElementById('f-type');
  const stageSel = document.getElementById('f-stage');
  const overdueChk = document.getElementById('f-overdue');

  function refreshStageOptions() {
    const t = typeSel.value;
    const stages = t ? WORKFLOWS[t].stages.concat(['Rejected', 'Withdrawn', 'Closed'].filter(s => WORKFLOWS[t].terminal.includes(s))) : Object.values(WORKFLOWS).flatMap(w => w.stages);
    const uniq = [...new Set(stages)];
    stageSel.innerHTML = `<option value="">All stages</option>` + uniq.map(s => `<option value="${s}">${s}</option>`).join('');
  }
  refreshStageOptions();

  function applyFilters() {
    let filtered = all;
    if (typeSel.value) filtered = filtered.filter(s => s.type === typeSel.value);
    if (stageSel.value) filtered = filtered.filter(s => s.stage === stageSel.value);
    if (overdueChk.checked) filtered = filtered.filter(isOverdue);
    document.getElementById('list-table-wrap').innerHTML = renderTable(filtered, role);
  }

  typeSel.addEventListener('change', () => { refreshStageOptions(); applyFilters(); });
  stageSel.addEventListener('change', applyFilters);
  overdueChk.addEventListener('change', applyFilters);
}

/* ---------- Admin Routing Queue -----------------------------------------*/

function renderAdminQueue(root) {
  const all = getSubmissions(DB);
  const active = all.filter(s => !WORKFLOWS[s.type].terminal.includes(s.stage));
  const byType = {};
  active.forEach(s => { (byType[s.type] = byType[s.type] || []).push(s); });

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Routing Queue</h1>
        <p class="subtitle">AI-assisted routing groups active items by process type and next owner.</p>
      </div>
    </div>
    <div class="ai-panel">
      <div class="ai-panel-icon">🧭</div>
      <div>
        <div class="ai-panel-title">Routing note</div>
        <div class="ai-panel-text">${escapeHtml(aiStatusSummary(DB))}</div>
      </div>
    </div>
    ${Object.keys(WORKFLOWS).map(type => {
      const items = byType[type] || [];
      if (!items.length) return '';
      return `<div class="card">
        <h2><span class="${typeBadgeClass(type)}">${type}</span> <span class="muted">(${items.length} active)</span></h2>
        ${renderTable(items, 'admin')}
      </div>`;
    }).join('') || `<div class="empty-state">No active items in the queue.</div>`}
  `;
}

/* ---------- New Submission ----------------------------------------------*/

const TYPE_FIELD_CONFIG = {
  'New Application': [
    { key: 'riskLevel', label: 'Risk level', type: 'select', options: ['Minimal Risk', 'Greater than Minimal Risk'] },
    { key: 'participants', label: 'Participant description', type: 'text', placeholder: 'e.g. 60 students, aged 17-20' }
  ],
  'Amendment': [
    { key: 'linkedProjectId', label: 'Linked project ID', type: 'project-select' }
  ],
  'Incident Report': [
    { key: 'linkedProjectId', label: 'Linked project ID', type: 'project-select' },
    { key: 'severity', label: 'Severity', type: 'select', options: ['Minor', 'Moderate', 'Serious'] }
  ],
  'Publication Clearance': [
    { key: 'linkedProjectId', label: 'Linked project ID', type: 'project-select' }
  ]
};

function renderSubmit(root) {
  const role = getRole();
  const me = getCurrentUserName();
  const myProjects = getSubmissions(DB).filter(s => s.type === 'New Application' && (role === 'admin' || s.researcher === me));

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>New Submission</h1>
        <p class="subtitle">Fill in the details below. AI Assist will suggest a workflow and flag missing information as you type.</p>
      </div>
    </div>

    <div class="layout-2col">
      <div class="card">
        <form id="submit-form">
          <div class="form-row">
            <label>Free-text description <span class="muted">(optional — used by AI Assist to suggest a type)</span></label>
            <textarea id="f-freetext" rows="2" placeholder="Describe what you need, e.g. 'We had a data breach involving...' "></textarea>
          </div>

          <div class="form-row">
            <label>Submission type *</label>
            <select id="f-subtype" required>
              ${Object.keys(WORKFLOWS).map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>

          <div class="form-row">
            <label>Title *</label>
            <input type="text" id="f-title" placeholder="Short descriptive title" required>
          </div>

          <div class="form-row-2">
            <div>
              <label>Researcher *</label>
              <input type="text" id="f-researcher" value="${escapeHtml(me)}" ${role === 'user' ? 'readonly' : ''}>
            </div>
            <div>
              <label>School / Centre *</label>
              <input type="text" id="f-school" placeholder="e.g. School of Design">
            </div>
          </div>

          <div class="form-row">
            <label>Summary *</label>
            <textarea id="f-summary" rows="3" placeholder="Briefly describe the purpose and scope"></textarea>
          </div>

          <div id="dynamic-fields"></div>

          <div class="form-row">
            <label>Supporting documents <span class="muted">(filenames only — demo)</span></label>
            <input type="file" id="f-docs" multiple>
          </div>

          <button type="submit" class="btn btn-primary">Submit</button>
        </form>
      </div>

      <div class="card ai-sidebar">
        <div class="ai-panel-title">✨ AI Assist</div>
        <div id="ai-suggest" class="ai-block"></div>
        <div id="ai-missing" class="ai-block"></div>
      </div>
    </div>
  `;

  const subtypeSel = document.getElementById('f-subtype');
  const freetext = document.getElementById('f-freetext');
  const dynamicWrap = document.getElementById('dynamic-fields');

  function renderDynamicFields() {
    const type = subtypeSel.value;
    const cfg = TYPE_FIELD_CONFIG[type] || [];
    dynamicWrap.innerHTML = cfg.map(f => {
      if (f.type === 'select') {
        return `<div class="form-row"><label>${f.label} *</label>
          <select id="dyn-${f.key}" data-key="${f.key}">
            ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
          </select></div>`;
      }
      if (f.type === 'project-select') {
        return `<div class="form-row"><label>${f.label} *</label>
          <select id="dyn-${f.key}" data-key="${f.key}">
            <option value="">— Select approved project —</option>
            ${myProjects.map(p => `<option value="${p.id}">${p.id} — ${escapeHtml(p.title)}</option>`).join('')}
          </select></div>`;
      }
      return `<div class="form-row"><label>${f.label} *</label>
        <input type="text" id="dyn-${f.key}" data-key="${f.key}" placeholder="${f.placeholder || ''}"></div>`;
    }).join('');
    dynamicWrap.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateAiMissing));
    updateAiMissing();
  }

  function currentFormData() {
    const type = subtypeSel.value;
    const data = {
      type,
      title: document.getElementById('f-title').value,
      researcher: document.getElementById('f-researcher').value,
      school: document.getElementById('f-school').value,
      summary: document.getElementById('f-summary').value
    };
    (TYPE_FIELD_CONFIG[type] || []).forEach(f => {
      const el = document.getElementById('dyn-' + f.key);
      if (el) data[f.key] = el.value;
    });
    return data;
  }

  function updateAiMissing() {
    const data = currentFormData();
    const missing = aiDetectMissing(data.type, data);
    const el = document.getElementById('ai-missing');
    if (missing.length) {
      el.innerHTML = `<div class="ai-warning">⚠ Missing: ${missing.map(escapeHtml).join(', ')}</div>`;
    } else {
      el.innerHTML = `<div class="ai-ok">✓ All required fields for "${data.type}" look complete.</div>`;
    }
  }

  freetext.addEventListener('input', () => {
    const suggestion = aiSuggestType(freetext.value);
    const el = document.getElementById('ai-suggest');
    if (suggestion.type && suggestion.confidence > 0) {
      el.innerHTML = `<div class="ai-suggest-box">
        Suggested type: <strong>${suggestion.type}</strong> (${Math.round(suggestion.confidence * 100)}% match)
        <button type="button" class="btn btn-sm" id="apply-suggestion">Use this</button>
      </div>`;
      document.getElementById('apply-suggestion').addEventListener('click', () => {
        subtypeSel.value = suggestion.type;
        renderDynamicFields();
      });
    } else {
      el.innerHTML = `<div class="muted">Start typing a description to get a workflow suggestion.</div>`;
    }
  });

  subtypeSel.addEventListener('change', renderDynamicFields);
  ['f-title', 'f-researcher', 'f-school', 'f-summary'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateAiMissing)
  );

  renderDynamicFields();

  document.getElementById('submit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = currentFormData();
    const missing = aiDetectMissing(data.type, data);
    if (missing.length) {
      alert('Please complete all required fields before submitting:\n' + missing.join(', '));
      return;
    }
    const docsInput = document.getElementById('f-docs');
    data.documents = Array.from(docsInput.files || []).map(f => ({ name: f.name, size: f.size }));
    const sub = addSubmission(DB, data);
    location.hash = '#/submissions/' + sub.id;
  });
}

/* ---------- Submission Detail --------------------------------------------*/

function renderDetail(root, id) {
  const sub = getSubmissionById(DB, id);
  if (!sub) {
    root.innerHTML = `<div class="empty-state"><h2>Submission not found</h2><a class="btn" href="#/submissions">Back to list</a></div>`;
    return;
  }
  const role = getRole();
  const me = getCurrentUserName();
  const wf = WORKFLOWS[sub.type];
  const isOwnerNow = ownerOf(sub) === role;
  const canAct = isOwnerNow && (role === 'admin' || sub.researcher === me);
  const linked = sub.linkedProjectId ? getSubmissionById(DB, sub.linkedProjectId) : null;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <div class="breadcrumb"><a href="#/submissions">← Back</a></div>
        <h1>${escapeHtml(sub.title)}</h1>
        <p class="subtitle mono">${sub.id} · <span class="${typeBadgeClass(sub.type)}">${sub.type}</span> · <span class="${stageBadgeClass(sub)}">${escapeHtml(sub.stage)}</span></p>
      </div>
    </div>

    <div class="layout-2col">
      <div>
        <div class="card">
          <h2>Details</h2>
          <dl class="detail-list">
            <dt>Researcher</dt><dd>${escapeHtml(sub.researcher)}</dd>
            <dt>School / Centre</dt><dd>${escapeHtml(sub.school || '—')}</dd>
            <dt>Summary</dt><dd>${escapeHtml(sub.summary || '—')}</dd>
            ${sub.riskLevel ? `<dt>Risk level</dt><dd>${escapeHtml(sub.riskLevel)}</dd>` : ''}
            ${sub.participants ? `<dt>Participants</dt><dd>${escapeHtml(sub.participants)}</dd>` : ''}
            ${sub.severity ? `<dt>Severity</dt><dd>${escapeHtml(sub.severity)}</dd>` : ''}
            ${linked ? `<dt>Linked project</dt><dd><a href="#/submissions/${linked.id}">${linked.id} — ${escapeHtml(linked.title)}</a></dd>` : ''}
            <dt>Assigned to</dt><dd>${escapeHtml(sub.assignedTo || '—')}</dd>
            <dt>Created</dt><dd>${fmtDate(sub.createdAt)}</dd>
            <dt>Last updated</dt><dd>${fmtDateTime(sub.updatedAt)}</dd>
            <dt>Target action date</dt><dd class="${isOverdue(sub) ? 'text-danger' : ''}">${sub.dueDate ? fmtDate(sub.dueDate) + (isOverdue(sub) ? ' — overdue' : '') : '—'}</dd>
            <dt>Documents</dt><dd>${sub.documents && sub.documents.length ? sub.documents.map(d => escapeHtml(d.name)).join(', ') : 'None attached'}</dd>
          </dl>
        </div>

        <div class="card">
          <h2>Workflow progress</h2>
          ${renderStepper(sub)}
        </div>

        <div class="card">
          <h2>History</h2>
          ${renderHistory(sub)}
        </div>

        <div class="card">
          <h2>Comments</h2>
          ${renderComments(sub)}
          <form id="comment-form" class="comment-form">
            <textarea id="comment-text" rows="2" placeholder="Add a comment..."></textarea>
            <button type="submit" class="btn btn-sm btn-primary">Post comment</button>
          </form>
        </div>
      </div>

      <div class="card action-panel">
        <h2>Actions</h2>
        ${renderActions(sub, role, canAct)}
      </div>
    </div>
  `;

  document.getElementById('comment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('comment-text').value.trim();
    if (!text) return;
    addComment(DB, sub.id, role, getCurrentUserName(), text);
    route();
  });

  wireActionButtons(sub);
}

function renderStepper(sub) {
  const wf = WORKFLOWS[sub.type];
  const isTerminalOther = wf.terminal.includes(sub.stage) && !['Approved', 'Cleared', 'Resolved'].includes(sub.stage);
  const stages = wf.stages;
  const currentIdx = stages.indexOf(sub.stage);
  return `<div class="stepper">
    ${stages.map((s, i) => {
      let cls = 'step';
      if (isTerminalOther) cls += ' step-skip';
      else if (i < currentIdx || (i === currentIdx && wf.terminal.includes(sub.stage))) cls += ' step-done';
      else if (i === currentIdx) cls += ' step-current';
      return `<div class="${cls}"><div class="step-dot"></div><div class="step-label">${s}</div></div>`;
    }).join('<div class="step-connector"></div>')}
    ${isTerminalOther ? `<div class="step-connector"></div><div class="step step-current step-danger"><div class="step-dot"></div><div class="step-label">${sub.stage}</div></div>` : ''}
  </div>`;
}

function renderHistory(sub) {
  if (!sub.history.length) return `<div class="empty-state">No history yet.</div>`;
  return `<ul class="timeline">
    ${sub.history.slice().reverse().map(ev => `
      <li>
        <div class="timeline-dot"></div>
        <div>
          <div class="timeline-title">${escapeHtml(ev.stage)} <span class="muted">· ${ev.actor === 'admin' ? 'IRB Administrator' : 'Researcher'}</span></div>
          <div class="timeline-meta">${fmtDateTime(ev.ts)}</div>
          ${ev.note ? `<div class="timeline-note">${escapeHtml(ev.note)}</div>` : ''}
        </div>
      </li>
    `).join('')}
  </ul>`;
}

function renderComments(sub) {
  if (!sub.comments.length) return `<div class="empty-state">No comments yet.</div>`;
  return `<ul class="comment-list">
    ${sub.comments.map(cm => `
      <li>
        <div class="comment-head"><strong>${escapeHtml(cm.actorName)}</strong> <span class="muted">${cm.actorRole === 'admin' ? 'IRB Administrator' : 'Researcher'} · ${fmtDateTime(cm.ts)}</span></div>
        <div class="comment-body">${escapeHtml(cm.text)}</div>
      </li>
    `).join('')}
  </ul>`;
}

function renderActions(sub, role, canAct) {
  const wf = WORKFLOWS[sub.type];
  const isTerminal = wf.terminal.includes(sub.stage);

  if (isTerminal) {
    return `<div class="empty-state">This item is closed (${sub.stage}). No further action is required.</div>`;
  }

  if (!canAct) {
    return `<div class="empty-state">Currently waiting on <strong>${ownerLabel(sub)}</strong>. No action needed from you right now.</div>`;
  }

  const stageIdx = wf.stages.indexOf(sub.stage);
  const nextStage = wf.stages[stageIdx + 1];

  let buttons = '';

  if (role === 'admin') {
    if (nextStage) {
      buttons += `<button class="btn btn-primary action-btn" data-action="advance" data-target="${nextStage}">Advance to "${nextStage}"</button>`;
    }
    if (sub.stage !== 'Revisions Requested' && sub.stage !== 'Corrective Action Required' && wf.stages.includes('Revisions Requested')) {
      buttons += `<button class="btn action-btn" data-action="advance" data-target="Revisions Requested">Request revisions</button>`;
    }
    if (wf.stages.includes('Corrective Action Required') && sub.stage !== 'Corrective Action Required') {
      buttons += `<button class="btn action-btn" data-action="advance" data-target="Corrective Action Required">Require corrective action</button>`;
    }
    if (wf.terminal.includes('Rejected')) {
      buttons += `<button class="btn btn-danger action-btn" data-action="advance" data-target="Rejected">Reject</button>`;
    } else if (wf.stages.includes('Resolved')) {
      buttons += `<button class="btn btn-danger action-btn" data-action="advance" data-target="Closed">Close without resolution</button>`;
    }
  } else {
    // researcher responding to revisions / corrective action → sends back to review
    const reviewStage = wf.stages.includes('Under Review') ? 'Under Review' : (wf.stages.includes('Under Investigation') ? 'Under Investigation' : wf.stages[1]);
    buttons += `<button class="btn btn-primary action-btn" data-action="advance" data-target="${reviewStage}">Resubmit for review</button>`;
    if (wf.terminal.includes('Withdrawn')) {
      buttons += `<button class="btn action-btn" data-action="advance" data-target="Withdrawn">Withdraw submission</button>`;
    }
  }

  return `<div class="action-buttons">${buttons}</div>
    <div class="form-row" style="margin-top:12px">
      <label>Note (optional, added to history)</label>
      <textarea id="action-note" rows="2" placeholder="Add context for this action..."></textarea>
    </div>`;
}

function wireActionButtons(sub) {
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      const note = (document.getElementById('action-note') || {}).value || '';
      advanceStage(DB, sub.id, target, getRole(), note);
      route();
    });
  });
}
