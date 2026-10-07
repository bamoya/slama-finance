from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUTPUT = ROOT / "Slama_Finance_Project_Proposal.docx"

GOLD = "B98518"
DARK = "17191D"
INK = "20242B"
MUTED = "667085"
PALE = "F8F4E8"
LIGHT = "F4F5F7"
BORDER = "D9D9D9"


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def borders(table, color=BORDER, size="6"):
    tbl_pr = table._tbl.tblPr
    current = tbl_pr.find(qn("w:tblBorders"))
    if current is not None:
        tbl_pr.remove(current)
    root = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        node = OxmlElement(f"w:{edge}")
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), size)
        node.set(qn("w:color"), color)
        root.append(node)
    tbl_pr.append(root)


def cell_margins(cell, top=120, start=140, bottom=120, end=140):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
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


def keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


def add_heading(doc, text, level=1):
    paragraph = doc.add_paragraph(text, style=f"Heading {level}")
    keep_with_next(paragraph)
    return paragraph


def add_bullet(doc, text, bold_lead=None):
    paragraph = doc.add_paragraph(style="List Bullet")
    if bold_lead and text.startswith(bold_lead):
        paragraph.add_run(bold_lead).bold = True
        paragraph.add_run(text[len(bold_lead):])
    else:
        paragraph.add_run(text)
    return paragraph


def add_caption(doc, text):
    paragraph = doc.add_paragraph(text)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(4)
    paragraph.paragraph_format.space_after = Pt(8)
    for run in paragraph.runs:
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor.from_string(MUTED)


def add_picture_pair(doc, left_path, left_caption, right_path, right_caption):
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    borders(table, "FFFFFF", "0")
    for index, (path, caption) in enumerate(((left_path, left_caption), (right_path, right_caption))):
        cell = table.cell(0, index)
        cell.width = Inches(3.22)
        cell_margins(cell, 50, 60, 60, 60)
        picture_p = cell.paragraphs[0]
        picture_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        picture_p.paragraph_format.space_after = Pt(4)
        picture_p.add_run().add_picture(str(path), width=Inches(3.10))
        caption_p = cell.add_paragraph(caption)
        caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        caption_p.paragraph_format.space_after = Pt(0)
        for run in caption_p.runs:
            run.font.size = Pt(8.5)
            run.font.color.rgb = RGBColor.from_string(MUTED)


def set_repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


doc = Document()
section = doc.sections[0]
section.page_width = Cm(21)
section.page_height = Cm(29.7)
section.top_margin = Cm(1.7)
section.bottom_margin = Cm(1.5)
section.left_margin = Cm(1.8)
section.right_margin = Cm(1.8)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Aptos"
normal.font.size = Pt(10.5)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_after = Pt(7)
normal.paragraph_format.line_spacing = 1.08

for name, size, before, after in (("Title", 28, 0, 12), ("Heading 1", 19, 14, 7), ("Heading 2", 13, 10, 5)):
    style = styles[name]
    style.font.name = "Aptos Display"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor(0, 0, 0)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)

styles["List Bullet"].font.name = "Aptos"
styles["List Bullet"].font.size = Pt(10.5)
styles["List Bullet"].paragraph_format.left_indent = Cm(0.6)
styles["List Bullet"].paragraph_format.first_line_indent = Cm(-0.3)
styles["List Bullet"].paragraph_format.space_after = Pt(4)

# Header and footer
header = section.header
header_p = header.paragraphs[0]
header_p.text = "SLAMA FINANCE    PROJECT PROPOSAL"
header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
for run in header_p.runs:
    run.font.name = "Aptos"
    run.font.size = Pt(8)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string(MUTED)

footer = section.footer
footer_p = footer.paragraphs[0]
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
footer_p.add_run("Confidential client proposal   |   23 September 2026   |   ")
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer_p._p.append(field)
for run in footer_p.runs:
    run.font.name = "Aptos"
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor.from_string(MUTED)

# Page 1 Cover
logo = Path("ui/public/slama-logo.png")
if logo.exists():
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(30)
    p.add_run().add_picture(str(logo), width=Inches(0.95))

