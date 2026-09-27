"""
Phase 24: invoice + credit-note PDF generation, ReportLab-based (lightweight,
no native deps). Two layout choices per document are supported (compact and
detailed) so brandable invoices can be produced for ISP tenants.
"""
from __future__ import annotations

import io
from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, Optional, Union

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)


# Colors / styles reused across documents
_BRAND_DARK = colors.HexColor('#1f2933')
_BRAND_ACCENT = colors.HexColor('#2563eb')
_BRAND_MUTED = colors.HexColor('#6b7280')
_BRAND_LIGHT = colors.HexColor('#f3f4f6')


def _styles():
    base = getSampleStyleSheet()
    small = ParagraphStyle('sflabel', parent=base['Normal'],
                          fontName='Helvetica', fontSize=8, textColor=_BRAND_MUTED,
                          leading=10, spaceAfter=2)
    body = ParagraphStyle('sfbody', parent=base['Normal'],
                          fontName='Helvetica', fontSize=9, textColor=_BRAND_DARK,
                          leading=12)
    money = ParagraphStyle('sfmoney', parent=body, alignment=2, fontName='Helvetica-Bold')
    title = ParagraphStyle('sftitle', parent=base['Heading1'],
                           fontName='Helvetica-Bold', fontSize=18, textColor=_BRAND_DARK,
                           leading=22)
    body_left = ParagraphStyle('sfbodyleft', parent=body, alignment=0)
    base.add(small)
    base.add(body)
    base.add(money)
    base.add(title)
    base.add(body_left)
    return base


def _money_cell(value) -> str:
    """Format a Decimal-ish value as '৳123,456.78' right-aligned."""
    return f'৳{Decimal(str(value or 0)):,.2f}'


def _header_block(doc_kind: str, doc_no: str, issued_at, brand: Optional[dict] = None):
    """Returns the title row (brand left, doc info right)."""
    brand = brand or {}
    company = brand.get('company_name') or 'Sheba ISP Billing'
    tagline = brand.get('tagline') or 'Ultra Fast Optical Fiber Broadband'
    styles = _styles()
    left = [
        Paragraph(f'<b>{company}</b>', styles['sfbodyleft']),
        Paragraph(tagline, styles['sflabel']),
        Paragraph(brand.get('address', ''), styles['sflabel']),
    ]
    issued_str = issued_at.strftime('%d %b %Y') if hasattr(issued_at, 'strftime') else str(issued_at)
    right = [
        Paragraph(f'<b>{doc_kind}</b>', styles['sftitle']),
        Paragraph(f'No. <b>{doc_no}</b>', styles['sfbodyleft']),
        Paragraph(
            f'Issued: <b>{issued_str}</b>',
            styles['sfbodyleft']
        ),
    ]
    tbl = Table(
        [[left, right]], colWidths=[10 * cm, 7 * cm],
        hAlign='LEFT', vAlign='TOP',
    )
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return tbl


def _invoice_lines_table(invoice, *, discount_lines: Iterable[str] = (),
                         tax_lines: Iterable[str] = ()):
    styles = _styles()
    headers = [['#', 'Description', 'Qty', 'Unit Price', 'Disc', 'Tax', 'Total']]
    rows = []

    # 1. package line
    rows.append([
        '1', Paragraph(invoice.package_name or 'Subscription', styles['sfbody']),
        '1.000', _money_cell(invoice.package_amount), '0.00', '0.00',
        _money_cell(invoice.package_amount),
    ])

    # 2. previous-due carry
    if invoice.previous_due and Decimal(str(invoice.previous_due)) > 0:
        rows.append([
            '2', 'Previous unpaid balance', '1.000',
            _money_cell(invoice.previous_due), '0.00', '0.00',
            _money_cell(invoice.previous_due),
        ])

    # 3. InvoiceLine items (if any)
    line_items = list(getattr(invoice, 'lines', []).all()) if hasattr(invoice, 'lines') else []
    for idx, line in enumerate(line_items, start=3):
        rows.append([
            str(idx), Paragraph(line.description, styles['sfbody']),
            f'{Decimal(str(line.quantity)):,.3f}',
            _money_cell(line.unit_price),
            _money_cell(line.discount), _money_cell(line.tax_amount),
            _money_cell(line.total),
        ])

    tbl = Table([*headers, *rows], colWidths=[
        1 * cm, 6 * cm, 1.7 * cm, 2.4 * cm, 1.7 * cm, 1.7 * cm, 2.2 * cm,
    ], repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), _BRAND_ACCENT),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8.5),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('TEXTCOLOR', (0, 1), (-1, -1), _BRAND_DARK),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [_BRAND_LIGHT, colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#d1d5db')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    return tbl


def _summary_block(invoice) -> Table:
    """Build the right-side total summary."""
    data = [
        ['Package subtotal', _money_cell(invoice.package_amount)],
        ['Previous due', _money_cell(invoice.previous_due)],
        ['Discount', f'- {_money_cell(invoice.coupon_discount or Decimal(0))}'],
        ['Tax', _money_cell(invoice.tax_amount or Decimal(0))],
        ['Late fee', _money_cell(invoice.late_fee or Decimal(0))],
        ['Total payable', _money_cell(invoice.total_payable)],
        ['Paid', _money_cell(invoice.paid_amount or Decimal(0))],
        ['Balance due', _money_cell(invoice.due_amount or Decimal(0))],
    ]
    tbl = Table(data, colWidths=[5 * cm, 4.5 * cm])
    tbl.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TEXTCOLOR', (0, 0), (-1, -3), _BRAND_MUTED),
        ('FONTNAME', (0, -3), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, -3), (-1, -1), _BRAND_ACCENT),
        ('LINEABOVE', (0, -3), (-1, -3), 0.5, _BRAND_ACCENT),
        ('LINEBELOW', (0, -1), (-1, -1), 1, _BRAND_DARK),
        ('BACKGROUND', (0, -1), (-1, -1), _BRAND_LIGHT),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    return tbl


