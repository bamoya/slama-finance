from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


DOCX = Path(__file__).resolve().parent / "Slama_Finance_Project_Proposal.docx"
GOLD = "B98518"
DARK = "17191D"
LIGHT = "F4F5F7"
PALE = "F8F4E8"
BORDER = "D9D9D9"
MUTED = "667085"


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=95, start=100, bottom=95, end=100):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_borders(table):
    tbl_pr = table._tbl.tblPr
    current = tbl_pr.find(qn("w:tblBorders"))
    if current is not None:
        tbl_pr.remove(current)
    root = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        node = OxmlElement(f"w:{edge}")
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), "5")
        node.set(qn("w:color"), BORDER)
        root.append(node)
    tbl_pr.append(root)


def prevent_row_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


doc = Document(DOCX)

deployment_heading = next(
    paragraph
    for paragraph in doc.paragraphs
    if paragraph.text.strip().startswith("11  Project price and deployment options")
)
description = next(
    paragraph
    for paragraph in doc.paragraphs
    if paragraph.text.strip().startswith("The selected price covers the application scope")
)
description.text = (
    "The three deployment options deliver the same business functionality. They differ mainly "
    "in operational complexity, built-in security, resource limits, and who is responsible for "
    "maintaining the hosting environment."
)

old_table = next(
    table for table in doc.tables if table.cell(0, 0).text.strip() == "Deployment option"
)

