"""Builds the shed key wall poster (A4 PDF) and QR PNGs.

    python3 tools/key_poster.py            -> docs/keys/key-poster.pdf, docs/keys/qr-out.png, docs/keys/qr-in.png
"""
import os
import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

BASE = 'https://andranf.github.io/ranfurlie-safety/keys.html'
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'keys')
GREEN, RED, INK, MUTED, SAND = HexColor('#1F4D3A'), HexColor('#B8382B'), HexColor('#1B1F1D'), HexColor('#5D6763'), HexColor('#F4F1E8')


def qr_png(url, path):
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=20, border=2)
    q.add_data(url)
    q.make(fit=True)
    q.make_image(fill_color='#000000', back_color='#FFFFFF').save(path)
    return path


def block(c, x, y, w, h, title, sub, png, colour):
    c.setFillColor(colour)
    c.roundRect(x, y, w, h, 6 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 34)
    c.drawCentredString(x + w / 2, y + h - 17 * mm, title)
    c.setFont('Helvetica', 13)
    c.drawCentredString(x + w / 2, y + h - 25 * mm, sub)
    qs = w - 16 * mm
    c.setFillColor(white)
    c.roundRect(x + 8 * mm, y + 10 * mm, qs, qs, 3 * mm, stroke=0, fill=1)
    c.drawImage(ImageReader(png), x + 10 * mm, y + 12 * mm, qs - 4 * mm, qs - 4 * mm)


def main():
    os.makedirs(OUT, exist_ok=True)
    out_png = qr_png(BASE + '?out', os.path.join(OUT, 'qr-out.png'))
    in_png = qr_png(BASE + '?in', os.path.join(OUT, 'qr-in.png'))

    W, H = A4
    c = canvas.Canvas(os.path.join(OUT, 'key-poster.pdf'), pagesize=A4)
    c.setTitle('Shed Keys - wall poster')
    c.setFillColor(SAND)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # header
    c.setFillColor(GREEN)
    c.rect(0, H - 42 * mm, W, 42 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 40)
    c.drawString(16 * mm, H - 24 * mm, 'SHED KEYS')
    c.setFont('Helvetica', 15)
    c.drawString(16 * mm, H - 34 * mm, 'Weekend spare keys  ·  Scan every time a key comes or goes')

    # QR blocks
    gap = 8 * mm
    bw = (W - 32 * mm - gap) / 2
    bh = bw + 36 * mm
    by = H - 50 * mm - bh
    block(c, 16 * mm, by, bw, bh, 'KEY OUT', 'Taking a key: scan, pick, agree & sign', out_png, GREEN)
    block(c, 16 * mm + bw + gap, by, bw, bh, 'KEY BACK', 'Returning a key: scan when it is back', in_png, HexColor('#2B4C6F'))

    # rules
    rules = [
        ('1', 'Read and sign OHS-34 Handle Keys first', 'The page sends you to it if you have not signed it yet.'),
        ('2', 'Back by 10am Tuesday', 'Return it straight after your last shift. Keys not scanned back in are called out on Slack.'),
        ('3', 'Keep it on you. Lock the shed every time you leave.', 'Never leave it in a vehicle, machine, locker or toolbox. Never lend or copy it.'),
        ('!', 'Lost or missing key? Report it straight away', 'Scan KEY BACK > "Lost or missing key?" and tell your Supervisor. A lost key may result in disciplinary action.'),
    ]
    y = by - 14 * mm
    for n, head, body in rules:
        col = RED if n == '!' else GREEN
        c.setFillColor(col)
        c.circle(22 * mm, y + 1.5 * mm, 4.6 * mm, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 14)
        c.drawCentredString(22 * mm, y - 0.2 * mm, n)
        c.setFillColor(col if n == '!' else INK)
        c.setFont('Helvetica-Bold', 14.5)
        c.drawString(31 * mm, y + 1 * mm, head)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 11.5)
        lines, cur = [], ''
        for word in body.split():
            t = (cur + ' ' + word).strip()
            if c.stringWidth(t, 'Helvetica', 11.5) > W - 31 * mm - 16 * mm:
                lines.append(cur); cur = word
            else:
                cur = t
        lines.append(cur)
        for k, ln in enumerate(lines):
            c.drawString(31 * mm, y - 5 * mm - k * 5 * mm, ln)
        y -= (13 + 5 * len(lines)) * mm

    c.setFillColor(MUTED)
    c.setFont('Helvetica', 9)
    c.drawCentredString(W / 2, 9 * mm, 'Ranfurlie Golf Club  ·  Course Maintenance  ·  ' + BASE.replace('https://', ''))
    c.showPage()
    c.save()
    print('written to', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
