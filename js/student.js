/* Student dashboard JS */
(async function () {
  // Auth check
  const authRes = await fetch('/api/check-auth');
  const authData = await authRes.json();
  if (!authData.authenticated) {
    window.location.href = '/login';
    return;
  }
  if (authData.user_type !== 'student') {
    window.location.href = '/' + authData.user_type;
    return;
  }

  const API = '/api/student/data';
  let raw = {};

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('API error');
    raw = await res.json();
  } catch (e) {
    const el = document.getElementById('assignments-list');
    if (el) el.innerHTML = '<div class="empty">Could not load data. Refresh to try again.</div>';
    console.error('student fetch failed', e);
    raw = { students: [], assignments: [], tests: [], drills: [], sessions: [], mastery: [] };
  }

  // ===== PARSE RECORDS =====
  function records(tableKey) {
    return (raw[tableKey]?.records || []).map(r => ({ id: r.id, ...r.fields }));
  }

  const students = records('students');
  const assignments = records('assignments');
  const tests = records('tests');
  const drills = records('drills');
  const sessions = records('sessions');
  const mastery = records('mastery');

  const student = students[0] || {};
  const studentName = student.Name || 'there';

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = `${greeting}, ${studentName.split(' ')[0]}.`;

  // ===== ASSIGNMENTS =====
  const today = new Date();
  const weekFromNow = new Date(today);
  weekFromNow.setDate(today.getDate() + 7);

  function parseDate(d) {
    if (!d) return null;
    return new Date(d);
  }

  const upcoming = assignments
    .filter(a => {
      const due = parseDate(a['Due date']);
      if (!due) return false;
      const status = (a.Status || '').toLowerCase();
      return due >= today && due <= weekFromNow && !['submitted', 'graded'].includes(status);
    })
    .sort((a, b) => parseDate(a['Due date']) - parseDate(b['Due date']));

  const assignContainer = document.getElementById('assignments-list');
  const assignRange = document.getElementById('assignment-date-range');

  if (upcoming.length === 0) {
    assignContainer.innerHTML = '<div class="empty">Nothing due this week. Good — keep it that way.</div>';
  } else {
    const first = upcoming[0]['Due date'];
    const last = upcoming[upcoming.length - 1]['Due date'];
    const opts = { month: 'short', day: 'numeric' };
    assignRange.textContent = `${first ? new Date(first).toLocaleDateString('en-US', opts) : ''} – ${last ? new Date(last).toLocaleDateString('en-US', opts) : ''}`;

    assignContainer.innerHTML = upcoming.map(a => {
      const due = parseDate(a['Due date']);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      const urgencyClass = diffDays <= 2 ? 'urgency-high' : diffDays <= 5 ? 'urgency-med' : '';
      const statusClass = (a.Status || '').toLowerCase() === 'submitted' ? 'status-submitted' : 'status-badge';
      return `
        <div class="assignment">
          <div class="assignment-main">
            <div class="assignment-name">${a.Assignment || 'Untitled'}</div>
            <div class="assignment-detail">${a['Assignment'] ? '' : ''}</div>
          </div>
          <div class="assignment-due">
            <span class="due-label">Due</span>
            <div class="${urgencyClass}">${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== LATEST SCORE =====
  const sortedTests = [...tests].sort((a, b) => {
    const da = parseDate(a.Date);
    const db = parseDate(b.Date);
    return (db || 0) - (da || 0);
  });
  const latest = sortedTests[0];
  const scoreContainer = document.getElementById('score-content');
  const scoreDate = document.getElementById('score-date');

  if (!latest) {
    scoreContainer.innerHTML = '<div class="empty">No tests yet.</div>';
    scoreDate.textContent = '';
  } else {
    scoreDate.textContent = new Date(latest.Date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const m1 = latest['Module 1 Math'] ?? latest.Math;
    const m2 = latest['Module 2 Math'] ?? latest.Math;
    const r1 = latest['Module 1 R&W'] ?? latest['R&W'];
    const r2 = latest['Module 2 R&W'] ?? latest['R&W'];
    scoreContainer.innerHTML = `
      <div class="score-big">${latest.Total ?? '—'}</div>
      <div class="score-label">${latest['Test type'] || latest.Label || 'Total Score'}</div>
      <div class="score-modules">
        <div class="score-section">
          <div class="score-section-label">Math</div>
          ${moduleRow('M1', m1, 22)}
          ${moduleRow('M2', m2, 22)}
        </div>
        <div class="score-section">
          <div class="score-section-label">Reading & Writing</div>
          ${moduleRow('M1', r1, 22)}
          ${moduleRow('M2', r2, 22)}
        </div>
      </div>
    `;
  }

  function moduleRow(label, value, max) {
    if (value == null || value === '') return '';
    const pct = Math.min(100, (value / max) * 100);
    return `
      <div class="score-mod">
        <span class="score-mod-label">${label}</span>
        <div class="score-mod-bar"><div class="score-mod-fill" style="width:${pct}%"></div></div>
        <span class="score-mod-value">${value}/${max}</span>
      </div>
    `;
  }

  // ===== DRILL LOG =====
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  const recentDrills = drills
    .filter(d => parseDate(d.Date) >= twoWeeksAgo)
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));

  const drillContainer = document.getElementById('drill-content');
  if (recentDrills.length === 0) {
    drillContainer.innerHTML = '<div class="empty">No drills logged yet.</div>';
  } else {
    const byDate = {};
    recentDrills.forEach(d => {
      const dateStr = new Date(d.Date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push(d);
    });

    drillContainer.innerHTML = Object.entries(byDate).map(([date, items]) => `
      <div class="drill-day">
        <div class="drill-date">${date}</div>
        ${items.map(d => {
          const acc = d['Accuracy %'];
          let accClass = '';
          if (acc != null) accClass = acc >= 80 ? 'acc-good' : acc >= 60 ? 'acc-ok' : 'acc-low';
          return `
            <div class="drill-row">
              <span class="drill-domain">${d.Domain || '—'}</span>
              <span class="drill-meta">${d['Drill Type'] || ''} ${d['Sub-skill'] ? '· ' + d['Sub-skill'] : ''}</span>
              <span class="drill-acc ${accClass}">${acc != null ? acc + '%' : ''}</span>
            </div>
          `;
        }).join('')}
      </div>
    `).join('');
  }

  // ===== NEXT SESSION =====
  const futureSessions = sessions
    .filter(s => parseDate(s.Date) >= today && !s.Archived)
    .sort((a, b) => parseDate(a.Date) - parseDate(b.Date));
  const nextSession = futureSessions[0];
  const sessionContainer = document.getElementById('session-content');

  if (!nextSession) {
    sessionContainer.innerHTML = '<div class="empty">No upcoming sessions scheduled.</div>';
  } else {
    const sDate = new Date(nextSession.Date);
    sessionContainer.innerHTML = `
      <div class="next-session">
        <div class="session-date-box">
          <div class="session-month">${sDate.toLocaleDateString('en-US', { month: 'short' })}</div>
          <div class="session-day">${sDate.getDate()}</div>
        </div>
        <div class="session-info">
          <h3>${nextSession.Session || 'Session'}</h3>
          <p>${nextSession['Focus / topics'] || 'No focus specified yet.'}</p>
          <p style="margin-top:0.5rem; font-size:0.9rem; color:var(--charcoal-soft);">
            ${nextSession['Duration (hrs)'] ? nextSession['Duration (hrs)'] + ' hours' : ''} · ${nextSession.Type || ''}
          </p>
        </div>
      </div>
    `;
  }

  // ===== MASTERY PROGRESS =====
  const masteryContainer = document.getElementById('mastery-content');
  const byDomain = {};
  mastery.forEach(m => {
    const domain = m.Domain || 'Other';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(m);
  });

  const domainOrder = ['Adv Math', 'Algebra', 'Problem-Solving & Data', 'Geometry & Trig', 'Standard English Conventions', 'Expression of Ideas', 'Craft & Structure', 'Information & Ideas'];
  const masteryHTML = domainOrder
    .filter(d => byDomain[d])
    .map(d => {
      const skills = byDomain[d];
      return `
        <div class="mastery-domain">
          <div class="mastery-domain-name">${d}</div>
          ${skills.map(s => {
            const status = (s.Status || '').toLowerCase();
            const steps = ['not started', 'learning', 'shaky', 'reflex'];
            const activeIdx = steps.indexOf(status);
            const bars = steps.map((step, i) => {
              let cls = '';
              if (i < activeIdx) cls = 'mastery-step active-reflex';
              else if (i === activeIdx) {
                if (status === 'learning') cls = 'mastery-step active-learning';
                else if (status === 'shaky') cls = 'mastery-step active-shaky';
                else if (status === 'reflex') cls = 'mastery-step active-reflex';
              }
              return `<div class="mastery-step ${cls}"></div>`;
            }).join('');
            return `
              <div class="mastery-skill">
                <span class="mastery-skill-name">${s['Sub-skill'] || 'General'}</span>
                <div class="mastery-bar">${bars}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');

  if (!masteryHTML) {
    masteryContainer.innerHTML = '<div class="empty">No mastery data yet.</div>';
  } else {
    masteryContainer.innerHTML = masteryHTML + '<div class="mastery-labels"><span>Not started</span><span>Learning</span><span>Shaky</span><span>Reflex</span></div>';
  }

  // ===== VIEW SWITCH =====
  window.switchView = function () {
    window.location.href = '/parent';
  };

  window.logout = function () {
    fetch('/api/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };
})();
