from __future__ import annotations

import os
from pathlib import Path

import fitz


RAW_ITEMS = """
1	08	DVD-R avec jaquette	—	8 000	0,00	0,00
2	08	CD-R avec jaquette	—	1 000	0,00	0,00
3	08	DVD-R avec face imprimable avec boitier	—	1 000	0,00	0,00
4	08	CD-R avec face imprimable avec boitier	—	1 000	0,00	0,00
5	08	Papier listing 80col. - 3 exemplaire (rame 250 f.)	—	200	0,00	0,00
6	08	Papier listing 80col. - 5 exemplaire (rame 250 f.)	—	30	0,00	0,00
7	08	Papier format A0 (rouleau)	—	30	0,00	0,00
8	08	Mousse de nettoyage informatique	—	400	0,00	0,00
9	08	Serviettes de nettoyage non pelucheuses	—	300	0,00	0,00
10	08	Bombe à air comprimé (≥200 ml)	—	300	0,00	0,00
11	08	Souffleur d'air électrique (≥500W)	—	30	0,00	0,00
12	08	Ruban étiqueteuse DYMO (12mm x 5.5m)	—	5	0,00	0,00
13	08	Clavier Azerty USB Bilingue	—	100	0,00	0,00
14	08	Souris Optique USB	—	100	0,00	0,00
15	08	Câble USB pour imprimante	—	100	0,00	0,00
16	08	Câble HDMI 20m	—	30	0,00	0,00
17	08	Câble HDMI 10m	—	30	0,00	0,00
18	08	Câble VGA 20m	—	30	0,00	0,00
19	08	Pointeur laser sans fil avec télécommande	—	40	0,00	0,00
20	08	Pile CMOS 3V CR2032	—	300	0,00	0,00
21	08	Pile CMOS 3V CR1620	—	100	0,00	0,00
22	08	Disque dur externe 2 To	—	30	0,00	0,00
23	08	Câble FTP Cat 6e (touret 500m)	—	5 000 m	0,00	0,00
24	08	Cordon de liaison 3m	—	100	0,00	0,00
25	08	Prise murale RJ45 cat.6e apparente avec noyau	—	100	0,00	0,00
26	08	Connecteur RJ45 catégorie 6e	—	500	0,00	0,00
27	08	Panneau de brassage 24 ports	—	20	0,00	0,00
28	08	Noyau pour prise RJ45 Cat 6e (2 modules)	—	200	0,00	0,00
29	08	Goulotte 38x38 mm (mètre)	—	200	0,00	0,00
30	08	Goulotte 20x40 mm (mètre)	—	480	0,00	0,00
31	02	Ruban LQ 2090 (Epson)	C1350153368	300	0,00	0,00
32	02	Ruban LX 350 (Epson)	C1350156374	30	0,00	0,00
33	02	Toner Noir Aculaser M2000D (500p)	C1350504383	500	0,00	0,00
34	02	Photoconducteur M2000D (100k p.)	1507516	100	0,00	0,00
35	02	Toner Noir Aculaser M2400D (8k p.)	C1350505848	200	0,00	0,00
36	02	Photoconducteur M2400D (100k p.)	1540498	50	0,00	0,00
37	02	Toner Noir Aculaser M300D (10k p.)	C1350506911	200	0,00	0,00
38	02	Photoconducteur M300D (100k p.)	C135051228	30	0,00	0,00
39	02	Unité fusion M300D (100k p.)	C135053049	8	0,00	0,00
40	02	Toner Noir C9300DN (6.5k p.)	C1350506056	6	0,00	0,00
41	02	Toner Cyan C9300DN (7.5k p.)	C1350506047	4	0,00	0,00
42	02	Toner Magenta C9300DN (7.5k p.)	C1350506037	4	0,00	0,00
43	02	Toner Jaune C9300DN (7.5k p.)	C1350506027	4	0,00	0,00
44	02	Photoconducteur Couleur C9300DN (24k p.)	C135051209	8	0,00	0,00
45	02	Photoconducteur Noir C9300DN (24k p.)	C135051210	8	0,00	0,00
46	03	Toner Noir Brother HL-2310D (3k p.)	TN-2420	50	0,00	0,00
47	03	Kit Tambour Brother HL-2310D (12k p.)	DR-2400	10	0,00	0,00
48	03	Cartouche Noir Brother MCF J6510DW	LC1240BK	2	0,00	0,00
49	03	Cartouche Cyan Brother MCF J6510DW	LC1240C	2	0,00	0,00
50	03	Cartouche Magenta Brother MCF J6510DW	LC1240M	2	0,00	0,00
51	03	Cartouche Jaune Brother MCF J6510DW	LC1240Y	2	0,00	0,00
52	03	Cartouche Noir Mat Canon IPF 755 (130ml)	PFI-102MBK	2	0,00	0,00
53	03	Cartouche Noir Canon IPF 755 (130ml)	PFI-102BK	4	0,00	0,00
54	03	Cartouche Cyan Canon IPF 755 (130ml)	PFI-102C	2	0,00	0,00
55	03	Cartouche Magenta Canon IPF 755 (130ml)	PFI-102M	2	0,00	0,00
56	03	Cartouche Jaune Canon IPF 755 (130ml)	PFI-102Y	2	0,00	0,00
57	03	Toner Noir Canon LBP236DW (3 100 p.)	3009C002/057	600	0,00	0,00
58	03	Cartouche Noir Canon TR150 (191p.)	PGI35BK/1509B029	4	0,00	0,00
59	03	Cartouche Couleur Canon TR150 (249p.)	CLI36/1511B025	4	0,00	0,00
60	06	Ruban Dascom 2610+ (15M car.)	099071L	800	0,00	0,00
61	06	Toner Noir Kyocera PA4500X (12.5k p.)	TK-3400	50	0,00	0,00
62	06	Toner Noir Kyocera P4140DN (15k p.)	TK-7310	12	0,00	0,00
63	07	Toner Noir Pantum BP5200DN (6k p.)	TL-A5220H	1 000	0,00	0,00
64	07	Photoconducteur Pantum BP5200DN (30k p.)	DL-A5220	300	0,00	0,00
65	07	Toner Noir Konica BizHub 5000i (20k p.)	TNP75/ACF0051	20	0,00	0,00
66	04	Toner Noir Oki B6250n (16k p.)	01225401	150	0,00	0,00
67	04	Toner Noir Oki B432 (7k p.)	45807106	220	0,00	0,00
68	04	Photoconducteur Oki B432 (23k p.)	44574302	60	0,00	0,00
69	04	Unité fusion Oki B432 (200k p.)	44565811	10	0,00	0,00
70	04	Toner Noir Oki C844DNW (5k p.)	47095704	10	0,00	0,00
71	04	Toner Magenta Oki C844DNW (5k p.)	47095702	10	0,00	0,00
72	04	Toner Cyan Oki C844DNW (5k p.)	47095703	10	0,00	0,00
73	04	Toner Jaune Oki C844DNW (5k p.)	47095701	10	0,00	0,00
74	04	Tambour Noir Oki C844DNW (30k p.)	46857508	10	0,00	0,00
75	04	Tambour Cyan Oki C844DNW (30k p.)	46857507	10	0,00	0,00
76	04	Tambour Magenta Oki C844DNW (30k p.)	46857506	10	0,00	0,00
77	04	Tambour Jaune Oki C844DNW (30k p.)	46857505	10	0,00	0,00
78	05	Toner Noir Xerox 3655XT (6 100 p.)	106R02736	3	0,00	0,00
79	05	Toner Noir Xerox 3330V (8k p.)	106R03622	50	0,00	0,00
80	05	Photoconducteur Xerox 3330V (30k p.)	101R00555	15	0,00	0,00
81	05	Toner Noir Xerox Phaser 7500DN (19.8k p.)	106R01446	5	0,00	0,00
82	05	Toner Magenta Xerox Phaser 7500DN (17.8k p.)	106R01444	5	0,00	0,00
83	05	Toner Cyan Xerox Phaser 7500DN (17.8k p.)	106R01443	5	0,00	0,00
84	05	Toner Jaune Xerox Phaser 7500DN (17.8k p.)	106R01445	5	0,00	0,00
85	05	Module d'imagerie Xerox 7500DN (80k p.)	108R00861	2	0,00	0,00
86	05	Récupérateur toner usagé Xerox 7500DN	108R00865	2	0,00	0,00
87	05	Unité fusion Xerox 7500DN (100k p.)	115R00062	2	0,00	0,00
88	05	Unité transfert Xerox 7500DN (100k p.)	604K49185/...	2	0,00	0,00
89	05	Toner Noir Xerox Phaser 6600 (3k p.)	106R02248	3	0,00	0,00
90	05	Toner Magenta Xerox Phaser 6600 (2k p.)	106R02246	3	0,00	0,00
91	05	Toner Cyan Xerox Phaser 6600 (2k p.)	106R02245	3	0,00	0,00
92	05	Toner Jaune Xerox Phaser 6600 (2k p.)	106R02247	3	0,00	0,00
93	05	Toner Noir Ricoh FD4310N (15k p.)	403180	250	0,00	0,00
94	05	Toner Noir Ricoh MP C3003 (29.5k p.)	841817	2	0,00	0,00
95	05	Toner Magenta Ricoh MP C3003 (18k p.)	841819	2	0,00	0,00
96	05	Toner Cyan Ricoh MP C3003 (18k p.)	841820	2	0,00	0,00
97	05	Toner Jaune Ricoh MP C3003 (18k p.)	841818	2	0,00	0,00
""".strip()


