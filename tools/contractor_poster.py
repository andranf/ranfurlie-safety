"""Builds the contractor sign-in wall posters (A4 PDF) and QR PNGs, one per site.

    python3 tools/contractor_poster.py
      -> docs/contractors/contractor-poster-course.pdf     (maintenance shed / compound gate)
      -> docs/contractors/contractor-poster-clubhouse.pdf  (Ranfurlie reception and the range)
      -> docs/contractors/contractor-poster-amstel.pdf     (Amstel reception)
      + qr-<site>.png for each
"""
import os
import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

BASE = 'https://andranf.github.io/ranfurlie-safety/contractors.html?site='
SITES = [
    ('course', 'Ranfurlie  ·  Course & maintenance compound', 'Ranfurlie Golf Club, 825 Cranbourne-Frankston Rd, Cranbourne',
     'Assembly point B: south of the maintenance shed, near the dam'),
    ('clubhouse', 'Ranfurlie  ·  Clubhouse & driving range', 'Ranfurlie Golf Club, 825 Cranbourne-Frankston Rd, Cranbourne',
     'Assembly point: your host will show you on arrival'),
    ('amstel', 'The Amstel Club', 'The Amstel Club, 1000 Cranbourne-Frankston Rd, Cranbourne',
     'Assembly area: your host will show you on arrival'),
]
OUT = os.path.join(os.path.dirname(__file__), '..', 'docs', 'contractors')
GREEN, RED, INK, MUTED, SAND, GOLD = HexColor('#1F4D3A'), HexColor('#8E2A20'), HexColor('#1B1F1D'), HexColor('#5D6763'), HexColor('#F4F1E8'), HexColor('#F2B705')


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
            lines.append(cur)
            cur = word
        else:
            cur = t
    lines.append(cur)
    return lines


def poster(site, area, address, assembly):
    png = qr_png(BASE + site, os.path.join(OUT, 'qr-' + site + '.png'))
    W, H = A4
    c = canvas.Canvas(os.path.join(OUT, 'contractor-poster-' + site + '.pdf'), pagesize=A4)
    c.setTitle('Contractor sign-in - ' + area)
    c.setFillColor(SAND)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    # header
    c.setFillColor(GREEN)
    c.rect(0, H - 46 * mm, W, 46 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.rect(0, H - 46 * mm, W, 3 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 32)
    c.drawString(16 * mm, H - 22 * mm, 'CONTRACTORS & VISITORS')
    c.setFont('Helvetica-Bold', 17)
    c.drawString(16 * mm, H - 32 * mm, 'Sign in when you arrive. Sign out when you leave.')
    c.setFont('Helvetica', 12)
    c.drawString(16 * mm, H - 39.5 * mm, area)

    # QR block
    bw = 104 * mm
    bx = (W - bw) / 2
    bh = bw + 26 * mm
    by = H - 56 * mm - bh
    c.setFillColor(GREEN)
    c.roundRect(bx, by, bw, bh, 6 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 22)
    c.drawCentredString(W / 2, by + bh - 14 * mm, 'SCAN TO SIGN IN / OUT')
    c.setFont('Helvetica', 12)
    c.drawCentredString(W / 2, by + bh - 21 * mm, 'Phone camera  ·  no app or login')
    qs = bw - 24 * mm
    c.roundRect(bx + 12 * mm, by + 9 * mm, qs, qs, 3 * mm, stroke=0, fill=1)
    c.drawImage(ImageReader(png), bx + 14 * mm, by + 11 * mm, qs - 4 * mm, qs - 4 * mm)

    steps = [
        ('1', 'Doing work on site? Induction first', 'Once a year, about 10 minutes on your phone. Have your public liability certificate, licences and SWMS ready.'),
        ('2', 'Every visit: sign in and report to your host', 'Deliveries and quick visits sign in too. High-risk work needs your SWMS given to your host before you start.'),
        ('3', 'Leaving? Scan again and sign out', 'In an emergency the sign-in list is the roll call. If you leave without signing out, people may go looking for you.'),
    ]
    y = by - 12 * mm
    tw = W - 52 * mm
    for n, t, s in steps:
        c.setFillColor(GREEN)
        c.circle(22 * mm, y - 2.5 * mm, 5.5 * mm, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 15)
        c.drawCentredString(22 * mm, y - 4.3 * mm, n)
        c.setFillColor(INK)
        c.setFont('Helvetica-Bold', 14)
        c.drawString(32 * mm, y - 1 * mm, t)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 11)
        yy = y - 7 * mm
        for line in wrap(c, s, 'Helvetica', 11, tw):
            c.drawString(32 * mm, yy, line)
            yy -= 5 * mm
        y = yy - 5 * mm

    # emergency footer
    fh = 30 * mm
    c.setFillColor(RED)
    c.rect(0, 0, W, fh, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 20)
    c.drawString(16 * mm, fh - 11 * mm, 'EMERGENCY: CALL 000')
    c.setFont('Helvetica', 11.5)
    c.drawString(16 * mm, fh - 18 * mm, address)
    c.drawString(16 * mm, fh - 24 * mm, assembly + '  ·  then call your host')
    c.showPage()
    c.save()


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for s in SITES:
        poster(*s)
    print('Posters written to', os.path.abspath(OUT))
