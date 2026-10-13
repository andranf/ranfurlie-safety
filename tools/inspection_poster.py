"""Builds the monthly inspection wall poster (A4 PDF) and its QR PNG.

    python3 tools/inspection_poster.py     -> docs/inspection/inspection-poster.pdf, docs/inspection/qr-compound.png
"""
import os
import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

PAGE = 'https://andranf.github.io/ranfurlie-safety/inspection.html?site=compound'
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'inspection')
GREEN, RED, INK, MUTED, SAND = HexColor('#1F4D3A'), HexColor('#B8382B'), HexColor('#1B1F1D'), HexColor('#5D6763'), HexColor('#F4F1E8')


def qr_png(url, path):
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=20, border=2)
    q.add_data(url)
    q.make(fit=True)
    q.make_image(fill_color='#000000', back_color='#FFFFFF').save(path)
    return path


def wrap(c, text, font, size, width):
    lines, cur = [], ''
    for word in text.split():
        t = (cur + ' ' + word).strip()
        if c.stringWidth(t, font, size) > width:
            lines.append(cur); cur = word
        else:
            cur = t
    lines.append(cur)
    return lines


def main():
    os.makedirs(OUT, exist_ok=True)
    png = qr_png(PAGE, os.path.join(OUT, 'qr-compound.png'))

    W, H = A4
    c = canvas.Canvas(os.path.join(OUT, 'inspection-poster.pdf'), pagesize=A4)
    c.setTitle('Monthly H&S inspection - wall poster')
    c.setFillColor(SAND)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    c.setFillColor(GREEN)
    c.rect(0, H - 42 * mm, W, 42 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 34)
    c.drawString(16 * mm, H - 23 * mm, 'MONTHLY H&S INSPECTION')
    c.setFont('Helvetica', 15)
    c.drawString(16 * mm, H - 33 * mm, 'Maintenance compound  ·  Scan to start, walk it, sign it off')

    # QR block
    bw = 100 * mm
    bx = (W - bw) / 2
    bh = bw + 28 * mm
    by = H - 52 * mm - bh
    c.setFillColor(GREEN)
    c.roundRect(bx, by, bw, bh, 6 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 26)
    c.drawCentredString(W / 2, by + bh - 15 * mm, 'SCAN TO START')
    c.setFont('Helvetica', 12.5)
    c.drawCentredString(W / 2, by + bh - 22.5 * mm, 'Phone camera  ·  no login, pick your name')
    qs = bw - 24 * mm
    c.roundRect(bx + 12 * mm, by + 10 * mm, qs, qs, 3 * mm, stroke=0, fill=1)
    c.drawImage(ImageReader(png), bx + 14 * mm, by + 12 * mm, qs - 4 * mm, qs - 4 * mm)

    steps = [
        ('1', 'Walk every area and answer every line', 'Yes, No or N/A. Equipment cards (AEDs, first aid kits, extinguishers) have an All OK button. Read expiry and service dates off the tags.'),
        ('2', 'No = say what’s wrong and take a photo', 'It goes straight into the defect register. Fixed it on the spot? Tick it and say what you did.'),
        ('3', 'N/A needs a reason', 'Only use it when the item genuinely isn’t there or isn’t due.'),
        ('!', 'Anything dangerous: make it safe first', 'Tag it OUT OF SERVICE or block it off, then tell your Supervisor. Sign off at the end with your finger.'),
    ]
    y = by - 12 * mm
    for n, head, body in steps:
        col = RED if n == '!' else GREEN
        c.setFillColor(col)
        c.circle(22 * mm, y + 1.5 * mm, 4.6 * mm, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 14)
        c.drawCentredString(22 * mm, y - 0.2 * mm, n)
        c.setFillColor(col if n == '!' else INK)
        c.setFont('Helvetica-Bold', 14)
        c.drawString(31 * mm, y + 1 * mm, head)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 11)
        lines = wrap(c, body, 'Helvetica', 11, W - 31 * mm - 16 * mm)
        for k, ln in enumerate(lines):
            c.drawString(31 * mm, y - 5 * mm - k * 4.8 * mm, ln)
        y -= (11 + 4.8 * len(lines)) * mm

    c.setFillColor(MUTED)
    c.setFont('Helvetica', 9)
    c.drawCentredString(W / 2, 9 * mm, 'Ranfurlie Golf Club  ·  Course Maintenance  ·  ' + PAGE.replace('https://', ''))
    c.showPage()
    c.save()
    print('written to', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