OUTPUT_FILE = Path("docs/generated/facture_proforma_fournitures_2026-03-29.pdf")
ISSUE_DATE = "29/03/2026"
PROFORMA_NUMBER = "PF-20260329-001"


PAGE_RECT = fitz.paper_rect("a4-l")
PAGE_WIDTH = PAGE_RECT.width
PAGE_HEIGHT = PAGE_RECT.height

MARGIN_X = 26
TOP_MARGIN = 22
BOTTOM_MARGIN = 24
TABLE_HEADER_HEIGHT = 22
LINE_HEIGHT = 8.7
CELL_PADDING_X = 4
CELL_PADDING_Y = 4
BODY_FONT = "helv"
BODY_FONT_BOLD = "helvb"
BODY_SIZE = 7.5
META_SIZE = 8.5
TITLE_SIZE = 20
SMALL_SIZE = 7

COLOR_NAVY = (21 / 255, 54 / 255, 93 / 255)
COLOR_SLATE = (71 / 255, 85 / 255, 105 / 255)
COLOR_LIGHT = (241 / 255, 245 / 255, 249 / 255)
COLOR_GRID = (203 / 255, 213 / 255, 225 / 255)
COLOR_TEXT = (15 / 255, 23 / 255, 42 / 255)
COLOR_MUTED = (100 / 255, 116 / 255, 139 / 255)


