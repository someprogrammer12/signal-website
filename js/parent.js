/* Parent dashboard JS — read-only reassurance surface */
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
    const summaryEl = document.getElementById('summary-content');
    if (summaryEl) {
      summaryEl.innerHTML = '<div class="empty">Could not load data. Refresh to try again.</div>';
    }
    return;
  }

  if (!raw || !raw.ok) {
    const summaryEl = document.getElementById('summary-content');
    if (summaryEl) {
      summaryEl.innerHTML = '<div class="empty">No data is available right now.</div>';
    }
    return;
  }

  const payload = raw.data || {};
  const studentName = payload.student || 'your student';
  document.querySelector('.subtitle').textContent = `${studentName}'s week`;

  // ===== WEEK RANGE TEXT =====
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (6 - today.getDay()));
  const opts = { month: 'long', day: 'numeric' };
  document.getElementById('week-range').textContent =
    `${today.toLocaleDateString('en-US', opts)} – ${weekEnd.toLocaleDateString('en-US', opts)}`;

  // ===== FALLBACK HELPERS =====
  function fallbackSummary() {
    return '<div class="empty">No summary sent yet. Your next update will appear here.</div>';
  }

  function fallbackComing() {
    return '<div class="empty">Nothing coming up in the next two weeks.</div>';
  }

  function fallbackGrades() {
    return '<div class="empty">Grades are not available yet. They usually appear after the first report card.</div>';
  }

  function fallbackInvoices() {
    return '<div class="empty">No invoices on record yet.</div>';
  }

  // ===== WEEKLY SUMMARY =====
  const summaryContainer = document.getElementById('summary-content');
  const note = payload.latestWeeklyNote || {};

  if (!note || Object.keys(note).length === 0) {
    summaryContainer.innerHTML = fallbackSummary();
  } else {
    const ws = note['Week Start'];
    const we = note['Week End'];
    const rangeText = (!ws || !we) ? 'This week' :
      `${new Date(ws).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(we).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    const html = [
      `<div class="week-label">${rangeText}</div>`,
      note.Wins ? `
        <div class="summary-section wins">
          <div class="summary-label">Wins</div>
          <div class="summary-text">${note.Wins}</div>
        </div>
      ` : '',
      note.Concerns ? `
        <div class="summary-section">
          <div class="summary-label">Heads up</div>
          <div class="summary-text">${note.Concerns}</div>
        </div>
      ` : '',
      note['Action Items Next Week'] ? `
        <div class="summary-section">
          <div class="summary-label">Coming up</div>
          <div class="summary-text">${note['Action Items Next Week']}</div>
        </div>
      ` : '',
      note['Hours This Week'] ? `
        <div class="summary-hours">${note['Hours This Week']} hours this week</div>
      ` : '',
    ].join('');

    summaryContainer.innerHTML = html || '<div class="empty">This week was quiet.</div>';
  }

  // ===== COMING UP =====
  const comingContainer = document.getElementById('coming-content');
  const nextKeyDates = Array.isArray(payload.nextKeyDates) ? payload.nextKeyDates : [];

  if (nextKeyDates.length === 0) {
    comingContainer.innerHTML = fallbackComing();
  } else {
    comingContainer.innerHTML = nextKeyDates.map(item => {
      const dueText = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date TBD';
      return `
        <div class="coming-item">
          <span class="coming-name">${item.label || 'Upcoming item'}</span>
          <span class="coming-due">${dueText}</span>
        </div>
      `;
    }).join('');
  }

  // ===== CURRENT GRADES =====
  const gradesContainer = document.getElementById('grades-content');
  const currentGrades = Array.isArray(payload.currentGrades) ? payload.currentGrades : [];

  if (currentGrades.length === 0) {
    gradesContainer.innerHTML = fallbackGrades();
  } else {
    gradesContainer.innerHTML = currentGrades.map(g => {
      const overall = g.overall != null ? g.overall : 'Not yet posted';
      const byClass = g.by_class || '';
      return `
        <div class="summary-section">
          <div class="summary-label">Overall</div>
          <div class="summary-text">${overall}</div>
          ${byClass ? `<div class="summary-text" style="margin-top:0.5rem">${byClass}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ===== RECENT INVOICES =====
  const invoicesContainer = document.getElementById('invoices-content');
  const invoicesPaid = Array.isArray(payload.invoicesPaid) ? payload.invoicesPaid : [];

  if (invoicesPaid.length === 0) {
    invoicesContainer.innerHTML = fallbackInvoices();
  } else {
    invoicesContainer.innerHTML = invoicesPaid.map(inv => `
      <div class="coming-item">
        <span class="coming-name">${inv.session || 'Session'}</span>
        <span class="coming-meta">${inv.status || ''}</span>
        <span class="coming-due">${inv.date ? new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
      </div>
    `).join('');
  }

  // ===== ACTIONS =====
  window.logout = function () {
    fetch('/api/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };
})();
