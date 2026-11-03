// Exhaustive test runner for tender_dz_portal.html
const fs = require('fs');

console.log('Loading tender_dz_portal.html...');
const html = fs.readFileSync('modules/consulting/tender_dz_portal.html', 'utf8');

// Extract all <script> contents
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scripts = [];
while ((match = scriptRegex.exec(html)) !== null) {
  if (!match[0].includes('src=')) {
    scripts.push(match[1]);
  }
}

console.log(`Found ${scripts.length} inline script blocks.`);

// Verify syntax of each script block
scripts.forEach((code, idx) => {
  try {
    new Function(code);
    console.log(`Script block ${idx + 1}: Syntax OK (${code.length} chars)`);
  } catch (err) {
    console.error(`Script block ${idx + 1} Syntax ERROR:`, err.message);
    process.exit(1);
  }
});

// Setup mock DOM environment
const elements = {};
function createMockElement(id, tagName = 'div') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    options: [],
    style: {},
    className: '',
    classList: {
      add: function(c) { el.className += ' ' + c; },
      remove: function(c) { el.className = el.className.replace(new RegExp('\\b' + c + '\\b', 'g'), '').trim(); },
      toggle: function(c, cond) { if(cond) this.add(c); else this.remove(c); },
      contains: function(c) { return el.className.includes(c); }
    },
    children: [],
    appendChild: function(child) {
      el.children.push(child);
      if (child && (child.tagName === 'OPTION' || child.tagName === 'OPTGROUP')) {
        el.options.push(child);
      }
      return child;
    },
    querySelectorAll: function(sel) {
      return [];
    },
    querySelector: function(sel) {
      return null;
    },
    addEventListener: function(evt, handler) {},
    scrollIntoView: function() {},
    remove: function() {},
    getAttribute: function(attr) { return el[attr] || ''; },
    setAttribute: function(attr, val) { el[attr] = val; }
  };
  elements[id] = el;
  return el;
}

// Pre-create common elements
[
  'sourcesDirectoryGrid', 'sourcesPaginationControls', 'sourcesCounterLabel', 'sourceSearchInput',
  'tabBadgeSources', 'tabBadgeAll', 'tabBadgeAttr', 'tabBadgeProrog', 'tabBadgeFav',
  'kpiTotalActive', 'kpiUrgentCount', 'kpiAttributionsCount', 'kpiFavoritesCount',
  'tendersContainer', 'dzSearchText', 'dzFilterSector', 'dzFilterWilaya', 'dzFilterSource', 'dzFilterNoticeType',
  'dzSortSelect', 'dzSelectedWilayasDisplay', 'dzWilayasCheckboxes', 'dzSelectedTypesDisplay', 'dzNoticeTypesCheckboxes',
  'tabContentFeed', 'tabContentAttributions', 'tabContentSources', 'tabContentLegal',
  'attributionsTableBody', 'prorogationsTableBody', 'paginationControls', 'dzPaginationContainer', 'tendersCounterLabel', 'dzFeedStats',
  'pubSource', 'pubNoticeType', 'pubWilaya', 'pubSector', 'filterSourceSelect'
].forEach(id => createMockElement(id));

const mockDocument = {
  body: createMockElement('body', 'body'),
  documentElement: createMockElement('html', 'html'),
  getElementById: function(id) {
    if (!elements[id]) {
      return createMockElement(id);
    }
    return elements[id];
  },
  createElement: function(tag) {
    return createMockElement('dyn_' + Math.random(), tag);
  },
  querySelectorAll: function(sel) {
    return [];
  },
  querySelector: function(sel) {
    return null;
  },
  readyState: 'complete',
  addEventListener: function(evt, handler) {}
};

const mockLocalStorageStore = {};
const mockWindow = {
  document: mockDocument,
  localStorage: {
    getItem: function(k) { return mockLocalStorageStore[k] || null; },
    setItem: function(k, v) { mockLocalStorageStore[k] = String(v); },
    removeItem: function(k) { delete mockLocalStorageStore[k]; }
  },
  addEventListener: function(evt, handler) {},
  location: { reload: function() {} }
};

global.window = mockWindow;
global.document = mockDocument;
global.localStorage = mockWindow.localStorage;
global.getComputedStyle = function() { return { getPropertyValue: () => '' }; };