COLUMNS = [
    ("N°", 30, "center"),
    ("Lot", 38, "center"),
    ("Designation complete", 344, "left"),
    ("Reference", 120, "left"),
    ("Qte", 70, "right"),
    ("P.U. (DA)", 80, "right"),
    ("Montant (DA)", 108, "right"),
]


def parse_items(raw_text: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for line in raw_text.splitlines():
        cols = [chunk.strip() for chunk in line.split("\t")]
        if len(cols) != 7:
            raise ValueError(f"Ligne invalide: {line!r}")
        items.append(
            {
                "no": cols[0],
                "lot": cols[1],
                "designation": cols[2],
                "reference": "-" if cols[3] in {"—", ""} else cols[3],
                "qty": cols[4],
                "unit_price": cols[5],
                "amount": cols[6],
            }
        )
    return items


def text_width(text: str, fontname: str, fontsize: float) -> float:
    return fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)


def split_long_token(token: str, max_width: float, fontname: str, fontsize: float) -> list[str]:
    chunks: list[str] = []
    current = ""
    for char in token:
        candidate = current + char
        if current and text_width(candidate, fontname, fontsize) > max_width:
            chunks.append(current)
            current = char
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [token]


def wrap_text(text: str, max_width: float, fontname: str, fontsize: float) -> list[str]:
    normalized = str(text or "").replace("\n", " ").strip()
    if not normalized:
        return [""]
    if text_width(normalized, fontname, fontsize) <= max_width:
        return [normalized]

    words = normalized.split()
    lines: list[str] = []
    current = ""

    for word in words:
        if text_width(word, fontname, fontsize) > max_width:
            if current:
                lines.append(current)
                current = ""
            lines.extend(split_long_token(word, max_width, fontname, fontsize))
            continue

        candidate = word if not current else f"{current} {word}"
        if text_width(candidate, fontname, fontsize) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines or [normalized]


def draw_textbox(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    *,
    fontsize: float,
    fontname: str,
    color: tuple[float, float, float],
    align: str = "left",
) -> None:
    align_map = {"left": 0, "center": 1, "right": 2}
    inset_rect = fitz.Rect(
        rect.x0 + CELL_PADDING_X,
        rect.y0 + CELL_PADDING_Y - 1,
        rect.x1 - CELL_PADDING_X,
        rect.y1 - CELL_PADDING_Y + 1,
    )
    page.insert_textbox(
        inset_rect,
        text,
        fontsize=fontsize,
        fontname=fontname,
        color=color,
        align=align_map[align],
        lineheight=1.12,
    )


