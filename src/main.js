import { getSportIcon } from './sportIcons.js';

const API_BASE = 'https://api.ppv.to/api';

const CATEGORY_MAP = {
  'American Football': 'american-football',
  'Australian Football': 'afl',
  'Baseball': 'baseball',
  'Basketball': 'basketball',
  'Combat Sports': 'mma',
  'Football': 'football',
  'Rugby': 'rugby',
  'Wrestling': 'wrestling',
  '24/7 Streams': '24-7',
};

const state = {
  currentView: 'live',
  currentSport: null,
  streams: [],
  categories: [],
  loading: false,
  error: null,
  searchQuery: '',
};

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

const dom = {
  navTabs: $$('.nav-tab'),
  sportsList: $('#sportsList'),
  matchesGrid: $('#matchesGrid'),
  contentTitle: $('#contentTitle'),
  matchCount: $('#matchCount'),
  refreshBtn: $('#refreshBtn'),
  searchInput: $('#searchInput'),
  sidebar: $('#sidebar'),
  sidebarToggle: $('#sidebarToggle'),
  liveCount: $('#liveCount'),
  modal: $('#streamModal'),
  modalTitle: $('#modalTitle'),
  modalCategory: $('#modalCategory'),
  modalClose: $('#modalClose'),
  streamContainer: $('#streamContainer'),
  sourceTabs: $('#sourceTabs'),
  toastContainer: $('#toastContainer'),
};

