# -*- coding: utf-8 -*-
"""
Wire getLocalizedTender into renderTenderCards, openDetailModal, and filterAndRenderTenders.
"""
import os
import re

HTML_PATH = r"C:\Users\sadda\Desktop\zeralda-erp-tools\modules\consulting\tender_dz_portal.html"

with open(HTML_PATH, encoding="utf-8") as f:
    content = f.read()

# 1. Update filterAndRenderTenders to include t.titleFr and t.titleEn in searchTxt filter
old_search_block = """          if(searchTxt){
            list = list.filter(t => {
              return [t.title, t.authority, t.reference, t.wilayaName, t.qualification, t.depositPlace, t.source, ...(t.lots || [])]
                .some(val => String(val || '').toLowerCase().includes(searchTxt));
            });
          }"""

new_search_block = """          if(searchTxt){
            list = list.filter(t => {
              return [t.title, t.titleFr, t.titleEn, t.authority, t.reference, t.wilayaName, t.qualification, t.depositPlace, t.source, ...(t.lots || [])]
                .some(val => String(val || '').toLowerCase().includes(searchTxt));
            });
          }"""

if old_search_block in content:
    content = content.replace(old_search_block, new_search_block, 1)
    print("Updated filterAndRenderTenders to search titleFr and titleEn.")
else:
    print("Warning: old_search_block not found exactly, trying regex...")
    content = re.sub(
        r'return \[t\.title,\s*t\.authority,',
        'return [t.title, t.titleFr, t.titleEn, t.authority,',
        content,
        count=1
    )
    print("Replaced search array with titleFr and titleEn via regex.")

# 2. Update renderTenderCards
# Find renderTenderCards(list) and ensure it uses loc
# In renderTenderCards, let's see how tender is iterated:
# list.forEach(tender => {
# const isFav = ...
old_card_loop = """      list.forEach(tender => {
        const isFav = favoriteIds.includes(tender.id);"""

new_card_loop = """      const curLang = getLang();
      list.forEach(tender => {
        const loc = getLocalizedTender(tender, curLang);
        const isFav = favoriteIds.includes(tender.id);"""

if old_card_loop in content:
    content = content.replace(old_card_loop, new_card_loop, 1)
    print("Injected const loc = getLocalizedTender(tender, curLang) into renderTenderCards.")

# In card template:
# Replace tender.authority in auth-name with loc.authority
content = content.replace(
    """<div class="auth-name" title="${escapeHtml(tender.authority)}">${escapeHtml(tender.authority)}</div>""",
    """<div class="auth-name" title="${escapeHtml(loc.authority)}">${escapeHtml(loc.authority)}</div>"""
)

# Replace tender.title in title
content = content.replace(
    """<div class="tender-card-title" onclick="toggleCardFold('${tender.id}')" title="${escapeHtml(tender.title)}">
              ${escapeHtml(tender.title)}
            </div>""",
    """<div class="tender-card-title" onclick="toggleCardFold('${tender.id}')" title="${escapeHtml(loc.title)}">
              ${escapeHtml(loc.title)}
            </div>"""
)

# Replace typeName
content = content.replace(
    """${tender.typeName ? `<span class="dz-tag dz-tag-type">${escapeHtml(tender.typeName)}</span>` : ''}""",
    """${loc.typeName ? `<span class="dz-tag dz-tag-type">${escapeHtml(loc.typeName)}</span>` : ''}"""
)

# Replace caution in spec-item
content = content.replace(
    """<span class="spec-val">${escapeHtml(tender.caution || '1%')}</span>""",
    """<span class="spec-val">${escapeHtml(loc.caution || tender.caution || '1%')}</span>"""
)

# Replace lots rendering
content = content.replace(
    """${tender.lots.map(lot => `<li><i class="fas fa-check-circle"></i> <span>${escapeHtml(lot)}</span></li>`).join('')}""",
    """${(loc.lots && loc.lots.length ? loc.lots : tender.lots).map(lot => `<li><i class="fas fa-check-circle"></i> <span>${escapeHtml(lot)}</span></li>`).join('')}"""
)

# Replace qualification
content = content.replace(
    """<i class="fas fa-certificate text-warning"></i> <strong>${escapeHtml(i18n('qualification'))}:</strong> ${escapeHtml(tender.qualification)}""",
    """<i class="fas fa-certificate text-warning"></i> <strong>${escapeHtml(i18n('qualification'))}:</strong> ${escapeHtml(loc.qualification || tender.qualification)}"""
)

# Replace depositPlace
content = content.replace(
    """<span><strong>${escapeHtml(i18n('depositPlace'))}</strong> ${escapeHtml(tender.depositPlace)}</span>""",
    """<span><strong>${escapeHtml(i18n('depositPlace'))}</strong> ${escapeHtml(loc.depositPlace || tender.depositPlace)}</span>"""
)

# 3. Update openDetailModal(tenderId)
old_modal_start = """    function openDetailModal(tenderId){
      const tender = allDzTenders.find(x => x.id === tenderId);
      if(!tender) return;
      currentModalTender = tender;
      const lang = getLang();
      const isAr = lang === 'ar';
      const isFr = lang === 'fr';"""

new_modal_start = """    function openDetailModal(tenderId){
      const tender = allDzTenders.find(x => x.id === tenderId);
      if(!tender) return;
      currentModalTender = tender;
      const lang = getLang();
      const isAr = lang === 'ar';
      const isFr = lang === 'fr';
      const loc = getLocalizedTender(tender, lang);"""

if old_modal_start in content:
    content = content.replace(old_modal_start, new_modal_start, 1)
    print("Injected const loc = getLocalizedTender(tender, lang) into openDetailModal.")