def draw_cell(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    *,
    fontname: str = BODY_FONT,
    fontsize: float = BODY_SIZE,
    fill: tuple[float, float, float] | None = None,
    align: str = "left",
    color: tuple[float, float, float] = COLOR_TEXT,
) -> None:
    page.draw_rect(rect, color=COLOR_GRID, fill=fill, width=0.7)
    draw_textbox(page, rect, text, fontsize=fontsize, fontname=fontname, color=color, align=align)


def add_page(doc: fitz.Document, items: list[dict[str, str]]) -> tuple[fitz.Page, float]:
    page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)

    header_rect = fitz.Rect(MARGIN_X, TOP_MARGIN, PAGE_WIDTH - MARGIN_X, 118)
    page.draw_rect(header_rect, fill=COLOR_NAVY, color=COLOR_NAVY)

    page.insert_text(
        (MARGIN_X + 18, TOP_MARGIN + 28),
        "FACTURE PRO FORMA",
        fontname=BODY_FONT_BOLD,
        fontsize=TITLE_SIZE,
        color=(1, 1, 1),
    )
    page.insert_text(
        (MARGIN_X + 18, TOP_MARGIN + 50),
        "Fournitures informatiques et consommables",
        fontname=BODY_FONT,
        fontsize=11,
        color=(230 / 255, 238 / 255, 248 / 255),
    )

    lots = ", ".join(sorted({item["lot"] for item in items}, key=lambda value: (len(value), value)))
    meta_x = PAGE_WIDTH - 292
    meta_y = TOP_MARGIN + 22
    meta_lines = [
        f"Numero : {PROFORMA_NUMBER}",
        f"Date : {ISSUE_DATE}",
        "Devise : Dinar algerien (DA)",
        f"Lots : {lots}",
    ]
    for index, line in enumerate(meta_lines):
        page.insert_text(
            (meta_x, meta_y + index * 15),
            line,
            fontname=BODY_FONT,
            fontsize=META_SIZE,
            color=(1, 1, 1),
        )

    info_top = 128
    info_height = 52
    left_box = fitz.Rect(MARGIN_X, info_top, PAGE_WIDTH / 2 - 8, info_top + info_height)
    right_box = fitz.Rect(PAGE_WIDTH / 2 + 8, info_top, PAGE_WIDTH - MARGIN_X, info_top + info_height)

    for rect in (left_box, right_box):
        page.draw_rect(rect, color=COLOR_GRID, fill=COLOR_LIGHT, width=0.8)

    page.insert_text((left_box.x0 + 10, left_box.y0 + 16), "Fournisseur", fontname=BODY_FONT_BOLD, fontsize=9, color=COLOR_SLATE)
    page.insert_text((left_box.x0 + 10, left_box.y0 + 31), "A completer", fontname=BODY_FONT, fontsize=9, color=COLOR_TEXT)
    page.insert_text((left_box.x0 + 10, left_box.y0 + 44), "Adresse / contact a renseigner", fontname=BODY_FONT, fontsize=8, color=COLOR_MUTED)

    page.insert_text((right_box.x0 + 10, right_box.y0 + 16), "Client", fontname=BODY_FONT_BOLD, fontsize=9, color=COLOR_SLATE)
    page.insert_text((right_box.x0 + 10, right_box.y0 + 31), "A completer", fontname=BODY_FONT, fontsize=9, color=COLOR_TEXT)
    page.insert_text((right_box.x0 + 10, right_box.y0 + 44), "Coordonnees du destinataire a renseigner", fontname=BODY_FONT, fontsize=8, color=COLOR_MUTED)

    table_top = info_top + info_height + 14
    x = MARGIN_X
    for label, width, align in COLUMNS:
        rect = fitz.Rect(x, table_top, x + width, table_top + TABLE_HEADER_HEIGHT)
        draw_cell(
            page,
            rect,
            label,
            fontname=BODY_FONT_BOLD,
            fontsize=8,
            fill=COLOR_NAVY,
            align=align,
            color=(1, 1, 1),
        )
        x += width

    return page, table_top + TABLE_HEADER_HEIGHT