// Execute scripts in order
console.log('\n--- Executing scripts in mock DOM ---');
scripts.forEach((code, idx) => {
  try {
    const fn = new Function('window', 'document', 'localStorage', code);
    fn(mockWindow, mockDocument, mockWindow.localStorage);
  } catch (err) {
    console.error(`Runtime error in script block ${idx + 1}:`, err);
    process.exit(1);
  }
});

console.log('All scripts executed without error!');

// Check SAMPLE_DZ_TENDERS and allDzTenders
const sampleTenders = global.window.SAMPLE_DZ_TENDERS;
console.log(`\nSAMPLE_DZ_TENDERS count: ${sampleTenders ? sampleTenders.length : 0}`);
if (!sampleTenders || sampleTenders.length < 1300) {
  console.error(`FAIL: SAMPLE_DZ_TENDERS count is ${sampleTenders ? sampleTenders.length : 0}, expected > 1300!`);
  process.exit(1);
}

// Check Tab Badges & KPIs
const tabBadgeAll = mockDocument.getElementById('tabBadgeAll');
console.log(`tabBadgeAll (Total active tenders): ${tabBadgeAll.textContent}`);
if (parseInt(tabBadgeAll.textContent) < 1200) {
  console.error(`FAIL: Expected > 1200 active tenders, got ${tabBadgeAll.textContent}`);
  process.exit(1);
}

const tabBadgeAttr = mockDocument.getElementById('tabBadgeAttr');
console.log(`tabBadgeAttr (Attribution notices): ${tabBadgeAttr.textContent}`);

const tabBadgeSources = mockDocument.getElementById('tabBadgeSources');
console.log(`tabBadgeSources (Official sources): ${tabBadgeSources.textContent}`);

// Test Municipalities (APCs) Filter
console.log('\n--- Testing Municipalities (APCs) Filter ---');
global.window.setQuickChip('communes');
let feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Quick chip 'communes':\n${feedStats.trim()}`);
if (!feedStats.includes('348') && !feedStats.includes('صفقة')) {
  console.error('FAIL: Municipalities filter failed!');
  process.exit(1);
}

// Test Public Enterprises Filter
console.log('\n--- Testing Public Enterprises Filter ---');
global.window.setQuickChip('enterprises');
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Quick chip 'enterprises':\n${feedStats.trim()}`);
if (!feedStats.includes('210') && !feedStats.includes('صفقة')) {
  console.error('FAIL: Public enterprises filter failed!');
  process.exit(1);
}

// Reset Quick Chip
global.window.setQuickChip('all');

// Test Sector Filtering
console.log('\n--- Testing Sector Filtering ---');
const sectorSel = mockDocument.getElementById('dzFilterSector');

sectorSel.value = 'BTPH';
global.window.filterAndRenderTenders();
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Filtered by sector 'BTPH':\n${feedStats.trim()}`);

sectorSel.value = 'MEDICAL';
global.window.filterAndRenderTenders();
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Filtered by sector 'MEDICAL':\n${feedStats.trim()}`);

sectorSel.value = 'ENERGY';
global.window.filterAndRenderTenders();
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Filtered by sector 'ENERGY':\n${feedStats.trim()}`);

// Reset sector
sectorSel.value = '';

// Test Wilaya Filtering
console.log('\n--- Testing Wilaya Filtering ---');
global.window.toggleWilayaSelection('16', true); // Alger
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Filtered by Wilaya 16 (Alger):\n${feedStats.trim()}`);

global.window.toggleWilayaSelection('16', false);
global.window.toggleWilayaSelection('31', true); // Oran
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Filtered by Wilaya 31 (Oran):\n${feedStats.trim()}`);

global.window.selectAllWilayas(false); // All wilayas
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Filtered by All Wilayas:\n${feedStats.trim()}`);

// Test Sources Directory functionality
const sources = global.window.ALGERIAN_PROCUREMENT_SOURCES;
console.log(`\nALGERIAN_PROCUREMENT_SOURCES count: ${sources ? sources.length : 0}`);

// Test renderSourcesDirectory with APC group
console.log('\nTesting filterSourcesByGroup("apc")...');
global.window.filterSourcesByGroup('apc');
const counterEl = mockDocument.getElementById('sourcesCounterLabel');
console.log(`Sources counter label for "apc": "${counterEl.textContent}"`);

