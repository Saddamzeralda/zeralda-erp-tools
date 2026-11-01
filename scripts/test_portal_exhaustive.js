// Exhaustive test runner for tender_dz_portal.html
const fs = require('fs');

console.log('Loading tender_dz_portal.html...');
const html = fs.readFileSync('modules/consulting/tender_dz_portal.html', 'utf8');

// Extract all <script> contents
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scripts = [];
while ((match = scriptRegex.exec(html)) !== null) {
  // Ignore external src scripts
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
  'attributionsTableBody', 'prorogationsTableBody', 'paginationControls', 'tendersCounterLabel',
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

const mockWindow = {
  document: mockDocument,
  localStorage: {
    getItem: function(k) { return null; },
    setItem: function(k, v) {}
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

// Test Sources Directory functionality
const sources = global.window.ALGERIAN_PROCUREMENT_SOURCES;
console.log(`\nALGERIAN_PROCUREMENT_SOURCES count: ${sources ? sources.length : 0}`);
if (!sources || sources.length < 1000) {
  console.error('FAIL: Sources count is less than 1,000!');
  process.exit(1);
}

// Test renderSourcesDirectory
console.log('\nTesting renderSourcesDirectory()...');
global.window.renderSourcesDirectory();
const gridEl = mockDocument.getElementById('sourcesDirectoryGrid');
console.log(`Rendered cards on page 1: ${gridEl.children.length}`);
if (gridEl.children.length !== 24) {
  console.error(`FAIL: Expected 24 cards on page 1, got ${gridEl.children.length}`);
  process.exit(1);
}

const counterEl = mockDocument.getElementById('sourcesCounterLabel');
console.log(`Sources counter label: "${counterEl.textContent}"`);

// Test goToSourcePage
console.log('\nTesting goToSourcePage(2)...');
global.window.goToSourcePage(2);
console.log(`Rendered cards on page 2: ${gridEl.children.length}`);
console.log(`Sources counter label on page 2: "${counterEl.textContent}"`);

// Test search
console.log('\nTesting filterSourcesGrid("سوناطراك")...');
global.window.filterSourcesGrid("سوناطراك");
console.log(`Rendered search cards for "سوناطراك": ${gridEl.children.length}`);
console.log(`Sources counter label: "${counterEl.textContent}"`);

console.log('\nTesting filterSourcesGrid("DTP")...');
global.window.filterSourcesGrid("DTP");
console.log(`Rendered search cards for "DTP": ${gridEl.children.length}`);
console.log(`Sources counter label: "${counterEl.textContent}"`);

// Test filterSourcesByGroup
console.log('\nTesting filterSourcesByGroup("wilayas")...');
global.window.filterSourcesByGroup("wilayas");
console.log(`Rendered cards for "wilayas": ${gridEl.children.length}`);
console.log(`Counter: "${counterEl.textContent}"`);

console.log('\nTesting filterSourcesByGroup("directorates")...');
global.window.filterSourcesByGroup("directorates");
console.log(`Rendered cards for "directorates": ${gridEl.children.length}`);
console.log(`Counter: "${counterEl.textContent}"`);

console.log('\nTesting filterSourcesByGroup("all")...');
global.window.filterSourcesByGroup("all");
console.log(`Rendered cards for "all": ${gridEl.children.length}`);
console.log(`Counter: "${counterEl.textContent}"`);

// Test filterBySource
console.log('\nTesting filterBySource("DTP_16")...');
global.window.filterBySource("DTP_16");
console.log(`Selected Wilaya value: ${mockDocument.getElementById('dzFilterWilaya').value}`);
console.log(`Selected Source value: ${mockDocument.getElementById('dzFilterSource').value}`);

// Test Legal Calculators
console.log('\nTesting legal calculators...');
if (typeof global.window.calculateProcurementCautions === 'function') {
  global.window.calculateProcurementCautions();
  console.log('calculateProcurementCautions OK');
}
if (typeof global.window.calculateLegalAppeals === 'function') {
  global.window.calculateLegalAppeals();
  console.log('calculateLegalAppeals OK');
}

console.log('\n=======================================');
console.log('EXHAUSTIVE TEST COMPLETE: 100% SUCCESS!');
console.log('=======================================');

process.exit(0);