comparison = doc.add_table(rows=1, cols=4)
comparison.alignment = WD_TABLE_ALIGNMENT.CENTER
comparison.autofit = False
set_borders(comparison)
widths = (Cm(3.0), Cm(4.55), Cm(4.55), Cm(4.55))
headers = ("Comparison", "OCI Always Free", "Hostinger VPS KVM 2", "Hostinger managed Node.js")
for index, (cell, label) in enumerate(zip(comparison.rows[0].cells, headers)):
    cell.text = label
    cell.width = widths[index]
    set_cell_margins(cell, 120, 110, 120, 110)
    shade(cell, DARK)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in cell.paragraphs[0].runs:
        run.font.name = "Aptos"
        run.font.size = Pt(8.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
repeat_header(comparison.rows[0])

rows = (
    (
        "Complexity",
        "High. Cloud resources, operating system, database, storage, monitoring and backups must be configured and maintained.",
        "Medium to high. The server is ready, but the operating system, database, application, updates and monitoring remain self-managed.",
        "Low. Deployment, runtime, SSL, CDN, WAF, backups and most infrastructure operations are managed by Hostinger.",
    ),
    (
        "Security",
        "Strong cloud controls are available, but secure configuration, patching, firewall rules, credentials and recovery procedures are our responsibility.",
        "Hostinger protects the infrastructure and provides firewall tools and DDoS protection; server hardening, patches and application security remain our responsibility.",
        "Most built-in protection: managed SSL, CDN, WAF and DDoS protection. We remain responsible for application access, passwords, permissions and data handling.",
    ),
    (
        "Operational responsibility",
        "Highest client and technical-team responsibility. Requires regular administration and verification that resources remain Free Tier eligible.",
        "Shared responsibility. Hostinger maintains the physical platform; the technical team maintains the virtual server and application stack.",
        "Lowest operational responsibility. Hostinger maintains the hosting platform; the technical team focuses mainly on the application and its data.",
    ),
    (
        "CPU and memory",
        "Up to 2 OCPUs and 12 GB memory in total across eligible Ampere A1 Always Free instances. ARM architecture compatibility must be maintained.",
        "2 vCPU and 8 GB RAM on the proposed KVM 2 plan.",
        "2 vCPU and 3 GB RAM on the managed Web Application plan.",
    ),
    (
        "Storage",
        "200 GB total boot and block storage, plus 20 GB Always Free object or archive storage. The block allocation also includes boot disks.",
        "100 GB NVMe storage. Application files, database and local backups share this capacity.",
        "50 GB NVMe storage. Managed MySQL is included, but the platform has less storage and fewer low-level configuration options.",
    ),
    (
        "Network limits",
        "Subject to OCI Always Free networking and service quotas. Usage beyond eligible allowances may require a paid account or resources.",
        "8 TB bandwidth per month and a 1 Gb/s network connection on KVM 2.",
        "Unlimited bandwidth under Hostinger fair-use conditions; no root-level network control.",
    ),
    (
        "Backups",
        "Up to five eligible block-volume backups are included. Database exports, backup schedules and off-site recovery still require configuration and testing.",
        "Weekly backups and snapshots are included. Additional database and off-site backup procedures remain recommended.",
        "Daily and on-demand backups are included and managed through the hosting platform.",
    ),
    (
        "Main restrictions",
        "Free capacity can depend on home-region availability and eligibility. Fixed quotas, ARM compatibility and more complex administration. Exceeding the free allowance can introduce charges.",
        "Full control but also full server-level responsibility. Resources are capped by the selected plan; scaling requires upgrading the VPS.",
        "No root access, less infrastructure control, 3 GB RAM and 50 GB storage. The current architecture requires adaptation to the managed platform and supported database services.",
    ),
    (
        "Indicative annual hosting",
        "0 DH per year while all resources remain Always Free eligible. Domain, email, optional off-site backups and any overage remain separate.",
        "About 996 DH per year at the current promotional equivalent, then about 1,500 DH per year at renewal. The offer is currently prepaid for 24 months.",
        "About 312 DH per year at the current promotional equivalent, then about 816 DH per year at renewal. The offer is currently prepaid for 48 months.",
    ),
    (
        "Initial project package",
        "5,000 DH",
        "Approximately 6,000 DH",
        "7,000 DH because managed hosting requires additional architecture adjustments",
    ),
    (
        "Best fit",
        "Best initial cost when a technical administrator can manage the cloud environment and accept Free Tier constraints.",
        "Best balance of control, predictable resources and future flexibility when server administration is available.",
        "Best operational simplicity and built-in protection when lower infrastructure responsibility is more important than full control.",
    ),
)

for row_index, values in enumerate(rows):
    cells = comparison.add_row().cells
    prevent_row_split(comparison.rows[-1])
    for column, (cell, value) in enumerate(zip(cells, values)):
        cell.text = value
        cell.width = widths[column]
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if row_index % 2:
            shade(cell, LIGHT)
        if column == 0:
            shade(cell, PALE)
            cell.paragraphs[0].runs[0].bold = True
        if row_index == 9 and column > 0:
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            cell.paragraphs[0].runs[0].bold = True
            cell.paragraphs[0].runs[0].font.color.rgb = RGBColor.from_string(GOLD)
        for paragraph in cell.paragraphs:
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.0
            for run in paragraph.runs:
                run.font.name = "Aptos"
                run.font.size = Pt(8.1)

# Move the new table into the exact location of the original pricing table.
old_table._element.addprevious(comparison._element)
old_table._element.getparent().remove(old_table._element)

note = doc.add_paragraph()
note.add_run("Recommendation. ").bold = True
note.add_run(
    "For this small deployment, OCI has the lowest hosting cost but the highest maintenance "
    "responsibility. Hostinger VPS provides the strongest long-term flexibility. Managed "
    "Node.js is the simplest to operate and includes the most built-in hosting protection."
)
note.paragraph_format.space_before = Pt(7)
note.paragraph_format.space_after = Pt(4)
comparison._element.addnext(note._p)

source = doc.add_paragraph(
    "Provider limits and prices checked on 23 September 2026. Promotional prices require the "
    "provider’s stated multi-year prepayment and may change. Sources: Oracle Cloud Free Tier "
    "documentation and Hostinger Morocco Node.js and VPS plan pages."
)
source.paragraph_format.space_after = Pt(8)
for run in source.runs:
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor.from_string(MUTED)
note._p.addnext(source._p)

doc.save(DOCX)
print(DOCX)