// API
async function fetchStreams() {
  const res = await fetch(`${API_BASE}/streams`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

// Normalization
function normalizeCategory(categoryName) {
  return CATEGORY_MAP[categoryName] || categoryName.toLowerCase().replace(/\s+/g, '-');
}

function isAlwaysLive(val) {
  return val === true || val === 1 || val === '1';
}

function normalizeStream(ppvCategory, ppvStream) {
  const now = Date.now();
  const startsAt = ppvStream.starts_at * 1000;
  const endsAt = ppvStream.ends_at * 1000;
  const alwaysLive = isAlwaysLive(ppvStream.always_live);
  const isLive = alwaysLive || (startsAt <= now && endsAt >= now);
  const isUpcoming = startsAt > now && !alwaysLive;

  return {
    id: ppvStream.id,
    name: ppvStream.name,
    tag: ppvStream.tag || null,
    sourceTag: ppvStream.source_tag || null,
    category: normalizeCategory(ppvCategory.category),
    categoryName: ppvCategory.category,
    date: startsAt,
    endsAt: endsAt,
    poster: ppvStream.poster || null,
    blurhash: ppvStream.blurhash || null,
    colors: ppvStream.colors || [],
    locale: ppvStream.locale || null,
    uriName: ppvStream.uri_name,
    iframe: ppvStream.iframe || null,
    viewers: parseInt(ppvStream.viewers, 10) || 0,
    isLive,
    isUpcoming,
    alwaysLive,
    substreams: (ppvStream.substreams || []).map((ss) => ({
      id: ss.id,
      name: ss.name,
      tag: ss.tag || null,
      sourceTag: ss.source_tag || null,
      locale: ss.locale || null,
      uriName: ss.uri_name,
      iframe: ss.iframe || null,
    })),
  };
}

// Utilities
function formatMatchTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatMatchDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return '';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatViewers(count) {
  if (count === 0) return '';
  if (count === 1) return '1 viewer';
  return `${count} viewers`;
}

function getStreamStatus(stream) {
  if (stream.isLive) return 'live';
  if (stream.isUpcoming) return 'upcoming';
  return 'finished';
}

function getPosterUrl(stream) {
  if (!stream.poster) return null;
  if (stream.poster.startsWith('http')) return stream.poster;
  return null;
}

// Render
function renderSports(categories) {
  const existing = $$('.sport-item:not([data-sport="live"]):not([data-sport="all"])', dom.sportsList);
  existing.forEach((el) => el.remove());

  const sorted = [...categories].sort((a, b) => a.category.localeCompare(b.category));

  sorted.forEach((cat) => {
    const li = document.createElement('li');
    li.className = 'sport-item';
    li.dataset.sport = normalizeCategory(cat.category);
    li.dataset.label = `${cat.category} Streams`;
    li.innerHTML = `
      <span class="sport-icon">${getSportIcon(normalizeCategory(cat.category))}</span>
      <span class="sport-name">${esc(cat.category)}</span>
    `;
    li.addEventListener('click', () => selectSport(normalizeCategory(cat.category), `${cat.category} Streams`));
    dom.sportsList.appendChild(li);
  });
}

function renderStreams(streams) {
  dom.matchesGrid.innerHTML = '';

  if (state.loading) {
    dom.matchesGrid.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading streams...</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    dom.matchesGrid.innerHTML = `
      <div class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3>Failed to load streams</h3>
        <p>${esc(state.error)}</p>
        <button onclick="window.location.reload()">Try Again</button>
      </div>
    `;
    return;
  }

  let filtered = streams;

  if (state.currentSport) {
    filtered = filtered.filter((s) => s.category === state.currentSport);
  } else if (state.currentView === 'live') {
    filtered = filtered.filter((s) => s.isLive);
  } else if (state.currentView === 'today') {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const sod = startOfDay.getTime();
    const eod = endOfDay.getTime();
    filtered = filtered.filter((s) => s.alwaysLive || (s.date <= eod && s.endsAt >= sod));
  }

  if (state.searchQuery) {
    filtered = filtered.filter((s) => s.name.toLowerCase().includes(state.searchQuery) || (s.sourceTag || '').toLowerCase().includes(state.searchQuery) || s.categoryName.toLowerCase().includes(state.searchQuery));
  }

  if (filtered.length === 0) {
    const emptyMsg = state.searchQuery
      ? { title: 'No streams match your search', sub: 'Try different keywords' }
      : state.currentSport
        ? { title: 'No streams in this category', sub: 'Check back later' }
        : state.currentView === 'today'
          ? { title: 'No streams today', sub: 'Check back later' }
          : { title: 'No streams available', sub: 'Check back later' };
    dom.matchesGrid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <h3>${emptyMsg.title}</h3>
        <p>${emptyMsg.sub}</p>
      </div>
    `;
    return;
  }

  dom.matchCount.textContent = `${filtered.length} stream${filtered.length !== 1 ? 's' : ''}`;

  filtered.forEach((stream, i) => {
    const card = createStreamCard(stream, i);
    dom.matchesGrid.appendChild(card);
  });
}

function createStreamCard(stream, index) {
  const card = document.createElement('div');
  card.style.animationDelay = `${(index % 10) * 0.03}s`;

  const status = getStreamStatus(stream);
  const posterUrl = getPosterUrl(stream);
  const viewerText = formatViewers(stream.viewers);
  const accentColor = stream.colors?.[0] || null;

  card.className = `match-card single-entity${posterUrl ? ' has-poster' : ''}`;
  if (accentColor) {
    card.style.setProperty('--card-accent', accentColor);
  }

  const totalSources = 1 + stream.substreams.length;

  const showDate = state.currentView === 'all';
  const dateLabel = showDate ? formatMatchDate(stream.date) : '';

  card.innerHTML = `
    ${posterUrl ? `<img class="card-poster" src="${esc(posterUrl)}" alt="${esc(stream.name)}" loading="lazy" onerror="this.style.display='none'" />` : ''}
    <div class="card-body">
      <div class="match-card-header">
        <div class="match-badges">
          ${status === 'live' ? '<span class="badge badge-live"><span class="badge-dot"></span>LIVE</span>' : ''}
          ${status === 'upcoming' ? '<span class="badge badge-upcoming">Upcoming</span>' : ''}
          <span class="badge badge-sport">${esc(stream.categoryName)}</span>
          ${stream.sourceTag ? `<span class="badge badge-tag">${esc(stream.sourceTag)}</span>` : ''}
        </div>
        <div class="match-header-right">
          ${viewerText ? `<span class="viewers-badge">${esc(viewerText)}</span>` : ''}
          <span class="match-time">${status === 'live' ? 'LIVE' : stream.date ? formatMatchTime(stream.date) : ''}</span>
        </div>
      </div>
      <div class="event-title">${esc(stream.name)}</div>
      <div class="match-card-footer">
        <span class="match-date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${dateLabel ? `${dateLabel} ` : ''}${stream.date ? formatMatchTime(stream.date) : ''}
        </span>
        <div class="footer-right">
          ${totalSources > 1 ? `<span class="sources-count">${totalSources} sources</span>` : ''}
          <button class="watch-btn">Watch</button>
        </div>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (!e.target.closest('.watch-btn')) {
      openStreamModal(stream);
    }
  });

  return card;
}

// Stream Modal
function openStreamModal(stream) {
  dom.modalTitle.textContent = stream.name;
  dom.modalCategory.textContent = stream.categoryName;
  dom.streamContainer.innerHTML = `
    <div class="stream-placeholder">
      <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      <p>Select a source below to watch</p>
    </div>
  `;

  const seen = {};
  const allSources = [
    { label: stream.sourceTag || 'Main', iframe: stream.iframe, locale: stream.locale },
    ...stream.substreams.map((ss) => ({ label: ss.sourceTag || ss.tag || 'Source', iframe: ss.iframe, locale: ss.locale })),
  ].filter((s) => s.iframe).map((s) => {
    const label = s.label;
    seen[label] = (seen[label] || 0) + 1;
    return seen[label] > 1 ? { ...s, label: `${label} ${seen[label]}` } : s;
  });

  if (allSources.length === 0) {
    dom.sourceTabs.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No stream sources available</p>';
    dom.modal.classList.add('open');
    return;
  }

  if (allSources.length === 1) {
    dom.sourceTabs.innerHTML = '';
    dom.streamContainer.innerHTML = `<iframe src="${allSources[0].iframe}" allowfullscreen></iframe>`;
    dom.modal.classList.add('open');
    return;
  }

  dom.sourceTabs.innerHTML = allSources
    .map((s, i) => `<button class="source-tab ${i === 0 ? 'active' : ''}" data-iframe="${esc(s.iframe)}">${esc(s.label)}</button>`)
    .join('');

  $$('.source-tab', dom.sourceTabs).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.source-tab', dom.sourceTabs).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      dom.streamContainer.innerHTML = `<iframe src="${btn.dataset.iframe}" allowfullscreen></iframe>`;
    });
  });

  dom.modal.classList.add('open');
  dom.streamContainer.innerHTML = `<iframe src="${allSources[0].iframe}" allowfullscreen></iframe>`;
}

