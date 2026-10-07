from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor


DOCX = Path(__file__).resolve().parent / "Slama_Finance_Project_Proposal.docx"
GOLD = "B98518"
MUTED = "667085"


def remove_paragraph(paragraph):
    element = paragraph._element
    element.getparent().remove(element)
    paragraph._p = paragraph._element = None


def insert_after(paragraph, text, bold_lead=None, color=None):
    new_element = OxmlElement("w:p")
    paragraph._p.addnext(new_element)
    from docx.text.paragraph import Paragraph

    new_paragraph = Paragraph(new_element, paragraph._parent)
    if bold_lead and text.startswith(bold_lead):
        lead = new_paragraph.add_run(bold_lead)
        lead.bold = True
        if color:
            lead.font.color.rgb = RGBColor.from_string(color)
        new_paragraph.add_run(text[len(bold_lead) :])
    else:
        new_paragraph.add_run(text)
    new_paragraph.paragraph_format.space_after = Pt(5)
    return new_paragraph


doc = Document(DOCX)

replacements = {
    "This proposal presents the scope, design direction, delivery schedule, pricing options, commercial terms, and post-launch support for the Slama Finance web application. The client may select one of the three deployment options on page 5.":
        "This proposal presents the scope, design direction, delivery schedule, project price, commercial terms, and post-launch support for the Slama Finance web application.",
    "Confirm the functional scope, deployment option, project price, and payment schedule.":
        "Confirm the functional scope, project price, delivery schedule, and payment terms.",
    "11  Project price and deployment options":
        "11  Project price and OCI deployment",
    "The three deployment options deliver the same business functionality. They differ mainly in operational complexity, built-in security, resource limits, and who is responsible for maintaining the hosting environment.":
        "The project will be deployed on an OCI Always Free eligible environment. This deployment is included in the agreed project price and is suitable for the expected initial workload.",
    "By signing below, the client confirms the selected deployment option, project scope, price, schedule, payment terms, exclusions and support conditions described in this proposal.":
        "By signing below, the client confirms the OCI deployment, project scope, price, schedule, payment terms, exclusions and support conditions described in this proposal.",
}

for paragraph in doc.paragraphs:
    if paragraph.text in replacements:
        paragraph.text = replacements[paragraph.text]

description = next(
    paragraph
    for paragraph in doc.paragraphs
    if paragraph.text.startswith("The project will be deployed on an OCI Always Free")
)
annual = insert_after(
    description,
    "Annual hosting cost. 0 DH while the account and resources remain eligible for OCI Always Free limits. Domain, email services, optional paid backups, and any usage beyond the free allowance remain separate client costs.",
    "Annual hosting cost. ",
)
capacity = insert_after(
    description,
    "Included capacity. Up to 2 OCPUs and 12 GB memory across eligible Ampere instances, 200 GB of block storage, and 20 GB of object storage, subject to OCI eligibility and availability.",
    "Included capacity. ",
)
price = insert_after(
    description,
    "Project price. 5,000 DH including application delivery, initial OCI deployment, configuration, and handover.",
    "Project price. ",
    GOLD,
)

# Remove the deployment comparison table completely.
comparison = next(
    table
    for table in doc.tables
    if table.cell(0, 0).text.strip() == "Comparison"
)
comparison._element.getparent().remove(comparison._element)

# Remove comparison-only recommendation and source notes.
for paragraph in list(doc.paragraphs):
    if paragraph.text.startswith("Recommendation. For this small deployment") or paragraph.text.startswith(
        "Provider limits and prices checked"
    ):
        remove_paragraph(paragraph)

# Replace the hosting-choice row in the client confirmation table.
confirmation = next(
    table for table in doc.tables if table.cell(0, 0).text.strip() == "Selected option"
)
confirmation.cell(0, 0).text = "Approved project"
confirmation.cell(0, 1).text = "Slama Finance with OCI deployment — 5,000 DH"
confirmation.cell(0, 0).paragraphs[0].runs[0].bold = True

doc.save(DOCX)
print(DOCX)
