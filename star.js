(function () {
  'use strict';

  const STAR_KEY  = 'xian_starred_jobs_v1';
  const TOKEN_KEY = 'xian_gh_token';
  const GH_REPO   = 'alex602022/xian-job-reports';
  const GH_FILE   = 'starred_jobs.json';

  function getLocal()  { try { return JSON.parse(localStorage.getItem(STAR_KEY) || '{}'); } catch { return {}; } }
  function setLocal(d) { localStorage.setItem(STAR_KEY, JSON.stringify(d)); }
  function getToken()  { return localStorage.getItem(TOKEN_KEY) || ''; }

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return Math.abs(h);
  }

  function getDateReported() {
    const m = document.title.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const el = document.querySelector('.header-date, .report-date');
    if (el) {
      const dm = el.textContent.match(/(\d{4})年(\d{2})月(\d{2})日/);
      if (dm) return `${dm[1]}-${dm[2]}-${dm[3]}`;
    }
    return '';
  }

  // ── GitHub sync ──────────────────────────────────────
  async function ghRead() {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${GH_REPO}/main/${GH_FILE}?t=${Date.now()}`);
      return r.ok ? r.json() : null;
    } catch { return null; }
  }

  async function ghWrite(data) {
    const token = getToken();
    if (!token) return;
    try {
      const metaRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`,
        { headers: { Authorization: `token ${token}` } });
      const meta = await metaRes.json();
      if (!meta.sha) return;
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
      await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${GH_FILE}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'sync starred jobs', content, sha: meta.sha })
      });
    } catch { /* silent */ }
  }

  async function silentSync(data) {
    if (!getToken()) return;
    const remote = await ghRead();
    if (remote && remote.jobs) {
      const merged = { jobs: { ...remote.jobs, ...data.jobs } };
      setLocal(merged);
      await ghWrite(merged);
    } else {
      await ghWrite(data);
    }
  }

  // ── toggle ───────────────────────────────────────────
  function toggleStar(btn, jobData) {
    const data = getLocal();
    const jobs = data.jobs || {};
    if (jobs[jobData.id]) {
      delete jobs[jobData.id];
      btn.textContent = '☆';
      btn.classList.remove('xstar-on');
      btn.title = '加入星标';
    } else {
      jobs[jobData.id] = { ...jobData, starredAt: new Date().toISOString(), status: '待投递', notes: '' };
      btn.textContent = '⭐';
      btn.classList.add('xstar-on');
      btn.title = '已星标 · 点击取消';
    }
    const newData = { jobs };
    setLocal(newData);
    silentSync(newData);
  }

  // ── extract data from card ───────────────────────────
  function extractJob(card, dateReported) {
    const linkEl = card.querySelector(
      'a.job-title[href], .job-title-block a[href], h3 > a[href], a.apply-btn[href], a.cta-btn[href], a.job-link[href]'
    );
    if (!linkEl) return null;
    const url = linkEl.href;
    if (!url || url === window.location.href) return null;

    const id = 'job_' + hashStr(url);
    const titleEl = card.querySelector('a.job-title, .card-title, h3 > a');
    const title = (titleEl || linkEl).textContent.trim();

    let company = '';
    const compEl = card.querySelector('.job-company, .company');
    if (compEl) company = (compEl.firstChild || compEl).textContent.trim();

    const salEl = card.querySelector('.salary, .salary-tag, .meta-tag.salary, .tag.salary, .tag-salary');
    const salary = salEl ? salEl.textContent.replace(/💰\s*/, '').trim() : '';

    const platEl = card.querySelector(
      '.meta-tag.platform, .platform-boss, .platform-liepin, .platform-linkedin, .source-tag, .platform-badge, .tag.platform, .tag-platform'
    );
    const source = platEl ? platEl.textContent.trim() : '';

    let direction = 'match';
    let sib = card.previousElementSibling;
    while (sib) {
      if (sib.classList.contains('section-title') || sib.classList.contains('section-header') ||
          sib.classList.contains('stretch-section-header')) {
        direction = sib.textContent.includes('跨界') || sib.textContent.includes('方向二') ? 'stretch' : 'match';
        break;
      }
      sib = sib.previousElementSibling;
    }

    return { id, title, company, salary, url, source, direction, dateReported };
  }

  // ── inject button inline (no absolute positioning) ──
  // Wraps the target element in a column-flex container alongside the star button.
  function wrapWithStar(target, btn) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;';
    target.parentNode.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    wrapper.appendChild(btn);
  }

  function injectStarBtn(card, btn) {
    // 1. Newest format: .job-header with .salary on the right
    const jobHeader = card.querySelector('.job-header');
    if (jobHeader) {
      const right = jobHeader.querySelector('.salary') ||
                    (jobHeader.children.length > 1 ? jobHeader.lastElementChild : null);
      if (right) { wrapWithStar(right, btn); return; }
    }

    // 2. Old scored format: .job-card-header with .score-block on the right
    const cardHeader = card.querySelector('.job-card-header');
    if (cardHeader) {
      const right = cardHeader.querySelector('.score-block') ||
                    (cardHeader.children.length > 1 ? cardHeader.lastElementChild : null);
      if (right) { wrapWithStar(right, btn); return; }
    }

    // 3. .card-top format (2026-04-14~16) with .salary on the right
    const cardTop = card.querySelector('.card-top');
    if (cardTop) {
      const right = cardTop.querySelector('.salary') ||
                    (cardTop.children.length > 1 ? cardTop.lastElementChild : null);
      if (right) { wrapWithStar(right, btn); return; }
    }

    // 4. .job-top format: may or may not have a right-side child
    const jobTop = card.querySelector('.job-top');
    if (jobTop) {
      if (jobTop.children.length > 1) {
        // Has right side — wrap it
        wrapWithStar(jobTop.lastElementChild, btn);
      } else {
        // No right side — append star as right flex item
        btn.style.alignSelf = 'flex-start';
        jobTop.style.display = 'flex';
        jobTop.style.justifyContent = 'space-between';
        jobTop.style.alignItems = 'flex-start';
        jobTop.appendChild(btn);
      }
      return;
    }

    // 5. Fallback: inject inline before the first action button
    const action = card.querySelector('a.apply-btn, a.cta-btn, a.job-link, a.job-cta');
    if (action) {
      btn.style.cssText += 'display:inline-block;margin-right:8px;vertical-align:middle;';
      action.parentNode.insertBefore(btn, action);
      return;
    }

    card.appendChild(btn);
  }

  // ── styles ───────────────────────────────────────────
  function addStyles() {
    if (document.getElementById('xstar-css')) return;
    const s = document.createElement('style');
    s.id = 'xstar-css';
    s.textContent = `
      .xstar-btn {
        background: #fff;
        border: 1.5px solid #d1d5db;
        border-radius: 7px;
        padding: 3px 10px;
        font-size: 14px;
        line-height: 1.5;
        cursor: pointer;
        color: #9ca3af;
        white-space: nowrap;
        transition: border-color .15s, color .15s, background .15s;
      }
      .xstar-btn:hover { border-color: #f59e0b; color: #f59e0b; background: #fffbeb; }
      .xstar-btn.xstar-on { border-color: #f59e0b; color: #d97706; background: #fffbeb; }
    `;
    document.head.appendChild(s);
  }

  // ── init ─────────────────────────────────────────────
  function init() {
    addStyles();
    const dateReported = getDateReported();
    const { jobs = {} } = getLocal();

    document.querySelectorAll('.job-card, .card').forEach(card => {
      if (card.querySelector('.xstar-btn')) return;
      const jobData = extractJob(card, dateReported);
      if (!jobData) return;

      const isStarred = !!jobs[jobData.id];
      const btn = document.createElement('button');
      btn.className = 'xstar-btn' + (isStarred ? ' xstar-on' : '');
      btn.textContent = isStarred ? '⭐' : '☆';
      btn.title = isStarred ? '已星标 · 点击取消' : '加入星标';
      btn.onclick = e => { e.preventDefault(); e.stopPropagation(); toggleStar(btn, jobData); };
      injectStarBtn(card, btn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