title = doc.add_paragraph("Slama Finance Project Proposal", style="Title")
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
subtitle = doc.add_paragraph("Finance document management system")
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
subtitle.paragraph_format.space_after = Pt(22)
for run in subtitle.runs:
    run.font.size = Pt(15)
    run.font.color.rgb = RGBColor.from_string(MUTED)

meta = doc.add_table(rows=4, cols=2)
meta.alignment = WD_TABLE_ALIGNMENT.CENTER
meta.autofit = False
meta.columns[0].width = Cm(4.2)
meta.columns[1].width = Cm(10.2)
borders(meta)
for row, values in enumerate((
    ("Prepared for", "CLIENT NAME"),
    ("Prepared by", "PROVIDER NAME"),
    ("Proposal reference", "SF 2026 001"),
    ("Issue date", "23 September 2026"),
)):
    for col, value in enumerate(values):
        cell = meta.cell(row, col)
        cell.text = value
        cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if col == 0:
            shade(cell, PALE)
            cell.paragraphs[0].runs[0].bold = True

doc.add_paragraph()
intro = doc.add_paragraph(
    "This proposal presents the scope, design direction, delivery schedule, pricing options, "
    "commercial terms, and post-launch support for the Slama Finance web application. The "
    "client may select one of the three deployment options on page 5."
)
intro.alignment = WD_ALIGN_PARAGRAPH.CENTER
intro.paragraph_format.left_indent = Cm(1.4)
intro.paragraph_format.right_indent = Cm(1.4)

decision = doc.add_paragraph("Decision requested")
decision.alignment = WD_ALIGN_PARAGRAPH.CENTER
decision.paragraph_format.space_before = Pt(18)
decision.runs[0].bold = True
decision.runs[0].font.size = Pt(12)
decision.runs[0].font.color.rgb = RGBColor.from_string(GOLD)
p = doc.add_paragraph("Confirm the functional scope, deployment option, project price, and payment schedule.")
p.alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_page_break()

# Page 2 Deliverables and dashboard
add_heading(doc, "1  Solution overview and deliverables")
doc.add_paragraph("The delivered solution is a responsive, private company dashboard for managing products, clients, commercial documents, collections, delivery notes, staff access, reporting and notifications.")

delivery_table = doc.add_table(rows=1, cols=2)
delivery_table.alignment = WD_TABLE_ALIGNMENT.CENTER
delivery_table.autofit = False
borders(delivery_table)
headers = delivery_table.rows[0].cells
headers[0].text = "Business area"
headers[1].text = "Included functionality"
for cell in headers:
    shade(cell, DARK)
    cell_margins(cell)
    for run in cell.paragraphs[0].runs:
        run.font.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
set_repeat_header(delivery_table.rows[0])
rows = [
    ("Catalog and clients", "Product, service and client lists with search, detail, creation, update and archive states."),
    ("Sales documents", "Estimates, invoices, optional VAT, searchable products, conversion and PDF generation."),
    ("Collections and delivery", "Installment payments, payment methods, outstanding balances and bons de livraison."),
    ("Administration", "Staff accounts, dynamic roles, permissions, document design and client notifications."),
    ("Reporting", "Financial summaries and configurable daily, weekly or monthly scheduled reports."),
    ("Deployment", "Production deployment using the selected hosting option, initial setup and handover."),
]
for index, values in enumerate(rows):
    cells = delivery_table.add_row().cells
    for col, value in enumerate(values):
        cells[col].text = value
        cell_margins(cells[col])
        cells[col].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    if index % 2:
        shade(cells[0], LIGHT)
        shade(cells[1], LIGHT)
    cells[0].paragraphs[0].runs[0].bold = True
doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.add_run().add_picture(str(ASSETS / "dashboard.png"), width=Inches(6.6))
add_caption(doc, "Main dashboard with collections, outstanding balances, overdue invoices and cash-flow visibility")


def add_walkthrough_page(number, title, description, left, left_caption, right, right_caption, bullets):
    doc.add_page_break()
    add_heading(doc, f"{number}  {title}")
    doc.add_paragraph(description)
    add_picture_pair(doc, ASSETS / left, left_caption, ASSETS / right, right_caption)
    for text in bullets:
        add_bullet(doc, text)