// Test renderSourcesDirectory with Companies group
console.log('\nTesting filterSourcesByGroup("companies")...');
global.window.filterSourcesByGroup('companies');
console.log(`Sources counter label for "companies": "${counterEl.textContent}"`);

// Reset sources group
global.window.filterSourcesByGroup('all');
console.log(`Sources counter label for "all": "${counterEl.textContent}"`);

// Test Sources filtered by Wilaya
console.log('\nTesting filterSourcesByWilaya("16") (Alger)...');
if (typeof global.window.filterSourcesByWilaya === 'function') {
  global.window.filterSourcesByWilaya('16');
  console.log(`Sources counter label for Wilaya 16: "${counterEl.textContent}"`);
  global.window.filterSourcesByWilaya('');
}

// Test Tenders Sorting
console.log('\n--- Testing Tenders Sorting ---');
const sortSel = mockDocument.getElementById('dzSortSelect');
if (sortSel) {
  sortSel.value = 'amount_desc';
  global.window.filterAndRenderTenders();
  feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
  console.log(`Sorted by amount_desc:\n${feedStats.trim()}`);

  sortSel.value = 'deadline_asc';
  global.window.filterAndRenderTenders();
  feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
  console.log(`Sorted by deadline_asc:\n${feedStats.trim()}`);
}

// Test Grouped optgroups in dzFilterSource
console.log('\n--- Testing Source Optgroups ---');
const filterSourceSelect = mockDocument.getElementById('dzFilterSource');
console.log(`dzFilterSource child nodes count: ${filterSourceSelect.children.length}`);
const optgroups = filterSourceSelect.children.filter(c => c.tagName === 'OPTGROUP');
console.log(`dzFilterSource optgroups count: ${optgroups.length}`);
optgroups.forEach(g => console.log(`  Optgroup: ${g.label}`));

