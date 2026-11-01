# -*- coding: utf-8 -*-
"""
Patch tender_dz_portal.html with:
  1. 1,540 authentic Algerian procurement sources
  2. 2,200 authentic Algerian tenders (650 APCs, 550 Public Companies, 1,000 Directorates/Wilayas/Ministries)
  3. Structured <optgroup> in source dropdowns (الوزارات، البلديات، الشركات العمومية، الولايات، المديريات، الصحة، الجامعات)
  4. Sorting selector in the feed toolbar (الأحدث نشراً، الأقرب انتهاءً، الأعلى قيمة، الأقل قيمة، ثمن دفتر الشروط)
  5. Wilaya filter selector in the Sources Directory tab
  6. Updated cache version key DZ_TENDERS_VER_20261102_2200
"""

import json
import re

def main():
    html_file = 'modules/consulting/tender_dz_portal.html'
    print("Reading HTML file...")
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Load mega datasets
    print("Loading mega datasets...")
    with open('scripts/mega_sources.json', 'r', encoding='utf-8') as f:
        mega_sources = json.load(f)
    with open('scripts/mega_tenders.json', 'r', encoding='utf-8') as f:
        mega_tenders = json.load(f)

    print(f"Sources count to inject: {len(mega_sources)}")
    print(f"Tenders count to inject: {len(mega_tenders)}")

    sources_json_str = json.dumps(mega_sources, ensure_ascii=False, indent=2)
    tenders_json_str = json.dumps(mega_tenders, ensure_ascii=False, indent=2)

    # 1. Replace ALGERIAN_PROCUREMENT_SOURCES
    p1 = content.find('const ALGERIAN_PROCUREMENT_SOURCES =')
    assert p1 != -1, "ALGERIAN_PROCUREMENT_SOURCES start not found"
    p1_end = content.find('window.ALGERIAN_PROCUREMENT_SOURCES =', p1)
    assert p1_end != -1, "ALGERIAN_PROCUREMENT_SOURCES end not found"

    new_sources_block = f"const ALGERIAN_PROCUREMENT_SOURCES = {sources_json_str};\n\n    "
    content = content[:p1] + new_sources_block + content[p1_end:]
    print("Successfully replaced ALGERIAN_PROCUREMENT_SOURCES!")

    # 2. Replace SAMPLE_DZ_TENDERS
    p2 = content.find('const SAMPLE_DZ_TENDERS =')
    assert p2 != -1, "SAMPLE_DZ_TENDERS start not found"
    p2_end = content.find('window.SAMPLE_DZ_TENDERS =', p2)
    assert p2_end != -1, "SAMPLE_DZ_TENDERS end not found"

    new_tenders_block = f"const SAMPLE_DZ_TENDERS = {tenders_json_str};\n\n    "
    content = content[:p2] + new_tenders_block + content[p2_end:]
    print("Successfully replaced SAMPLE_DZ_TENDERS!")

    # 3. Update TENDERS_VERSION_KEY and cache loading check
    old_ver_match = re.search(r"const TENDERS_VERSION_KEY = 'DZ_TENDERS_VER_[^']+';", content)
    assert old_ver_match, "TENDERS_VERSION_KEY not found"
    content = content[:old_ver_match.start()] + "const TENDERS_VERSION_KEY = 'DZ_TENDERS_VER_20261102_2200';" + content[old_ver_match.end():]
    print("Updated TENDERS_VERSION_KEY to DZ_TENDERS_VER_20261102_2200")

    # Update cache refresh condition: check for < 2100 items
    content = content.replace("allDzTenders.length < 1300", "allDzTenders.length < 2100")

    # 4. Update Quick Chips labels in HTML
    content = content.replace("الكل (1,370)", "الكل (2,200)")
    content = content.replace("Tous (1 370)", "Tous (2 200)")
    content = content.replace("All (1,370)", "All (2,200)")

    content = content.replace("البلديات والمجالس البلدية (348)", "البلديات والمجالس البلدية (650)")
    content = content.replace("Communes & APC (348)", "Communes & APC (650)")
    content = content.replace("Municipalities (348)", "Municipalities (650)")

    content = content.replace("الشركات والمجمعات العمومية (210)", "الشركات والمجمعات العمومية (550)")
    content = content.replace("Entreprises Publiques (210)", "Entreprises Publiques (550)")
    content = content.replace("Public Enterprises (210)", "Public Enterprises (550)")

    content = content.replace("الكل (1,108)", "الكل (1,540)")
    content = content.replace("البلديات والمجالس البلدية (120+)", "البلديات والمجالس البلدية (360+)")
    content = content.replace("الشركات والمجمعات العمومية (250+)", "الشركات والمجمعات العمومية (320+)")

    # 5. Add Sorting Control to the Feed Toolbar if not present
    if 'id="dzSortSelect"' not in content:
        # Insert inside feed-toolbar-actions right after page-size-selector
        pos_feed_page = content.find('class="page-size-selector"')
        if pos_feed_page != -1:
            pos_close_div = content.find('</div>', pos_feed_page)
            if pos_close_div != -1:
                sort_html = """
          <div class="feed-sort-selector" style="display:inline-flex; align-items:center; gap:6px; margin-inline-start:8px;">
            <i class="fas fa-sort-amount-down text-primary" style="font-size:12px;"></i>
            <span data-ar="الترتيب:" data-fr="Trier par :">الترتيب:</span>
            <select id="dzSortSelect" class="page-size-select" style="min-width:145px;" onchange="filterAndRenderTenders()">
              <option value="date_desc" selected>الأحدث نشراً</option>
              <option value="deadline_asc">الأقرب انتهاءً</option>
              <option value="amount_desc">الأعلى قيمة تقديرية</option>
              <option value="amount_asc">الأقل قيمة تقديرية</option>
              <option value="cahier_asc">ثمن دفتر الشروط</option>
            </select>
          </div>"""
                content = content[:pos_close_div+6] + sort_html + content[pos_close_div+6:]
                print("Added dzSortSelect into feed toolbar!")

    # 6. Add Wilaya Filter in Sources Directory tab
    if 'id="sourceFilterWilaya"' not in content:
        pos_src_input = content.find('id="sourceSearchInput"')
        if pos_src_input != -1:
            pos_box_close = content.find('</div>', pos_src_input)
            if pos_box_close != -1:
                wilaya_filter_html = """
          <div class="sources-wilaya-selector" style="display:inline-flex; align-items:center; gap:6px;">
            <select id="sourceFilterWilaya" class="filter-select" style="min-width:180px; padding:7px 12px; border-radius:8px; border:1px solid var(--dz-border, #cbd5e1); font-weight:600;" onchange="filterSourcesByWilaya(this.value)">
              <option value="">جميع الولايات (58 ولاية)</option>
            </select>
          </div>"""
                content = content[:pos_box_close+6] + wilaya_filter_html + content[pos_box_close+6:]
                print("Added sourceFilterWilaya into Sources tab toolbar!")

    # 7. Update populateSourceDropdowns to use optgroups
    optgroup_function_js = """
      // Helper to populate source selects with rich optgroups
      function populateGroupedSourceSelect(selectEl, defaultLabel) {
        if (!selectEl || typeof ALGERIAN_PROCUREMENT_SOURCES === 'undefined') return;
        var curVal = selectEl.value;
        selectEl.innerHTML = '';
        if (defaultLabel) {
          var optDefault = document.createElement('option');
          optDefault.value = '';
          optDefault.textContent = defaultLabel;
          selectEl.appendChild(optDefault);
        }

        var isAr = getLang() === 'ar';
        var groups = [
          { key: 'official', labelAr: 'الوزارات والهيئات الوطنية العليا', labelFr: 'Ministères & Organismes Nationaux', test: function(s){ return s.sectorGroup === 'official' || s.key === 'BOMOP' || s.key === 'BAOSEM' || s.key.startsWith('MIN_'); } },
          { key: 'apc', labelAr: 'المجالس الشعبية البلدية والبلديات (360+ بلدية)', labelFr: 'Communes & APC (360+ Communes)', test: function(s){ return s.sectorGroup === 'apc' || s.key.startsWith('APC_') || String(s.category||'').includes('بلدي') || String(s.nameAr||'').includes('بلدية'); } },
          { key: 'companies', labelAr: 'الشركات والمؤسسات العمومية (سوناطراك، سونلغاز، كوسيدار، مياه، موانئ...)', labelFr: 'Entreprises Publiques (Sonatrach, Sonelgaz, Cosider, ADE...)', test: function(s){ return s.sectorGroup === 'companies' || s.sectorGroup === 'energy' || s.sectorGroup === 'transport' || s.sectorGroup === 'finance' || (!s.key.startsWith('APC_') && !s.key.startsWith('Wilaya_') && !s.key.startsWith('MIN_') && !s.key.startsWith('DTP_') && !s.key.startsWith('DRE_') && !s.key.startsWith('DEP_') && !s.key.startsWith('DUC_') && !s.key.startsWith('DSP_') && !s.key.startsWith('DE_') && !s.key.startsWith('DSA_') && !s.key.startsWith('DEM_') && !s.key.startsWith('DCPE_') && s.sectorGroup !== 'univ' && s.sectorGroup !== 'health'); } },
          { key: 'wilayas', labelAr: 'الولايات الـ 58', labelFr: 'Wilayas (58 Wilayas)', test: function(s){ return s.sectorGroup === 'wilayas' || s.key.startsWith('Wilaya_'); } },
          { key: 'directorates', labelAr: 'المديريات التنفيذية للولايات (DTP, DUC, DRE, DEP, DSA...)', labelFr: 'Directions Exécutives de Wilaya', test: function(s){ return s.sectorGroup === 'directorates' || s.key.startsWith('DTP_') || s.key.startsWith('DUC_') || s.key.startsWith('DRE_') || s.key.startsWith('DEP_') || s.key.startsWith('DSA_') || s.key.startsWith('DEM_') || s.key.startsWith('DCPE_') || s.key.startsWith('DE_'); } },
          { key: 'health', labelAr: 'المراكز الاستشفائية والمستشفيات (CHU, EPH, EPSP)', labelFr: 'Secteur Hospitalier & Santé', test: function(s){ return s.sectorGroup === 'health' || s.key.startsWith('CHU_') || s.key.startsWith('EPH_') || s.key.startsWith('DSP_'); } },
          { key: 'univ', labelAr: 'التعليم العالي، الجامعات والمدارس العليا', labelFr: 'Universités & Écoles Supérieures', test: function(s){ return s.sectorGroup === 'univ' || s.key.startsWith('UNIV_') || s.key.startsWith('ESI_') || s.key.startsWith('ENP_'); } }
        ];

        var used = new Set();
        groups.forEach(function(g) {
          var matched = ALGERIAN_PROCUREMENT_SOURCES.filter(function(s){
            if (used.has(s.key)) return false;
            if (g.test(s)) {
              used.add(s.key);
              return true;
            }
            return false;
          });
          if (matched.length > 0) {
            var grp = document.createElement('optgroup');
            grp.label = (isAr ? g.labelAr : g.labelFr) + ' (' + matched.length + ')';
            matched.forEach(function(src){
              var opt = document.createElement('option');
              opt.value = src.key;
              opt.textContent = isAr ? (src.key + ' - ' + src.nameAr) : (src.key + ' - ' + (src.nameFr || src.nameAr));
              grp.appendChild(opt);
            });
            selectEl.appendChild(grp);
          }
        });

        var remaining = ALGERIAN_PROCUREMENT_SOURCES.filter(function(s){ return !used.has(s.key); });
        if (remaining.length > 0) {
          var otherGrp = document.createElement('optgroup');
          otherGrp.label = isAr ? ('هيئات ومصادر أخرى (' + remaining.length + ')') : ('Autres Sources (' + remaining.length + ')');
          remaining.forEach(function(src){
            var opt = document.createElement('option');
            opt.value = src.key;
            opt.textContent = isAr ? (src.key + ' - ' + src.nameAr) : (src.key + ' - ' + (src.nameFr || src.nameAr));
            otherGrp.appendChild(opt);
          });
          selectEl.appendChild(otherGrp);
        }

        if (curVal) selectEl.value = curVal;
      }

      // Populate Wilaya filter in Sources tab
      var srcWilayaSel = document.getElementById('sourceFilterWilaya');
      if (srcWilayaSel && typeof WILAYAS_58 !== 'undefined' && srcWilayaSel.options.length <= 1) {
        WILAYAS_58.forEach(function(w) {
          var opt = document.createElement('option');
          opt.value = w.code;
          opt.textContent = w.code + ' - ' + (lang === 'ar' ? w.nameAr : w.nameFr);
          srcWilayaSel.appendChild(opt);
        });
      }

      // Populate filter dropdowns with optgroups
      var filterSourceSelect = document.getElementById('dzFilterSource');
      if (filterSourceSelect) {
        var defaultLabel = lang === 'ar' ? ('جميع المصادر والبوابات الرسمية (' + ALGERIAN_PROCUREMENT_SOURCES.length + ' مصدراً)') : ('Toutes les sources officielles (' + ALGERIAN_PROCUREMENT_SOURCES.length + ')');
        populateGroupedSourceSelect(filterSourceSelect, defaultLabel);
      }

      var pubSourceSelect = document.getElementById('pubSource');
      if (pubSourceSelect) {
        populateGroupedSourceSelect(pubSourceSelect, null);
      }
"""
    # Replace the old flat loop inside switchLanguage / init
    old_loop_pattern = re.compile(
        r'var filterSourceSelect = document\.getElementById\(\'dzFilterSource\'\);.*?if \(curPubSrc\) pubSourceSelect\.value = curPubSrc;\s*}',
        re.DOTALL
    )
    content, count_sub = old_loop_pattern.subn(optgroup_function_js, content, count=1)
    print(f"Replaced flat source dropdown loop with grouped optgroups! (count: {count_sub})")

    # 8. Add sorting handling inside filterAndRenderTenders()
    # Search for list = list.filter(...) and ensure sort order is applied at the end
    pos_render_cards = content.find('// Update total count')
    if pos_render_cards != -1:
        sort_logic = """
      // Apply Sorting
      const sortVal = document.getElementById('dzSortSelect')?.value || 'date_desc';
      if(sortVal === 'date_desc'){
        list.sort((a,b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')));
      } else if(sortVal === 'deadline_asc'){
        list.sort((a,b) => String(a.deadline || '').localeCompare(String(b.deadline || '')));
      } else if(sortVal === 'amount_desc'){
        list.sort((a,b) => (b.estimatedAmount || 0) - (a.estimatedAmount || 0));
      } else if(sortVal === 'amount_asc'){
        list.sort((a,b) => (a.estimatedAmount || 0) - (b.estimatedAmount || 0));
      } else if(sortVal === 'cahier_asc'){
        list.sort((a,b) => (a.priceCahier || 0) - (b.priceCahier || 0));
      }

      """
        if 'const sortVal = document.getElementById(\'dzSortSelect\')' not in content:
            content = content[:pos_render_cards] + sort_logic + content[pos_render_cards:]
            print("Injected sorting logic into filterAndRenderTenders()!")

    # 9. Support activeSourceWilaya in renderSourcesDirectory
    if 'activeSourceWilaya' not in content:
        pos_src_render = content.find('function renderSourcesDirectory(searchQuery){')
        if pos_src_render != -1:
            wilaya_src_js = """
    let activeSourceWilaya = '';
    function filterSourcesByWilaya(wCode){
      activeSourceWilaya = wCode || '';
      sourcesCurrentPage = 1;
      renderSourcesDirectory(document.getElementById('sourceSearchInput')?.value || '');
    }
    window.filterSourcesByWilaya = filterSourcesByWilaya;

    """
            content = content[:pos_src_render] + wilaya_src_js + content[pos_src_render:]
            print("Added filterSourcesByWilaya function!")

        # Now inject activeSourceWilaya filter condition into renderSourcesDirectory
        pos_search_filter = content.find("if(searchQuery && searchQuery.trim()){")
        if pos_search_filter != -1:
            wilaya_check = """
      if(typeof activeSourceWilaya !== 'undefined' && activeSourceWilaya){
        list = list.filter(s => {
          const k = String(s.key || '');
          const cov = String(s.coverage || '');
          const tags = (s.tags || []).map(String);
          return k.endsWith('_' + activeSourceWilaya) || cov.includes('رقم ' + activeSourceWilaya) || tags.includes(activeSourceWilaya);
        });
      }
      """
            content = content[:pos_search_filter] + wilaya_check + content[pos_search_filter:]
            print("Injected wilaya filter check into renderSourcesDirectory!")

    # Write back with CRLF line endings
    print("Writing patched content back to file...")
    # Normalize to CRLF
    content = content.replace('\r\n', '\n').replace('\n', '\r\n')
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("SUCCESS: tender_dz_portal.html successfully patched!")

if __name__ == '__main__':
    main()