# In openDetailModal title
content = content.replace(
    """document.getElementById('detailModalTitle').textContent = (tender.reference || 'AO') + ' — ' + (tender.title || i18n('detailModalDefaultTitle'));""",
    """document.getElementById('detailModalTitle').textContent = (tender.reference || 'AO') + ' — ' + (loc.title || tender.title || i18n('detailModalDefaultTitle'));"""
)

# In openDetailModal authority
content = content.replace(
    """<div style="font-size:13px; font-weight:700; margin-top:4px;">${escapeHtml(tender.authority)}</div>""",
    """<div style="font-size:13px; font-weight:700; margin-top:4px;">${escapeHtml(loc.authority || tender.authority)}</div>"""
)

# In openDetailModal noticeTypeName
content = content.replace(
    """<h2>${escapeHtml(noticeTypeName)}</h2>""",
    """<h2>${escapeHtml(loc.typeName || noticeTypeName)}</h2>"""
)

# In openDetailModal notice-title-box
content = content.replace(
    """<div class="notice-title-box">
            ${escapeHtml(tender.title)}
          </div>""",
    """<div class="notice-title-box">
            ${escapeHtml(loc.title || tender.title)}
          </div>"""
)

# In openDetailModal intro sentence
content = content.replace(
    """${isAr 
              ? `تعلن <strong>${escapeHtml(tender.authority)}</strong> عن إطلاق <strong>${escapeHtml(noticeTypeName)}</strong> المتعلق بـ:`
              : (isFr 
                  ? `<strong>${escapeHtml(tender.authority)}</strong> lance un avis de <strong>${escapeHtml(noticeTypeName)}</strong> portant sur :`
                  : `<strong>${escapeHtml(tender.authority)}</strong> announces the launch of a <strong>${escapeHtml(noticeTypeName)}</strong> regarding:`)
            }""",
    """${isAr 
              ? `تعلن <strong>${escapeHtml(loc.authority || tender.authority)}</strong> عن إطلاق <strong>${escapeHtml(loc.typeName || noticeTypeName)}</strong> المتعلق بـ:`
              : (isFr 
                  ? `<strong>${escapeHtml(loc.authority || tender.authority)}</strong> lance un avis de <strong>${escapeHtml(loc.typeName || noticeTypeName)}</strong> portant sur :`
                  : `<strong>${escapeHtml(loc.authority || tender.authority)}</strong> announces the launch of a <strong>${escapeHtml(loc.typeName || noticeTypeName)}</strong> regarding:`)
            }"""
)

# In openDetailModal lots
content = content.replace(
    """${(tender.lots && tender.lots.length) ? `
            <div style="margin-bottom:14px;">
              <strong>${escapeHtml(i18n('lotsDetailLabel'))}</strong>
              <ul style="margin-top:6px; padding-${isAr ? 'right' : 'left'}:24px; line-height:1.8;">
                ${tender.lots.map(lot => `<li>${escapeHtml(lot)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}""",
    """${((loc.lots && loc.lots.length) || (tender.lots && tender.lots.length)) ? `
            <div style="margin-bottom:14px;">
              <strong>${escapeHtml(i18n('lotsDetailLabel'))}</strong>
              <ul style="margin-top:6px; padding-${isAr ? 'right' : 'left'}:24px; line-height:1.8;">
                ${(loc.lots && loc.lots.length ? loc.lots : tender.lots).map(lot => `<li>${escapeHtml(lot)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}"""
)

# In openDetailModal caution
content = content.replace(
    """<div>• <strong>${escapeHtml(i18n('caution'))}</strong> <strong>${escapeHtml(tender.caution || '1%')}</strong></div>""",
    """<div>• <strong>${escapeHtml(i18n('caution'))}</strong> <strong>${escapeHtml(loc.caution || tender.caution || '1%')}</strong></div>"""
)

# In openDetailModal qualification
content = content.replace(
    """<p style="margin-top:4px; opacity:0.9;">${escapeHtml(tender.qualification || defaultQual)}</p>""",
    """<p style="margin-top:4px; opacity:0.9;">${escapeHtml(loc.qualification || tender.qualification || defaultQual)}</p>"""
)

# In openDetailModal depositPlace
content = content.replace(
    """<p style="margin-top:4px; opacity:0.9;">${escapeHtml(tender.depositPlace || defaultDeposit)}</p>""",
    """<p style="margin-top:4px; opacity:0.9;">${escapeHtml(loc.depositPlace || tender.depositPlace || defaultDeposit)}</p>"""
)

# 4. Update renderAttributionsTable
old_attrib_row = """      attributions.forEach(tender => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong style="color:var(--dz-primary);">${escapeHtml(tender.reference||'ATTRIB')}</strong></td>
          <td style="font-weight:600;">${escapeHtml(tender.authority||'-')}</td>
          <td>${escapeHtml(tender.title||'-')}</td>"""

new_attrib_row = """      attributions.forEach(tender => {
        const loc = getLocalizedTender(tender, lang);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong style="color:var(--dz-primary);">${escapeHtml(tender.reference||'ATTRIB')}</strong></td>
          <td style="font-weight:600;">${escapeHtml(loc.authority||tender.authority||'-')}</td>
          <td>${escapeHtml(loc.title||tender.title||'-')}</td>"""

if old_attrib_row in content:
    content = content.replace(old_attrib_row, new_attrib_row, 1)
    print("Updated renderAttributionsTable with loc.authority and loc.title.")

with open(HTML_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("Saved updated tender_dz_portal.html successfully!")