add_walkthrough_page(
    "2.1", "Product and service catalog", "The catalog centralizes reusable products and services so users can select consistent names and prices when creating documents.",
    "products-list.png", "Searchable product and service list", "product-detail.png", "Item detail with recent usage",
    ("Search and filter active or archived catalog items.", "Review price, unit, reference, VAT and recent document usage."))
add_walkthrough_page(
    "2.2", "Product creation and editing", "The same structured editor supports both new items and controlled updates to existing catalog records.",
    "product-create.png", "Create a product or service", "product-edit.png", "Edit an existing catalog item",
    ("Configure item type, name, reference, description, category, unit, price and status.", "VAT remains optional and defaults to no VAT for newly created items."))
add_walkthrough_page(
    "3.1", "Client management", "Client records combine identification, contact details, balances, document history and communication preferences.",
    "clients-list.png", "Client list with balances and notification state", "client-detail.png", "Client profile and related documents",
    ("Search clients and review outstanding balances at a glance.", "Open a client profile to review invoices, estimates and contact information."))
add_walkthrough_page(
    "3.2", "Client creation and editing", "The client form keeps legal, contact and communication information together.",
    "client-create.png", "Create a client", "client-edit.png", "Update client information",
    ("Store company name, contact person, ICE, city, email and telephone.", "Enable optional client notifications only when a valid email address exists."))
add_walkthrough_page(
    "4.1", "Invoice management", "Invoices can be searched and followed from draft through collection, with payment progress visible from the list.",
    "invoices-list.png", "Invoice list and payment progress", "invoice-detail.png", "Invoice detail and document settings",
    ("Track invoice status, total amount, amount paid and remaining balance.", "Preview the final document and review recorded installments from the invoice detail."))
add_walkthrough_page(
    "4.2", "Invoice creation and editing", "The invoice editor combines client selection, searchable catalog products, totals, terms and visual settings.",
    "invoice-create.png", "Create a new invoice", "invoice-edit.png", "Edit an existing invoice",
    ("Search products by name or reference and automatically fill the product name and price.", "VAT is not added unless the user explicitly selects a VAT rate for a line.", "Save drafts, preview documents and finalize invoices."))
add_walkthrough_page(
    "5.1", "Estimate management", "Estimates use the same familiar document workflow while supporting acceptance and conversion into an invoice.",
    "estimates-list.png", "Estimate list with acceptance status", "estimate-detail.png", "Estimate detail and conversion action",
    ("Search estimates and follow draft, sent and accepted states.", "Convert an accepted estimate into an invoice without re-entering its products."))
add_walkthrough_page(
    "5.2", "Estimate creation and editing", "Users can prepare and adjust offers before sending them to the client.",
    "estimate-create.png", "Create an estimate", "estimate-edit.png", "Edit an estimate",
    ("Use searchable products, quantities, prices and optional VAT.", "Configure validity dates, notes, language, currency and document appearance."))
add_walkthrough_page(
    "6.1", "Delivery note management", "Bons de livraison document delivered products and quantities without exposing prices.",
    "delivery-list.png", "Delivery-note list and statuses", "delivery-detail.png", "Delivery-note detail and PDF action",
    ("Track draft, prepared, delivered and acknowledged delivery notes.", "Link a delivery note to an invoice when required."))
add_walkthrough_page(
    "6.2", "Delivery note creation and editing", "Delivery notes record the operational handover and can include reception confirmation.",
    "delivery-create.png", "Create a delivery note", "delivery-edit.png", "Edit delivery information",
    ("Search products and enter delivered quantities and units.", "Add the address, instructions and optional signature or reception confirmation.", "Generate a printable PDF without product prices or invoice totals."))
add_walkthrough_page(
    "7", "Payment and installment tracking", "The payment ledger connects every receipt to an invoice and preserves the selected payment method and reference.",
    "payments-list.png", "Payment ledger", "payment-create.png", "Record a partial payment",
    ("Record full payments or multiple installments by cash, bank transfer or cheque.", "Store transaction references, cheque information, payment dates, notes and status.", "Calculate the remaining invoice balance immediately after each installment."))