def render_invoice_pdf(invoice, *, brand: Optional[dict] = None) -> bytes:
    """Render ``invoice`` (a ``billing.Invoice``) to PDF bytes."""
    buf = io.BytesIO()
    styles = _styles()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f'Invoice {invoice.invoice_no}', author='ShebaFi',
    )
    story = []
    # header
    story.append(_header_block('INVOICE', invoice.invoice_no,
                              invoice.created_at or datetime.now(), brand=brand))
    story.append(Spacer(1, 6 * mm))

    # Bill-to + period block
    bill_to = [
        Paragraph('<b>Bill To</b>', styles['sflabel']),
        Paragraph(f'{invoice.customer.full_name if invoice.customer else ""}',
                  styles['sfbody']),
        Paragraph(
            f'PPPoE: <b>{invoice.customer.pppoe_username if invoice.customer else ""}</b>',
            styles['sfbody']
        ),
        Paragraph(invoice.customer.mobile if invoice.customer and invoice.customer.mobile else '',
                  styles['sfbody']),
    ]
    period_block = [
        Paragraph('<b>Billing Period</b>', styles['sflabel']),
        Paragraph(f'{invoice.billing_month}', styles['sfbody']),
        Paragraph(
            f'Due: <b>{invoice.due_date.isoformat() if invoice.due_date else "On receipt"}</b>',
            styles['sfbody']
        ),
        Paragraph(
            f'Status: <b>{(invoice.status or "").upper()}</b>', styles['sfbody']
        ),
    ]
    row_tbl = Table([[bill_to, period_block]], colWidths=[10 * cm, 7 * cm])
    row_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    story.append(row_tbl)
    story.append(Spacer(1, 4 * mm))

    # line items
    story.append(_invoice_lines_table(invoice))
    story.append(Spacer(1, 6 * mm))

    # summary
    summary = _summary_block(invoice)
    summary_tbl = Table([['', summary]], colWidths=[10 * cm, 9.5 * cm])
    summary_tbl.setStyle(TableStyle([('ALIGN', (1, 0), (1, -1), 'RIGHT')]))
    story.append(summary_tbl)
    story.append(Spacer(1, 10 * mm))

    # footer
    story.append(Paragraph(
        '<font size=8 color="#6b7280">'
        'Thank you for your payment. For disputes please contact your ISP '
        'within 7 days with invoice number. Late fee may apply after due date.'
        '</font>', styles['sflabel'],
    ))

    doc.build(story)
    return buf.getvalue()


def render_credit_note_pdf(credit_note, *, brand: Optional[dict] = None) -> bytes:
    """Render a ``finance.CreditNote`` to a small PDF."""
    buf = io.BytesIO()
    styles = _styles()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f'CreditNote {credit_note.credit_note_no}', author='ShebaFi',
    )
    story = []
    story.append(_header_block(
        'CREDIT NOTE', credit_note.credit_note_no,
        credit_note.issued_at or datetime.now(), brand=brand,
    ))
    story.append(Spacer(1, 6 * mm))

    bill_to = [
        Paragraph('<b>Issued To</b>', styles['sflabel']),
        Paragraph(credit_note.customer.full_name if credit_note.customer else '',
                  styles['sfbody']),
        Paragraph(
            f'PPPoE: <b>{credit_note.customer.pppoe_username if credit_note.customer else ""}</b>',
            styles['sfbody']
        ),
    ]
    info_block = [
        Paragraph('<b>Reason</b>', styles['sflabel']),
        Paragraph(str(credit_note.reason), styles['sfbody']),
        Paragraph(
            f'Status: <b>{(credit_note.status or "").upper()}</b>', styles['sfbody']
        ),
    ]
    story.append(Table([[bill_to, info_block]], colWidths=[10 * cm, 7 * cm]))
    story.append(Spacer(1, 6 * mm))

    summary = Table([
        ['Credit amount', _money_cell(credit_note.amount)],
        ['Related invoice',
         credit_note.related_invoice.invoice_no if credit_note.related_invoice else '—'],
        ['Related recharge',
         f"৳{credit_note.related_recharge.amount}" if credit_note.related_recharge else '—'],
    ], colWidths=[5 * cm, 5 * cm])
    summary.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('BACKGROUND', (0, 0), (-1, 0), _BRAND_LIGHT),
        ('TEXTCOLOR', (0, 0), (-1, 0), _BRAND_DARK),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(summary)
    story.append(Spacer(1, 8 * mm))
    if credit_note.notes:
        story.append(Paragraph('<b>Notes</b>', styles['sflabel']))
        story.append(Paragraph(credit_note.notes, styles['sfbody']))
        story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        '<font size=8 color="#6b7280">'
        'This credit note is an official adjustment to the customer ledger. '
        'It is non-negotiable and cannot be transferred.'
        '</font>', styles['sflabel'],
    ))
    doc.build(story)
    return buf.getvalue()