def build_row_cells(item: dict[str, str]) -> list[tuple[str, str]]:
    return [
        (item["no"], "center"),
        (item["lot"], "center"),
        (item["designation"], "left"),
        (item["reference"], "left"),
        (item["qty"], "right"),
        (item["unit_price"], "right"),
        (item["amount"], "right"),
    ]


def row_height(item: dict[str, str]) -> float:
    lines_per_cell: list[int] = []
    for (text, _), (_, width, _) in zip(build_row_cells(item), COLUMNS):
        max_width = width - (CELL_PADDING_X * 2)
        lines = wrap_text(text, max_width, BODY_FONT, BODY_SIZE)
        lines_per_cell.append(max(len(lines), 1))
    return max(18, max(lines_per_cell) * LINE_HEIGHT + CELL_PADDING_Y * 2)


def draw_item_row(page: fitz.Page, y: float, item: dict[str, str]) -> float:
    x = MARGIN_X
    height = row_height(item)
    for (text, align), (_, width, _) in zip(build_row_cells(item), COLUMNS):
        rect = fitz.Rect(x, y, x + width, y + height)
        wrapped = wrap_text(text, width - (CELL_PADDING_X * 2), BODY_FONT, BODY_SIZE)
        draw_cell(page, rect, "\n".join(wrapped), align=align)
        x += width
    return height


def draw_summary(page: fitz.Page, y: float, items: list[dict[str, str]]) -> None:
    note_rect = fitz.Rect(MARGIN_X, y, PAGE_WIDTH - 260, y + 52)
    total_rect = fitz.Rect(PAGE_WIDTH - 248, y, PAGE_WIDTH - MARGIN_X, y + 52)

    page.draw_rect(note_rect, color=COLOR_GRID, fill=COLOR_LIGHT, width=0.8)
    page.draw_rect(total_rect, color=COLOR_GRID, fill=(231 / 255, 242 / 255, 255 / 255), width=0.8)

    note = (
        "Observation : les prix unitaires et montants n'ont pas ete fournis dans la liste source. "
        "Le document a donc ete prepare comme modele de facture pro forma avec valeurs financieres a 0,00 DA."
    )
    draw_textbox(page, note_rect, "\n".join(wrap_text(note, note_rect.width - 12, BODY_FONT, 8)), fontsize=8, fontname=BODY_FONT, color=COLOR_TEXT)

    page.insert_text((total_rect.x0 + 10, total_rect.y0 + 18), "Nombre de lignes : 97", fontname=BODY_FONT, fontsize=9, color=COLOR_TEXT)
    page.insert_text((total_rect.x0 + 10, total_rect.y0 + 35), "Total general : 0,00 DA", fontname=BODY_FONT_BOLD, fontsize=11, color=COLOR_NAVY)

    footer_text = "Document etabli le 29/03/2026 a partir de la liste d'articles fournie."
    page.insert_text((MARGIN_X, PAGE_HEIGHT - 10), footer_text, fontname=BODY_FONT, fontsize=SMALL_SIZE, color=COLOR_MUTED)


def add_page_numbers(doc: fitz.Document) -> None:
    total = doc.page_count
    for index in range(total):
        page = doc[index]
        label = f"Page {index + 1}/{total}"
        width = text_width(label, BODY_FONT, SMALL_SIZE)
        page.insert_text(
            (PAGE_WIDTH - MARGIN_X - width, PAGE_HEIGHT - 10),
            label,
            fontname=BODY_FONT,
            fontsize=SMALL_SIZE,
            color=COLOR_MUTED,
        )


def generate_pdf(output_path: Path) -> Path:
    items = parse_items(RAW_ITEMS)
    doc = fitz.open()
    page, current_y = add_page(doc, items)

    max_y = PAGE_HEIGHT - BOTTOM_MARGIN - 68
    for item in items:
        needed = row_height(item)
        if current_y + needed > max_y:
            page, current_y = add_page(doc, items)
        current_y += draw_item_row(page, current_y, item)

    if current_y + 56 > PAGE_HEIGHT - BOTTOM_MARGIN:
        page, current_y = add_page(doc, items)

    draw_summary(page, current_y + 12, items)
    add_page_numbers(doc)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)
    doc.close()
    return output_path


def main() -> None:
    target = Path(os.environ.get("PROFORMA_OUTPUT", OUTPUT_FILE))
    saved = generate_pdf(target)
    with fitz.open(saved) as doc:
        print(f"PDF created: {saved}")
        print(f"Pages: {doc.page_count}")
        print(f"Size bytes: {saved.stat().st_size}")


if __name__ == "__main__":
    main()