add_walkthrough_page(
    "8.1", "Financial reporting", "Reports provide a concise view of revenue, collections, unpaid amounts, overdue invoices and client performance.",
    "reports-overview.png", "Financial report overview", "report-schedules.png", "Recurring report schedules",
    ("Review financial indicators and invoice health.", "Deliver reports automatically on a daily, weekly or monthly schedule."))
add_walkthrough_page(
    "8.2", "Scheduled report configuration", "Each schedule defines its timing, recipients, status and report contents.",
    "report-schedule-create.png", "Create a report schedule", "report-schedule-edit.png", "Edit a report schedule",
    ("Configure frequency, delivery day, delivery time and timezone.", "Choose recipients and include revenue, collections, overdue invoices or VAT summaries."))
add_walkthrough_page(
    "9.1", "Staff management", "Only administrators can create staff accounts; there is no public registration.",
    "staff-list.png", "Staff list, activity and status", "staff-create.png", "Create a staff account and assign roles",
    ("Create, activate, suspend and update staff members.", "Assign one or more roles when creating a staff account."))
add_walkthrough_page(
    "9.2", "Staff editing and access review", "Administrators can revise account status and assigned responsibilities as the team changes.",
    "staff-edit.png", "Edit staff details and roles", "roles-list.png", "Review roles and their permissions",
    ("Update staff identity, email, password, status and assigned roles.", "Keep sensitive actions limited to authorized staff."))
add_walkthrough_page(
    "9.3", "Dynamic RBAC configuration", "Roles are configurable so the administrator can define precisely what each team member may view or change.",
    "roles-list.png", "Existing roles and permission matrix", "role-create.png", "Create a custom role",
    ("Control permissions for products, clients, estimates, invoices, payments, delivery notes, reports, staff and settings.", "Create custom roles instead of relying only on fixed system profiles."))
add_walkthrough_page(
    "10.1", "Invoice and estimate appearance", "The document designer provides a live preview so the company can approve its printable identity before use.",
    "invoice-customization.png", "Template, logo, color and content controls", "invoice-detail.png", "Selected appearance applied to an invoice",
    ("Choose the template and accent color and upload the company logo.", "Configure bank information, payment terms, signature, stamp and footer text.", "Print product names rather than internal product descriptions."))
add_walkthrough_page(
    "10.2", "Client notification settings", "Email communication is optional and controlled through company defaults and client contact availability.",
    "notifications.png", "Notification rules and email-template settings", "clients-list.png", "Client notification state in the client list",
    ("Configure invoice, payment, overdue and estimate messages.", "Select sender identity, language and template content.", "Disable client notifications automatically when no valid email address is available."))

doc.add_page_break()

# Pricing and schedule
add_heading(doc, "11  Project price and deployment options")
doc.add_paragraph("The selected price covers the application scope described in this proposal and the initial deployment using the chosen hosting option.")

prices = doc.add_table(rows=1, cols=3)
prices.alignment = WD_TABLE_ALIGNMENT.CENTER
prices.autofit = False
borders(prices)
for cell, value in zip(prices.rows[0].cells, ("Deployment option", "Project price", "Commercial note")):
    cell.text = value
    shade(cell, DARK)
    cell_margins(cell)
    for run in cell.paragraphs[0].runs:
        run.font.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
set_repeat_header(prices.rows[0])
price_rows = [
    ("OCI Always Free eligible plan", "5,000 DH", "Lowest initial cost when the account and usage remain eligible for OCI free-tier limits."),
    ("Hostinger VPS", "Approximately 6,000 DH", "Includes the additional initial hosting cost for the VPS deployment option."),
    ("Hostinger managed Node.js", "7,000 DH", "Includes the hosting option and the architecture adjustments required for managed Node.js deployment."),
]
for index, values in enumerate(price_rows):
    cells = prices.add_row().cells
    for col, value in enumerate(values):
        cells[col].text = value
        cell_margins(cells[col], 150, 150, 150, 150)
        cells[col].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if col == 1:
            cells[col].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            cells[col].paragraphs[0].runs[0].bold = True
            cells[col].paragraphs[0].runs[0].font.color.rgb = RGBColor.from_string(GOLD)
    if index % 2:
        for cell in cells:
            shade(cell, LIGHT)

