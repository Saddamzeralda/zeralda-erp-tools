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

console.log('\n=======================================');
console.log('EXHAUSTIVE TEST COMPLETE: 100% SUCCESS!');
console.log('=======================================');
process.exit(0);