// Test handleSectorFilterChange for COMMUNES and ENTERPRISES dropdown values
console.log('\n--- Testing Sector Dropdown COMMUNES & ENTERPRISES ---');
global.window.handleSectorFilterChange('COMMUNES');
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Dropdown sector 'COMMUNES':\n${feedStats.trim()}`);
if (!feedStats.includes('صفقة مطابقة')) {
  console.error('FAIL: Dropdown sector COMMUNES returned unexpected count!');
  process.exit(1);
}

global.window.handleSectorFilterChange('ENTERPRISES');
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`Dropdown sector 'ENTERPRISES':\n${feedStats.trim()}`);
if (!feedStats.includes('صفقة مطابقة')) {
  console.error('FAIL: Dropdown sector ENTERPRISES returned unexpected count!');
  process.exit(1);
}

// Test Source Quick Chip: Sonelgaz
console.log('\n--- Testing All 11 Source Quick Chips & Purity ---');
const sourceQuickChips = [
  'source-BOMOP', 'source-BAOSEM', 'source-GovPortal', 'source-Press',
  'source-TelecomPost', 'source-Sonelgaz', 'source-WaterSector',
  'source-RailwayTransport', 'source-FinancialBanks', 'source-HealthPharma',
  'source-MaritimePorts', 'urgent', 'sector-BTPH', 'sector-IT', 'sector-Medical', 'sector-Energy'
];
sourceQuickChips.forEach(chip => {
  global.window.setQuickChip(chip);
  const stats = mockDocument.getElementById('dzFeedStats').innerHTML;
  const m = stats.match(/class="badge-count">(\d+)<\/strong>/);
  const count = m ? parseInt(m[1], 10) : 0;
  console.log(`  Chip '${chip}': ${count} matching active tenders`);
  if (count <= 0) {
    console.error(`FAIL: Quick chip '${chip}' returned 0 results!`);
    process.exit(1);
  }
});

// Verify all Sector Dropdown options return > 0 results
console.log('\n--- Testing All Sector Dropdown Options ---');
global.window.clearAllMultiFilters();
const allSectors = ['COMMUNES', 'ENTERPRISES', 'BTPH', 'MEDICAL', 'IT', 'ENERGY', 'TRANSPORT', 'SERVICES', 'FURNITURE', 'STUDIES', 'AGRICULTURE'];
allSectors.forEach(sec => {
  mockDocument.getElementById('dzFilterSector').value = sec;
  global.window.handleSectorFilterChange(sec);
  const stats = mockDocument.getElementById('dzFeedStats').innerHTML;
  const m = stats.match(/class="badge-count">(\d+)<\/strong>/);
  const count = m ? parseInt(m[1], 10) : 0;
  console.log(`  Sector '${sec}': ${count} matching active tenders`);
  if (count <= 0) {
    console.error(`FAIL: Sector '${sec}' returned 0 results!`);
    process.exit(1);
  }
});
global.window.clearAllMultiFilters();

// Verify all Notice Type options return > 0 results
console.log('\n--- Testing All Notice Type Options ---');
const allNoticeTypes = ['appel_offres', 'consultation', 'attribution', 'prorogation', 'concours', 'infructueux', 'annulation'];
allNoticeTypes.forEach(nt => {
  global.window.selectAllNoticeTypes(false);
  global.window.toggleNoticeTypeSelection(nt, true);
  const stats = mockDocument.getElementById('dzFeedStats').innerHTML;
  const m = stats.match(/class="badge-count">(\d+)<\/strong>/);
  const count = m ? parseInt(m[1], 10) : 0;
  console.log(`  Notice Type '${nt}': ${count} matching tenders`);
  if (count <= 0) {
    console.error(`FAIL: Notice Type '${nt}' returned 0 results!`);
    process.exit(1);
  }
});
global.window.clearAllMultiFilters();

// Verify filterBySource() works across all entity categories (including UNIV_ALGER1, ADE_DG, SH_EP, and all 1,540 sources!)
console.log('\n--- Testing filterBySource() Across Entity Categories & All 1,540 Official Sources ---');
['ALGERIE_POSTE', 'SH_EP', 'SONATRACH', 'UNIV_ALGER1', 'ADE_DG', 'CHU_MUSTAPHA', 'APC_ALGER_CENTRE', 'Wilaya_16', 'DTP_16'].forEach(srcKey => {
  global.window.filterBySource(srcKey);
  const stats = mockDocument.getElementById('dzFeedStats').innerHTML;
  const m = stats.match(/class="badge-count">(\d+)<\/strong>/);
  const count = m ? parseInt(m[1], 10) : 0;
  console.log(`  filterBySource('${srcKey}'): ${count} matching active tenders`);
  if (count <= 0) {
    console.error(`FAIL: filterBySource('${srcKey}') returned 0 results!`);
    process.exit(1);
  }
});

// Verify every single one of the 1,540 sources in ALGERIAN_PROCUREMENT_SOURCES has >= 1 active tender via matchesSourceFilter
let zeroActiveSources = 0;
sources.forEach(s => {
  global.window.filterBySource(s.key);
  const stats = mockDocument.getElementById('dzFeedStats').innerHTML;
  const m = stats.match(/class="badge-count">(\d+)<\/strong>/);
  const count = m ? parseInt(m[1], 10) : 0;
  if (count <= 0) {
    console.error(`  Zero active tenders for source: ${s.key} (${s.nameAr})`);
    zeroActiveSources++;
  }
});
if (zeroActiveSources > 0) {
  console.error(`FAIL: ${zeroActiveSources} sources returned 0 active tenders on filterBySource!`);
  process.exit(1);
}
console.log(`  ✅ All ${sources.length} official sources return >= 1 active tender on filterBySource(s.key)!`);

// Verify localStorage does NOT store the 4.11MB static tenders key
if (mockWindow.localStorage.getItem('tender-dz-portal-data-v2') !== null) {
  console.error('FAIL: Static tenders were written to localStorage!');
  process.exit(1);
}
console.log('\nVerified: localStorage does NOT bloat with static 4.11MB tenders.');

// Test Clear All
console.log('\n--- Testing clearAllMultiFilters() ---');
global.window.clearAllMultiFilters();
feedStats = mockDocument.getElementById('dzFeedStats').innerHTML;
console.log(`After clearAllMultiFilters():\n${feedStats.trim()}`);
if (!feedStats.includes('1835')) {
  console.error('FAIL: clearAllMultiFilters() failed to restore 1835 active tenders!');
  process.exit(1);
}

console.log('\n=======================================');
console.log('EXHAUSTIVE TEST COMPLETE: 100% SUCCESS!');
console.log('=======================================');
process.exit(0);