add_heading(doc, "Completion schedule", 2)
doc.add_paragraph("The estimated completion time is 6 to 8 weeks from project confirmation, receipt of the initial payment, and delivery of the required company information and branding materials. The schedule assumes timely client review and approval at each milestone.")

timeline = doc.add_table(rows=1, cols=2)
timeline.alignment = WD_TABLE_ALIGNMENT.CENTER
borders(timeline)
for cell, value in zip(timeline.rows[0].cells, ("Stage", "Expected period")):
    cell.text = value
    shade(cell, PALE)
    cell_margins(cell)
    cell.paragraphs[0].runs[0].bold = True
for stage, period in (("Scope and design confirmation", "Week 1"), ("Core application development", "Weeks 2 to 5"), ("Reports, documents and deployment", "Weeks 5 to 7"), ("Client acceptance and launch", "Week 8")):
    cells = timeline.add_row().cells
    cells[0].text, cells[1].text = stage, period
    for cell in cells:
        cell_margins(cell)

add_heading(doc, "Payment schedule", 2)
for text in (
    "30 percent when the proposal is accepted and the project starts.",
    "40 percent after delivery of the main products, clients, estimates, invoices and payment workflows.",
    "30 percent after final acceptance, production deployment and handover.",
):
    add_bullet(doc, text)

doc.add_page_break()

# Terms and acceptance
add_heading(doc, "12  Commercial terms")

add_heading(doc, "What is excluded", 2)
doc.add_paragraph("Unless added through a separate written estimate, this proposal excludes mobile applications, a public client portal, online payment gateways, full accounting or bookkeeping, inventory and warehouse management, bank synchronization, government-platform integrations, multi-company support, advanced data migration, and major integrations with third-party systems.")

add_heading(doc, "How additional requests are handled", 2)
doc.add_paragraph("Minor corrections needed to match the approved scope are included. New features, major workflow changes, additional integrations or material design changes are reviewed first and require a separate written estimate and schedule before work begins.")

add_heading(doc, "Who pays recurring infrastructure costs", 2)
doc.add_paragraph("The client owns and pays all hosting, domain, email and other third-party service renewals or usage charges after launch. OCI may remain free only while the account and usage are eligible for the provider’s free-tier limits. Any provider price change, paid upgrade or excess usage is paid directly by the client.")

add_heading(doc, "Support after launch", 2)
doc.add_paragraph("The proposal includes 30 days of corrective support after production launch. This covers defects where the delivered application does not behave according to the approved scope. Training questions, new functionality, provider incidents, content entry, ongoing monitoring and long-term maintenance are not included and may be covered by a separate support agreement.")

add_heading(doc, "Client confirmation", 2)
doc.add_paragraph("By signing below, the client confirms the selected deployment option, project scope, price, schedule, payment terms, exclusions and support conditions described in this proposal.")

choice = doc.add_table(rows=4, cols=2)
choice.alignment = WD_TABLE_ALIGNMENT.CENTER
borders(choice)
entries = (
    ("Selected option", "☐ OCI 5,000 DH    ☐ Hostinger VPS 6,000 DH    ☐ Managed Node.js 7,000 DH"),
    ("Client name and company", ""),
    ("Signature and date", ""),
    ("Provider signature and date", ""),
)
for row, values in enumerate(entries):
    for col, value in enumerate(values):
        cell = choice.cell(row, col)
        cell.text = value
        cell_margins(cell, 180, 140, 180, 140)
        if col == 0:
            shade(cell, PALE)
            if cell.paragraphs[0].runs:
                cell.paragraphs[0].runs[0].bold = True

doc.core_properties.title = "Slama Finance Project Proposal"
doc.core_properties.subject = "Client proposal for the Slama Finance web application"
doc.core_properties.author = "PROVIDER NAME"
doc.core_properties.keywords = "Slama Finance, proposal, estimate, invoice management"
doc.save(OUTPUT)
print(OUTPUT)