// Toast
function showToast(msg, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Navigation
function selectView(view) {
  state.currentView = view;
  state.currentSport = null;

  dom.navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  $$('.sport-item').forEach((item) => item.classList.remove('active'));
  const activeItem = $(`[data-sport="${view}"]`, dom.sportsList);
  if (activeItem) activeItem.classList.add('active');

  const labels = { live: 'Live Streams', today: "Today's Streams", all: 'All Streams' };
  dom.contentTitle.textContent = labels[view] || 'Streams';

  renderStreams(state.streams);
}

function selectSport(sportId, label) {
  state.currentSport = sportId;
  state.currentView = null;

  $$('.sport-item').forEach((item) => item.classList.remove('active'));
  const el = $(`[data-sport="${sportId}"]`, dom.sportsList);
  if (el) el.classList.add('active');

  dom.navTabs.forEach((tab) => tab.classList.remove('active'));
  dom.contentTitle.textContent = label || `${sportId} Streams`;

  if (window.innerWidth <= 1024) {
    dom.sidebar.classList.remove('open');
  }

  renderStreams(state.streams);
}

// Data loading
async function loadData() {
  state.loading = true;
  state.error = null;
  renderStreams([]);

  try {
    const data = await fetchStreams();
    state.loading = false;

    if (!data.success) {
      state.error = 'API returned error';
      renderStreams([]);
      return;
    }

    state.categories = data.streams || [];

    const allStreams = [];
    for (const category of state.categories) {
      for (const stream of category.streams) {
        allStreams.push(normalizeStream(category, stream));
      }
    }

    state.streams = allStreams;

    const liveCount = state.streams.filter((s) => s.isLive).length;
    dom.liveCount.textContent = liveCount;

    renderSports(state.categories);
    renderStreams(state.streams);
  } catch (err) {
    state.loading = false;
    state.error = err.message;
    renderStreams([]);
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Auto-refresh
let refreshInterval = null;

function startAutoRefresh() {
  stopAutoRefresh();
  refreshInterval = setInterval(() => {
    if (!state.loading) loadData();
  }, 60_000);
}

function stopAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
}

// Init
function init() {
  loadData();
  startAutoRefresh();

  dom.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => selectView(tab.dataset.view));
  });

  $$('[data-sport="live"], [data-sport="all"]', dom.sportsList).forEach((item) => {
    item.addEventListener('click', () => {
      const sport = item.dataset.sport;
      if (sport === 'live') selectView('live');
      else if (sport === 'all') selectView('all');
    });
  });

  dom.refreshBtn.addEventListener('click', () => {
    dom.refreshBtn.classList.add('spinning');
    loadData().finally(() => {
      setTimeout(() => dom.refreshBtn.classList.remove('spinning'), 600);
    });
  });

  let searchTimeout;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = dom.searchInput.value.toLowerCase().trim();
      renderStreams(state.streams);
    }, 250);
  });

  dom.sidebarToggle.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
  });

  dom.modalClose.addEventListener('click', () => {
    dom.modal.classList.remove('open');
    dom.sourceTabs.innerHTML = '';
    dom.streamContainer.innerHTML = `
      <div class="stream-placeholder">
        <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <p>Select a source below to watch</p>
      </div>
    `;
  });

  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal) dom.modalClose.click();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dom.modalClose.click();
  });

  const observer = new MutationObserver(() => {
    if (dom.modal.classList.contains('open')) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  });
  observer.observe(dom.modal, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('click', (e) => {
    if (
      window.innerWidth <= 1024 &&
      dom.sidebar.classList.contains('open') &&
      !dom.sidebar.contains(e.target) &&
      !dom.sidebarToggle.contains(e.target)
    ) {
      dom.sidebar.classList.remove('open');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
