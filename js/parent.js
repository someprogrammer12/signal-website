/* Parent dashboard JS */
(async function () {
  const authRes = await fetch('/api/check-auth');
  const authData = await authRes.json();
  if (!authData.authenticated) {
    window.location.href = '/login';
    return;
  }
  if (authData.user_type !== 'parent') {
    window.location.href = '/' + authData.user_type;
    return;
  }

  const API = '/api/parent/data';
  let raw = {};

  try {
    const res = await fetch(API);
    raw = await res.json();
  } catch (e) {
    document.getElementById('summary-content').innerHTML =
      '<div class="empty">Could not load data. Refresh to try again.</div>';
    return;
  }

  function records(tableKey) {
    return (raw[tableKey]?.records || []).map(r => ({ id: r.id, ...r.fields }));
  }

  const students = records('students');
  const assignments = records('assignments');
  const sessions = records('sessions');
  const tests = records('tests');
  const summaries = records('summaries');

  const student = students[0] || {};
  const studentName = student.Name || 'your student';
  document.querySelector('.subtitle').textContent = `${studentName}'s week`;

  // Week range
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (6 - today.getDay()));
  const opts = { month: 'long', day: 'numeric' };
  document.getElementById('week-range').textContent =
    `${today.toLocaleDateString('en-US', opts)} – ${weekEnd.toLocaleDateString('en-US', opts)}`;

  // ===== WEEKLY SUMMARY =====
  const summaryContainer = document.getElementById('summary-content');
  const recentSummary = summaries
    .filter(s => s.Status === 'Sent')
    .sort((a, b) => new Date(b['Week Start']) - new Date(a['Week Start']))[0];

  if (!recentSummary) {
    summaryContainer.innerHTML = '<div class="empty">No summary sent yet. Your next update will appear here.</div>';
  } else {
    const ws = new Date(recentSummary['Week Start']);
    const we = new Date(recentSummary['Week End']);
    const rangeText = ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    summaryContainer.innerHTML = `
      <div class="week-label">${rangeText}</div>
      ${recentSummary.Wins ? `
        <div class="summary-section wins">
          <div class="summary-label">Wins</div>
          <div class="summary-text">${recentSummary.Wins}</div>
        </div>
      ` : ''}
      ${recentSummary.Concerns ? `
        <div class="summary-section">
          <div class="summary-label">Heads up</div>
          <div class="summary-text">${recentSummary.Concerns}</div>
        </div>
      ` : ''}
      ${recentSummary['Action Items Next Week'] ? `
        <div class="summary-section">
          <div class="summary-label">Coming up</div>
          <div class="summary-text">${recentSummary['Action Items Next Week']}</div>
        </div>
      ` : ''}
      ${recentSummary['Hours This Week'] ? `
        <div class="summary-hours">${recentSummary['Hours This Week']} hours this week</div>
      ` : ''}
    `;
  }

  // ===== COMING UP =====
  const twoWeeks = new Date(today);
  twoWeeks.setDate(today.getDate() + 14);
  const upcoming = assignments
    .filter(a => {
      const due = a['Due date'] ? new Date(a['Due date']) : null;
      if (!due) return false;
      const status = (a.Status || '').toLowerCase();
      return due >= today && due <= twoWeeks && !['submitted', 'graded'].includes(status);
    })
    .sort((a, b) => new Date(a['Due date']) - new Date(b['Due date']));

  const comingContainer = document.getElementById('coming-content');
  if (upcoming.length === 0) {
    comingContainer.innerHTML = '<div class="empty">Nothing coming up in the next two weeks.</div>';
  } else {
    comingContainer.innerHTML = upcoming.map(a => {
      const due = new Date(a['Due date']);
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      const soonClass = diffDays <= 3 ? 'soon' : '';
      return `
        <div class="coming-item">
          <span class="coming-name">${a.Assignment || 'Untitled'}</span>
          <span class="coming-meta">${a.Status || ''}</span>
          <span class="coming-due ${soonClass}">${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      `;
    }).join('');
  }

  // ===== RECENT SESSIONS =====
  const recentSessions = [...sessions]
    .filter(s => !s.Archived)
    .sort((a, b) => new Date(b.Date) - new Date(a.Date))
    .slice(0, 4);

  const sessionsContainer = document.getElementById('sessions-content');
  if (recentSessions.length === 0) {
    sessionsContainer.innerHTML = '<div class="empty">No sessions yet.</div>';
  } else {
    sessionsContainer.innerHTML = recentSessions.map(s => {
      const d = new Date(s.Date);
      return `
        <div class="session-row">
          <div class="session-date">
            <div class="day">${d.getDate()}</div>
            <div class="month">${d.toLocaleDateString('en-US', { month: 'short' })}</div>
          </div>
          <div class="session-info">
            <div class="session-topic">${s.Session || 'Session'}</div>
            <div class="session-duration">${s['Duration (hrs)'] || ''} hours${s.Type ? ' · ' + s.Type : ''}</div>
            <div style="color:var(--charcoal-soft); font-size:0.9rem; margin-top:0.25rem;">${s['Focus / topics'] || ''}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== SCORE TREND =====
  const sortedTests = [...tests].sort((a, b) => new Date(a.Date) - new Date(b.Date));
  const scoresContainer = document.getElementById('scores-content');

  if (sortedTests.length === 0) {
    scoresContainer.innerHTML = '<div class="empty">No tests yet.</div>';
  } else {
    const maxScore = 1600;
    const chartHeight = 120;
    const barsHTML = sortedTests.map(t => {
      const total = t.Total || 0;
      const height = Math.round((total / maxScore) * chartHeight);
      const d = new Date(t.Date);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const isLatest = t === sortedTests[sortedTests.length - 1];
      return `
        <div class="score-bar ${isLatest ? 'score-bar-latest' : ''}" style="height:${height}px">
          <span class="score-bar-value">${total}</span>
          <span class="score-bar-label">${label}</span>
        </div>
      `;
    }).join('');

    scoresContainer.innerHTML = `
      <div style="height:${chartHeight + 40}px; position:relative; padding-bottom:30px;">
        <div class="score-chart" style="height:${chartHeight}px;">${barsHTML}</div>
      </div>
    `;
  }

  // ===== VIEW SWITCH =====
  window.switchView = function () {
    window.location.href = '/student';
  };
  window.logout = function () {
    fetch('/api/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };
})();
