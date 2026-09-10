/* ============================================================
   IRB Process Management System — App Shell / Router / Views
   Plain HTML/CSS/JS. All actions are simulated client-side.
   Scope: IRPF only (see data.js header for what's out of scope).
   ============================================================ */

let DB = loadDB();

/* ---------- boot ---------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  renderChrome();
  window.addEventListener('hashchange', route);
  route();
});

function renderChrome() {
  const roleSel = document.getElementById('role-select');
  roleSel.innerHTML = Object.entries(ROLES).map(([id, r]) => `<option value="${id}">${r.label}</option>`).join('');
  roleSel.value = getRole();
  populateActorSelect();
  roleSel.addEventListener('change', (e) => {
    setRole(e.target.value);
    populateActorSelect(true);
    renderNav();
    route();
  });
  document.getElementById('actor-select').addEventListener('change', (e) => {
    setActorId(e.target.value);
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

function populateActorSelect(forceDefault) {
  const role = getRole();
  const sel = document.getElementById('actor-select');
  sel.innerHTML = ACTORS[role].map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const current = getActorId();
  const valid = ACTORS[role].some(a => a.id === current);
  if (forceDefault || !valid) setActorId(ACTORS[role][0].id);
  sel.value = getActorId();
}

function renderNav() {
  const role = getRole();
  const nav = document.getElementById('main-nav');
  const items = [['#/dashboard', 'Dashboard']];
  if (role === 'pi') items.push(['#/new', 'New IRPF']);
  items.push(['#/submissions', 'IRPF Submissions']);
  nav.innerHTML = items.map(([href, label]) => `<a href="${href}" data-nav="${href}">${label}</a>`).join('');
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
  if (path === 'new') return renderNewForm(root);
  if (path === 'submissions' && !param) return renderList(root);
  if (path === 'submissions' && param) return renderDetail(root, param);
  root.innerHTML = `<div class="empty-state"><h2>Not found</h2></div>`;
}

/* ---------- shared helpers ------------------------------------------- */

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtInputDateDisplay(isoDate) {
  if (!isoDate) return '—';
  return fmtDate(new Date(isoDate + 'T00:00:00').getTime());
}

function stageBadgeClass(sub) {
  if (isTerminal(sub)) return sub.stage === 'Approved for Exemption' ? 'badge badge-success' : 'badge badge-info';
  if (sub.stage === 'Returned for Amendments') return 'badge badge-warning';
  return 'badge badge-info';
}

/* ---------- Dashboard --------------------------------------------------*/

function renderDashboard(root) {
  const role = getRole();
  const actor = getActor();
  const all = getSubmissions(DB);
  const mine = scopedSubmissions(all, role, actor);
  const outstanding = mine.filter(s => canActNow(s, role, actor.id));

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle">Welcome back, ${escapeHtml(actor.name)} · ${escapeHtml(ROLES[role].label)}</p>
      </div>
      ${role === 'pi' ? `<a class="btn btn-primary" href="#/new">+ New IRPF</a>` : ''}
    </div>

    <div class="ai-panel">
      <div class="ai-panel-icon">🧭</div>
      <div>
        <div class="ai-panel-title">Role permissions</div>
        <div class="ai-panel-text">${escapeHtml(ROLES[role].permissions)}</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${mine.length}</div><div class="stat-label">Visible to you</div></div>
      <div class="stat-card ${outstanding.length ? 'stat-card-alert' : ''}"><div class="stat-value">${outstanding.length}</div><div class="stat-label">Awaiting your action</div></div>
    </div>

    <div class="card">
      <h2>Awaiting your action</h2>
      ${outstanding.length ? renderTable(outstanding, role) : `<div class="empty-state">Nothing outstanding right now.</div>`}
    </div>

    <div class="card">
      <h2>Recent activity</h2>
      ${renderTable(mine.slice(0, 8), role)}
    </div>
  `;
}

function scopedSubmissions(all, role, actor) {
  switch (role) {
    case 'pi': return all.filter(s => s.piActorId === actor.id);
    case 'director': return all; // demo simplification — not scoped per school
    case 'poc': return all;
    case 'admin-edu': return all.filter(s => s.secretariat === 'EDU');
    case 'admin-tie': return all.filter(s => s.secretariat === 'TIE');
    case 'reviewer': return all.filter(s => s.reviewers.some(r => r.actorId === actor.id));
    default: return [];
  }
}

/* ---------- List / table ------------------------------------------------*/

function renderTable(subs, role) {
  if (!subs.length) return `<div class="empty-state">No submissions.</div>`;
  return `
    <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>Reference No.</th><th>Title</th><th>PI</th><th>Status</th><th>Last updated</th><th></th></tr></thead>
      <tbody>
        ${subs.map(s => `
          <tr>
            <td class="mono">${s.referenceNumber || '<span class="muted">Draft (unassigned)</span>'}</td>
            <td>${escapeHtml(s.title || '(untitled)')}</td>
            <td>${escapeHtml(actorName(s.piActorId))}</td>
            <td><span class="${stageBadgeClass(s)}">${escapeHtml(stageStatusLabel(s))}</span></td>
            <td>${fmtDateTime(s.updatedAt)}</td>
            <td><a class="btn btn-sm" href="#/submissions/${s.recordId}">Open →</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

function renderList(root) {
  const role = getRole();
  const actor = getActor();
  const all = scopedSubmissions(getSubmissions(DB), role, actor);
  root.innerHTML = `
    <div class="page-header">
      <div><h1>IRPF Submissions</h1><p class="subtitle">${all.length} record${all.length === 1 ? '' : 's'} visible to ${escapeHtml(ROLES[role].label)}</p></div>
      ${role === 'pi' ? `<a class="btn btn-primary" href="#/new">+ New IRPF</a>` : ''}
    </div>
    <div class="card">${renderTable(all, role)}</div>
  `;
}

/* ---------- IRPF field rendering (shared by New + Detail-edit) ----------*/

function tooltipIcon(text) {
  if (!text) return '';
  return ` <span class="tip" tabindex="0" title="${escapeHtml(text)}">ⓘ</span>`;
}

function renderFieldEdit(f, data) {
  const val = data[f.key] != null ? data[f.key] : '';
  const isReq = f.required || (f.requiredIf && f.requiredIf(data));
  const label = `<label>${escapeHtml(f.label)}${isReq ? ' *' : ''}${tooltipIcon(f.tooltip)}</label>`;
  let input = '';

  if (f.type === 'text') {
    input = `<input type="text" data-key="${f.key}" value="${escapeHtml(val)}">`;
  } else if (f.type === 'textarea') {
    input = `<textarea data-key="${f.key}" rows="4">${escapeHtml(val)}</textarea>`;
  } else if (f.type === 'date') {
    input = `<input type="date" data-key="${f.key}" value="${escapeHtml(val)}">`;
  } else if (f.type === 'radio') {
    input = `<div class="radio-row">${f.options.map(o => `
      <label class="radio-opt"><input type="radio" name="fld-${f.key}" data-key="${f.key}" value="${o}" ${val === o ? 'checked' : ''}> ${o}</label>
    `).join('')}</div>`;
  } else if (f.type === 'yesno') {
    input = `<div class="radio-row">${['Yes', 'No'].map(o => `
      <label class="radio-opt"><input type="radio" name="fld-${f.key}" data-key="${f.key}" value="${o}" ${val === o ? 'checked' : ''}> ${o}</label>
    `).join('')}</div>`;
  } else if (f.type === 'yesna') {
    input = `<div class="radio-row">${['Yes', 'N.A.'].map(o => `
      <label class="radio-opt"><input type="radio" name="fld-${f.key}" data-key="${f.key}" value="${o}" ${val === o ? 'checked' : ''}> ${o}</label>
    `).join('')}</div>`;
  } else if (f.type === 'files') {
    const existing = (data[f.key] || []).map(d => escapeHtml(d.name)).join(', ');
    input = `
      <input type="file" data-key="${f.key}" multiple>
      <div class="file-existing muted">${existing ? 'Attached: ' + existing : 'No files attached yet (filenames only — demo).'}</div>
    `;
  }

  const counter = f.maxWords ? `<div class="counter" id="counter-${f.key}">${wordCount(val)} / ${f.maxWords} words</div>`
    : f.maxChars ? `<div class="counter" id="counter-${f.key}">${String(val).length} / ${f.maxChars} characters</div>` : '';
  const note = f.note ? `<div class="field-note muted">${escapeHtml(f.note)}</div>` : '';

  return `<div class="form-row" id="field-${f.key}">${label}${input}${counter}${note}</div>`;
}

function renderFieldReadonly(f, data) {
  const val = data[f.key];
  let display;
  if (f.type === 'files') {
    display = (val && val.length) ? val.map(d => escapeHtml(d.name)).join(', ') : '—';
  } else if (f.type === 'date') {
    display = val ? fmtInputDateDisplay(val) : '—';
  } else {
    display = val ? escapeHtml(val).replace(/\n/g, '<br>') : '—';
  }
  return `<dt>${escapeHtml(f.label)}${tooltipIcon(f.tooltip)}</dt><dd>${display}</dd>`;
}

function renderIrpfSections(data, mode) {
  // mode: 'edit' | 'readonly'
  return IRPF_SECTIONS.map(section => `
    <div class="form-section">
      <h3 class="form-section-title">${escapeHtml(section.title)}</h3>
      ${mode === 'edit'
        ? section.fields.map(f => renderFieldEdit(f, data)).join('')
        : `<dl class="detail-list">${section.fields.map(f => renderFieldReadonly(f, data)).join('')}</dl>`
      }
    </div>
  `).join('');
}

function wireFieldInputs(container, formState, onControllingChange) {
  container.querySelectorAll('input[type="text"], textarea, input[type="date"]').forEach(el => {
    el.addEventListener('input', () => {
      formState[el.dataset.key] = el.value;
      const counterEl = document.getElementById('counter-' + el.dataset.key);
      if (counterEl) {
        const fieldCfg = IRPF_SECTIONS.flatMap(s => s.fields).find(f => f.key === el.dataset.key);
        if (fieldCfg.maxWords) counterEl.textContent = `${wordCount(el.value)} / ${fieldCfg.maxWords} words`;
        if (fieldCfg.maxChars) counterEl.textContent = `${el.value.length} / ${fieldCfg.maxChars} characters`;
      }
    });
  });
  container.querySelectorAll('input[type="radio"]').forEach(el => {
    el.addEventListener('change', () => {
      formState[el.dataset.key] = el.value;
      onControllingChange();
    });
  });
  container.querySelectorAll('input[type="file"]').forEach(el => {
    el.addEventListener('change', () => {
      formState[el.dataset.key] = Array.from(el.files || []).map(f => ({ name: f.name, size: f.size }));
      onControllingChange();
    });
  });
}

/* ---------- New IRPF ------------------------------------------------- */

function renderNewForm(root) {
  const actor = getActor();
  const formState = { piActorId: actor.id, piName: actor.name, piSchoolDept: actor.school };

  function paint() {
    root.innerHTML = `
      <div class="page-header">
        <div><h1>New IRPF</h1><p class="subtitle">Initialisation of R&amp;D Project Form. Reference number is assigned automatically on Submit.</p></div>
      </div>
      <div class="card">
        <div id="new-form-problems"></div>
        <form id="irpf-form">
          ${renderIrpfSections(formState, 'edit')}
          <div class="form-actions">
            <button type="button" class="btn" id="btn-save-draft">Save Draft</button>
            <button type="submit" class="btn btn-primary">Submit</button>
          </div>
        </form>
      </div>
    `;
    const container = document.getElementById('irpf-form');
    wireFieldInputs(container, formState, paint);

    document.getElementById('btn-save-draft').addEventListener('click', () => {
      const rec = newIrpfRecord(DB, actor.id);
      Object.assign(rec, formState);
      DB.submissions.push(rec);
      saveDB(DB);
      location.hash = '#/submissions/' + rec.recordId;
    });

    container.addEventListener('submit', (e) => {
      e.preventDefault();
      const problems = validateIrpfFields(formState);
      if (problems.length) {
        renderProblems(problems);
        return;
      }
      const rec = newIrpfRecord(DB, actor.id);
      Object.assign(rec, formState);
      DB.submissions.push(rec);
      saveDB(DB);
      const result = submitIrpf(DB, rec.recordId, actor.id, {});
      if (result.ok) {
        location.hash = '#/submissions/' + rec.recordId;
      } else {
        renderProblems(result.problems);
      }
    });
  }

  function renderProblems(problems) {
    document.getElementById('new-form-problems').innerHTML = `
      <div class="ai-warning" style="margin-bottom:14px">
        <strong>Please resolve the following before submitting:</strong>
        <ul>${problems.map(p => `<li>${escapeHtml(p.label)}: ${escapeHtml(p.message)}</li>`).join('')}</ul>
      </div>`;
  }

  paint();
}

/* ---------- Detail ----------------------------------------------------- */

function renderDetail(root, id) {
  const sub = getSubmissionById(DB, id);
  if (!sub) {
    root.innerHTML = `<div class="empty-state"><h2>Submission not found</h2><a class="btn" href="#/submissions">Back to list</a></div>`;
    return;
  }
  const role = getRole();
  const actor = getActor();
  const editable = (sub.stage === 'Draft' || sub.stage === 'Returned for Amendments') && role === 'pi' && sub.piActorId === actor.id;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <div class="breadcrumb"><a href="#/submissions">← Back</a></div>
        <h1>${escapeHtml(sub.title || '(untitled)')}</h1>
        <p class="subtitle mono">${sub.referenceNumber || 'Draft (reference number not yet assigned)'} · <span class="${stageBadgeClass(sub)}">${escapeHtml(stageStatusLabel(sub))}</span></p>
      </div>
    </div>

    <div class="layout-2col">
      <div>
        ${editable ? renderEditableDetail(sub) : renderReadonlyDetail(sub)}

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
        ${renderActionPanel(sub, role, actor)}
      </div>
    </div>
  `;

  document.getElementById('comment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('comment-text').value.trim();
    if (!text) return;
    addComment(DB, sub.recordId, actor.id, text);
    route();
  });

  wireActionPanel(sub, role, actor);
}

function renderReadonlyDetail(sub) {
  return `<div class="card"><h2>Project Details</h2>${renderIrpfSections(sub, 'readonly')}
    <div class="form-section">
      <h3 class="form-section-title">Signatures</h3>
      <dl class="detail-list">
        <dt>Date of Submission (PI)</dt><dd>${sub.piSubmissionDate ? fmtInputDateDisplay(sub.piSubmissionDate) : '—'}</dd>
        <dt>Name of Director (Endorser)</dt><dd>${escapeHtml(sub.directorName || '—')}</dd>
        <dt>School / Department / Centre (Director)</dt><dd>${escapeHtml(sub.directorSchoolDept || '—')}</dd>
        <dt>Date (Director)</dt><dd>${sub.directorDate ? fmtInputDateDisplay(sub.directorDate) : '—'}</dd>
      </dl>
    </div>
  </div>`;
}

function renderEditableDetail(sub) {
  // Live-editable version, same field renderer as New IRPF, pre-filled.
  const formState = Object.assign({}, sub);
  const html = `<div class="card">
    <h2>Project Details ${sub.stage === 'Returned for Amendments' ? '<span class="muted">(editing — amendments requested)</span>' : '(editing draft)'}</h2>
    <div id="detail-form-problems"></div>
    <form id="irpf-detail-form">
      ${renderIrpfSections(formState, 'edit')}
      <div class="form-actions">
        <button type="button" class="btn" id="btn-save-draft-detail">Save</button>
        <button type="submit" class="btn btn-primary">${sub.stage === 'Returned for Amendments' ? 'Resubmit' : 'Submit'}</button>
      </div>
    </form>
  </div>`;
  // deferred wiring happens in renderDetail's caller via a mutation observer substitute:
  setTimeout(() => wireDetailForm(sub.recordId, formState), 0);
  return html;
}

function wireDetailForm(recordId, formState) {
  const container = document.getElementById('irpf-detail-form');
  if (!container) return;

  function onControllingChange() {
    // A conditionally-required field's controlling value changed — rebuild
    // just this form region in place using the latest formState.
    const actionsHtml = container.querySelector('.form-actions').outerHTML;
    container.innerHTML = renderIrpfSections(formState, 'edit') + actionsHtml;
    wireFieldInputs(container, formState, onControllingChange);
    wireDetailFormButtons(recordId, formState, container);
  }

  wireFieldInputs(container, formState, onControllingChange);
  wireDetailFormButtons(recordId, formState, container);
}

function wireDetailFormButtons(recordId, formState, container) {
  const saveBtn = document.getElementById('btn-save-draft-detail');
  if (saveBtn) saveBtn.onclick = () => {
    saveDraft(DB, recordId, getActor().id, formState);
    route();
  };
  container.onsubmit = (e) => {
    e.preventDefault();
    const result = submitIrpf(DB, recordId, getActor().id, formState);
    if (!result.ok) {
      document.getElementById('detail-form-problems').innerHTML = `
        <div class="ai-warning" style="margin-bottom:14px">
          <strong>Please resolve the following before submitting:</strong>
          <ul>${result.problems.map(p => `<li>${escapeHtml(p.label)}: ${escapeHtml(p.message)}</li>`).join('')}</ul>
        </div>`;
      return;
    }
    route();
  };
}

function renderHistory(sub) {
  if (!sub.history.length) return `<div class="empty-state">No history yet.</div>`;
  return `<ul class="timeline">
    ${sub.history.slice().reverse().map(ev => `
      <li>
        <div class="timeline-dot"></div>
        <div>
          <div class="timeline-title">${escapeHtml(ev.event)} <span class="muted">· ${escapeHtml(ev.actorName)}</span></div>
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
    ${sub.comments.map(c => `
      <li>
        <div class="comment-head"><strong>${escapeHtml(c.actorName)}</strong> <span class="muted">${escapeHtml(ROLES[c.role] ? ROLES[c.role].label : c.role)} · ${fmtDateTime(c.ts)}</span></div>
        <div class="comment-body">${escapeHtml(c.text)}</div>
      </li>
    `).join('')}
  </ul>`;
}

/* ---------- Action panel ------------------------------------------------*/

function canActNow(sub, role, actorId) {
  if (sub.stage === 'Draft') return role === 'pi' && sub.piActorId === actorId;
  if (sub.stage === 'For Review' && !sub.directorDate) return role === 'director';
  if (sub.stage === 'For Review' && sub.directorDate) return role === (sub.secretariat === 'EDU' ? 'admin-edu' : 'admin-tie');
  if (sub.stage === 'Pending Review' && !allReviewersResponded(sub)) {
    return role === 'reviewer' && sub.reviewers.some(r => r.actorId === actorId && r.decision === 'pending');
  }
  if (sub.stage === 'Pending Review' && allReviewersResponded(sub)) return role === (sub.secretariat === 'EDU' ? 'admin-edu' : 'admin-tie');
  if (sub.stage === 'Returned for Amendments') return role === 'pi' && sub.piActorId === actorId;
  if (isTerminal(sub) && !sub.acknowledged) return role === 'pi' && sub.piActorId === actorId;
  return false;
}

function renderActionPanel(sub, role, actor) {
  if (!canActNow(sub, role, actor.id)) {
    if (isTerminal(sub) && sub.acknowledged) {
      return `<div class="empty-state">Closed (${escapeHtml(sub.stage)}). No further action required.</div>`;
    }
    return `<div class="empty-state">Currently with <strong>${escapeHtml(currentOwnerLabel(sub))}</strong>. No action needed from you right now.</div>`;
  }

  if (sub.stage === 'Draft') {
    return `<div class="empty-state">Use the form on the left to Save or Submit.</div>`;
  }

  if (sub.stage === 'For Review' && !sub.directorDate) {
    return `
      <p class="muted" style="font-size:13px">Approve to route this IRPF to the ${escapeHtml(sub.category === 'Educational Research' ? 'EDU' : 'TIE')} Secretariat, or return it to the PI.</p>
      <div class="form-row"><label>Note (added to history)</label><textarea id="action-note" rows="2"></textarea></div>
      <div class="action-buttons">
        <button class="btn btn-primary" id="btn-director-approve">Approve</button>
        <button class="btn btn-danger" id="btn-director-return">Return to PI</button>
      </div>`;
  }

  if (sub.stage === 'For Review' && sub.directorDate) {
    const roster = ACTORS.reviewer;
    return `
      <p class="muted" style="font-size:13px">Assign IRB reviewers and send for review. All assigned reviewers are notified together and may review in any order.</p>
      <div class="form-row"><label>Reviewers</label>
        ${roster.map(r => `<label class="checkbox-label" style="display:flex"><input type="checkbox" class="reviewer-chk" value="${r.id}"> ${escapeHtml(r.name)}</label>`).join('')}
      </div>
      <div class="form-row"><label>Note (added to history)</label><textarea id="action-note" rows="2"></textarea></div>
      <button class="btn btn-primary" id="btn-send-review">Send</button>`;
  }

  if (sub.stage === 'Pending Review' && !allReviewersResponded(sub)) {
    return `
      <p class="muted" style="font-size:13px">Record your independent recommendation. The Secretariat can only decide once every assigned reviewer has responded.</p>
      <div class="form-row"><label>Recommendation</label>
        <select id="reviewer-decision">
          <option value="Agree">Agree</option>
          <option value="Request Amendments">Request Amendments</option>
        </select>
      </div>
      <div class="form-row"><label>Comment</label><textarea id="reviewer-comment" rows="3" placeholder="Share your assessment..."></textarea></div>
      <button class="btn btn-primary" id="btn-reviewer-submit">Submit recommendation</button>`;
  }

  if (sub.stage === 'Pending Review' && allReviewersResponded(sub)) {
    return `
      <p class="muted" style="font-size:13px">All ${sub.reviewers.length} reviewers have responded. Record the collated decision.</p>
      ${renderReviewerSummary(sub)}
      <div class="form-row"><label>Secretariat comment</label><textarea id="action-note" rows="2"></textarea></div>
      <div class="action-buttons">
        <button class="btn btn-primary" id="btn-outcome-exempt">Approved for Exemption</button>
        <button class="btn" id="btn-outcome-ipaf">To Create IPAF</button>
        <button class="btn btn-danger" id="btn-outcome-return">Returned for Amendments</button>
      </div>`;
  }

  if (sub.stage === 'Returned for Amendments') {
    return `<div class="empty-state">Use the form on the left to amend and Resubmit.</div>`;
  }

  if (isTerminal(sub) && !sub.acknowledged) {
    const msg = sub.stage === 'Approved for Exemption'
      ? 'This project is cleared without requiring a full protocol application (IPAF).'
      : 'A full IPAF is required for this project. Acknowledge to proceed.';
    return `
      <div class="ai-ok" style="margin-bottom:12px">${escapeHtml(msg)}</div>
      <button class="btn btn-primary" id="btn-acknowledge">Acknowledge</button>
      ${sub.stage === 'To Create IPAF' ? `<button class="btn" disabled title="IPAF workflow not yet implemented in this prototype" style="margin-top:8px">Submit IPAF →</button>` : ''}
    `;
  }

  return '';
}

function renderReviewerSummary(sub) {
  return `<ul class="reviewer-summary">
    ${sub.reviewers.map(r => `<li><strong>${escapeHtml(r.name)}</strong>: ${escapeHtml(r.decision)}${r.comment ? ' — ' + escapeHtml(r.comment) : ''}</li>`).join('')}
  </ul>`;
}

function currentOwnerLabel(sub) {
  if (sub.stage === 'Draft') return 'the PI';
  if (sub.stage === 'For Review' && !sub.directorDate) return 'the S/D Director';
  if (sub.stage === 'For Review' && sub.directorDate) return `the ${sub.secretariat} Secretariat`;
  if (sub.stage === 'Pending Review' && !allReviewersResponded(sub)) return 'the assigned IRB reviewers';
  if (sub.stage === 'Pending Review' && allReviewersResponded(sub)) return `the ${sub.secretariat} Secretariat`;
  if (sub.stage === 'Returned for Amendments') return 'the PI';
  if (isTerminal(sub) && !sub.acknowledged) return 'the PI (acknowledgement)';
  return '—';
}

function wireActionPanel(sub, role, actor) {
  const note = () => (document.getElementById('action-note') || {}).value || '';

  const approveBtn = document.getElementById('btn-director-approve');
  if (approveBtn) approveBtn.addEventListener('click', () => { directorDecision(DB, sub.recordId, actor.id, true, note()); route(); });

  const returnBtn = document.getElementById('btn-director-return');
  if (returnBtn) returnBtn.addEventListener('click', () => { directorDecision(DB, sub.recordId, actor.id, false, note()); route(); });

  const sendBtn = document.getElementById('btn-send-review');
  if (sendBtn) sendBtn.addEventListener('click', () => {
    const ids = Array.from(document.querySelectorAll('.reviewer-chk:checked')).map(c => c.value);
    if (!ids.length) { alert('Select at least one reviewer.'); return; }
    sendToReview(DB, sub.recordId, actor.id, ids, note());
    route();
  });

  const reviewerSubmitBtn = document.getElementById('btn-reviewer-submit');
  if (reviewerSubmitBtn) reviewerSubmitBtn.addEventListener('click', () => {
    const decision = document.getElementById('reviewer-decision').value;
    const comment = document.getElementById('reviewer-comment').value;
    reviewerRespond(DB, sub.recordId, actor.id, decision, comment);
    route();
  });

  const exemptBtn = document.getElementById('btn-outcome-exempt');
  if (exemptBtn) exemptBtn.addEventListener('click', () => { secretariatDecide(DB, sub.recordId, actor.id, 'Approved for Exemption', note()); route(); });
  const ipafBtn = document.getElementById('btn-outcome-ipaf');
  if (ipafBtn) ipafBtn.addEventListener('click', () => { secretariatDecide(DB, sub.recordId, actor.id, 'To Create IPAF', note()); route(); });
  const returnOutcomeBtn = document.getElementById('btn-outcome-return');
  if (returnOutcomeBtn) returnOutcomeBtn.addEventListener('click', () => { secretariatDecide(DB, sub.recordId, actor.id, 'Returned for Amendments', note()); route(); });

  const ackBtn = document.getElementById('btn-acknowledge');
  if (ackBtn) ackBtn.addEventListener('click', () => { acknowledgeOutcome(DB, sub.recordId, actor.id); route(); });
}
