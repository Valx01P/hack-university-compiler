#!/usr/bin/env python3
"""Writes practice-yard's binary and generated files into base/.

Run at authoring time only (never in a workspace), from any folder:

    python3 generate.py

It needs Python 3.10+ and macOS's `sips` (to turn PNGs into JPEGs). Every
other file is written by this script with fixed data, so running it again
rewrites the same PNGs, PDFs, raw photos, archives and CSVs byte for byte.
JPEGs come from `sips` and can differ between macOS versions, which is fine:
they are committed, and nothing checks their bytes.
"""

from __future__ import annotations

import gzip
import io
import math
import random
import struct
import subprocess
import tarfile
import tempfile
import zipfile
import zlib
from pathlib import Path

BASE = Path(__file__).resolve().parent / "base"


# --- A tiny raster: an RGB canvas with the few shapes the scenes need ---------


class Canvas:
    def __init__(self, width: int, height: int, color=(0, 0, 0)):
        self.w, self.h = width, height
        self.px = bytearray(bytes(color) * (width * height))

    def put(self, x: int, y: int, color) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            self.px[i : i + 3] = bytes(color)

    def vgradient(self, top, bottom, y0: int = 0, y1: int | None = None) -> None:
        y1 = self.h if y1 is None else y1
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0 - 1)
            row = bytes(round(a + (b - a) * t) for a, b in zip(top, bottom)) * self.w
            self.px[y * self.w * 3 : (y + 1) * self.w * 3] = row

    def rect(self, x0: int, y0: int, x1: int, y1: int, color) -> None:
        x0, x1 = max(0, x0), min(self.w, x1)
        for y in range(max(0, y0), min(self.h, y1)):
            i = (y * self.w + x0) * 3
            self.px[i : i + (x1 - x0) * 3] = bytes(color) * (x1 - x0)

    def circle(self, cx: int, cy: int, r: int, color) -> None:
        for y in range(max(0, cy - r), min(self.h, cy + r + 1)):
            dx = int(math.sqrt(max(0, r * r - (y - cy) ** 2)))
            self.rect(cx - dx, y, cx + dx + 1, y + 1, color)

    def mountain(self, peak_x: int, peak_y: int, half_width: int, color) -> None:
        for y in range(max(0, peak_y), self.h):
            dx = int((y - peak_y) * half_width / max(1, self.h - peak_y))
            self.rect(peak_x - dx, y, peak_x + dx + 1, y + 1, color)

    def noise(self, rng: random.Random, amount: int) -> None:
        for i in range(0, len(self.px), 3):
            d = rng.randint(-amount, amount)
            for k in range(3):
                self.px[i + k] = min(255, max(0, self.px[i + k] + d))

    def png(self) -> bytes:
        raw = b"".join(
            b"\x00" + bytes(self.px[y * self.w * 3 : (y + 1) * self.w * 3]) for y in range(self.h)
        )

        def chunk(kind: bytes, data: bytes) -> bytes:
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

        header = struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

    def tiff(self, make: str, model: str) -> bytes:
        """A big-endian TIFF (the container Nikon's .NEF raw files use) with RGB strips."""
        pixels = bytes(self.px)
        strings = (make + "\0").encode(), (model + "\0").encode()
        entries = 11
        ifd_size = 2 + entries * 12 + 4
        extra = 8 + ifd_size  # bits per sample (3 shorts) goes right after the IFD
        make_at = extra + 6
        model_at = make_at + len(strings[0])
        data_at = model_at + len(strings[1])

        def entry(tag: int, kind: int, count: int, value: int) -> bytes:
            if kind == 3 and count == 1:
                return struct.pack(">HHIHH", tag, kind, count, value, 0)
            return struct.pack(">HHII", tag, kind, count, value)

        ifd = struct.pack(">H", entries) + b"".join(
            [
                entry(256, 3, 1, self.w),  # ImageWidth
                entry(257, 3, 1, self.h),  # ImageLength
                entry(258, 3, 3, extra),  # BitsPerSample 8,8,8
                entry(259, 3, 1, 1),  # Compression: none
                entry(262, 3, 1, 2),  # PhotometricInterpretation: RGB
                entry(271, 2, len(strings[0]), make_at),  # Make
                entry(272, 2, len(strings[1]), model_at),  # Model
                entry(273, 4, 1, data_at),  # StripOffsets
                entry(277, 3, 1, 3),  # SamplesPerPixel
                entry(278, 3, 1, self.h),  # RowsPerStrip
                entry(279, 4, 1, len(pixels)),  # StripByteCounts
            ]
        ) + struct.pack(">I", 0)
        return b"MM\x00\x2a" + struct.pack(">I", 8) + ifd + struct.pack(">HHH", 8, 8, 8) + strings[0] + strings[1] + pixels


# --- Scenes ----------------------------------------------------------------


def beach(w, h, rng, sun_x=0.75):
    c = Canvas(w, h)
    c.vgradient((120, 180, 235), (210, 230, 245), 0, h // 2)
    c.vgradient((30, 110, 160), (70, 160, 190), h // 2, h * 3 // 4)
    c.vgradient((235, 215, 170), (215, 190, 140), h * 3 // 4, h)
    c.circle(int(w * sun_x), h // 5, h // 10, (255, 236, 160))
    c.noise(rng, 6)
    return c


def mountains(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((90, 140, 200), (200, 220, 240), 0, h)
    c.mountain(w // 3, h // 4, w // 2, (90, 100, 120))
    c.mountain(w * 2 // 3, h // 3, w // 2, (60, 75, 95))
    c.mountain(w // 3, h // 4, w // 12, (240, 240, 245))
    c.rect(0, h * 5 // 6, w, h, (60, 110, 70))
    c.noise(rng, 5)
    return c


def sunset(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((60, 40, 110), (250, 150, 80), 0, h * 2 // 3)
    c.vgradient((40, 50, 90), (20, 25, 50), h * 2 // 3, h)
    c.circle(w // 2, h * 2 // 3, h // 7, (255, 200, 110))
    c.rect(0, h * 2 // 3, w, h, (35, 40, 75))
    c.noise(rng, 5)
    return c


def forest(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((170, 200, 220), (220, 230, 225), 0, h // 2)
    c.rect(0, h // 2, w, h, (50, 90, 50))
    for _ in range(18):
        x = rng.randint(0, w)
        c.mountain(x, rng.randint(h // 6, h // 2), w // 14, (rng.randint(20, 45), rng.randint(70, 110), rng.randint(30, 50)))
    c.noise(rng, 7)
    return c


def harbor(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((250, 190, 140), (250, 230, 200), 0, h // 2)
    c.vgradient((40, 90, 130), (20, 50, 80), h // 2, h)
    c.circle(w // 4, h // 2 - h // 12, h // 9, (255, 220, 150))
    for i in range(5):
        x = w // 6 + i * w // 6
        c.rect(x, h // 2 - h // 10, x + w // 40, h // 2, (60, 50, 50))
        c.rect(x - w // 30, h // 2 - h // 40, x + w // 15, h // 2 + h // 40, (200, 60, 50))
    c.noise(rng, 4)
    return c


def city(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((25, 30, 60), (70, 60, 110), 0, h)
    x = 0
    while x < w:
        bw = rng.randint(w // 16, w // 8)
        bh = rng.randint(h // 4, h * 3 // 4)
        c.rect(x, h - bh, x + bw - 2, h, (35, 35, 50))
        for wy in range(h - bh + 6, h - 6, 10):
            for wx in range(x + 4, x + bw - 6, 8):
                if rng.random() < 0.4:
                    c.rect(wx, wy, wx + 3, wy + 4, (250, 220, 120))
        x += bw
    return c


def meadow(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((130, 190, 240), (220, 235, 250), 0, h // 2)
    c.vgradient((110, 170, 70), (70, 130, 40), h // 2, h)
    for _ in range(140):
        c.circle(rng.randint(0, w), rng.randint(h // 2, h), 2, rng.choice([(250, 240, 90), (240, 120, 140), (255, 255, 255)]))
    c.noise(rng, 6)
    return c


def snow(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((180, 200, 220), (235, 240, 245), 0, h)
    c.mountain(w // 2, h // 5, w // 2, (230, 235, 240))
    c.rect(0, h * 3 // 4, w, h, (245, 248, 250))
    for _ in range(300):
        c.put(rng.randint(0, w - 1), rng.randint(0, h - 1), (255, 255, 255))
    c.noise(rng, 3)
    return c


def lake(w, h, rng):
    c = Canvas(w, h)
    c.vgradient((150, 190, 230), (230, 235, 240), 0, h // 2)
    c.vgradient((80, 120, 160), (150, 180, 210), h // 2, h)
    c.mountain(w // 2, h // 4, w // 2, (70, 100, 90))
    c.rect(0, h // 2, w, h // 2 + 3, (60, 90, 80))
    c.noise(rng, 4)
    return c


def portrait(w, h, rng, shirt):
    c = Canvas(w, h)
    c.vgradient((230, 225, 215), (200, 195, 185))
    c.circle(w // 2, h * 2 // 5, w // 6, (205, 160, 130))
    c.circle(w // 2, h + h // 8, w // 2, shirt)
    c.noise(rng, 4)
    return c


def screenshot(w, h):
    c = Canvas(w, h, (245, 246, 248))
    c.rect(0, 0, w, 36, (40, 44, 52))
    for i, color in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        c.circle(20 + i * 22, 18, 7, color)
    c.rect(0, 36, 200, h, (230, 232, 236))
    for y in range(60, h - 40, 34):
        c.rect(220, y, w - 40, y + 14, (205, 210, 218))
    c.rect(220, 60, 420, 74, (15, 107, 122))
    return c


def logo():
    c = Canvas(64, 64, (251, 250, 247))
    c.circle(32, 32, 30, (15, 107, 122))
    c.rect(16, 36, 48, 42, (251, 250, 247))
    c.mountain(32, 14, 16, (251, 250, 247))
    return c


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_jpeg(path: Path, canvas: Canvas, quality: int = 80) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.png"
        out = Path(tmp) / "out.jpg"
        src.write_bytes(canvas.png())
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality), str(src), "--out", str(out)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        path.write_bytes(out.read_bytes())


# --- PDFs --------------------------------------------------------------------


def pdf(pages: list[list[str]], image: Canvas | None = None, title: str = "") -> bytes:
    """A small PDF 1.4: text lines in Helvetica, and an optional photo on page 1."""
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    img = None
    if image is not None:
        data = bytes(image.px)
        img = add(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length %d >>\nstream\n"
            % (image.w, image.h, len(data))
            + data
            + b"\nendstream"
        )
    pages_id = len(objects) + 1 + 2 * len(pages)
    page_ids = []
    for n, lines in enumerate(pages):
        ops = ["BT /F1 11 Tf 56 780 Td 14 TL"]
        for line in lines:
            safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            ops.append(f"({safe}) Tj T*")
        ops.append("ET")
        if img is not None and n == 0:
            ops.append(f"q {image.w} 0 0 {image.h} 56 380 cm /Im1 Do Q")
        stream = "\n".join(ops).encode("latin-1")
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        resources = b"<< /Font << /F1 %d 0 R >>" % font
        if img is not None and n == 0:
            resources += b" /XObject << /Im1 %d 0 R >>" % img
        resources += b" >>"
        page_ids.append(
            add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources %s /Contents %d 0 R >>" % (pages_id, resources, content))
        )
    kids = b" ".join(b"%d 0 R" % p for p in page_ids)
    assert add(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))) == pages_id
    info = add(b"<< /Title (%s) /Producer (Harbor Street Studio) >>" % title.encode("latin-1"))
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog, info, xref))
    return out.getvalue()


def invoice(number: str, date: str, lines: list[tuple[str, float]]) -> bytes:
    total = sum(amount for _, amount in lines)
    text = [
        "Northwind Web Hosting",
        f"Invoice {number}",
        f"Date: {date}",
        "",
        "Bill to: Harbor Street Studio, 12 Harbor Street",
        "",
    ]
    text += [f"{item:<40} EUR {amount:8.2f}" for item, amount in lines]
    text += ["", f"{'Total':<40} EUR {total:8.2f}", "", "Paid by card. Thank you!"]
    return pdf([text], title=f"Invoice {number}")


# --- The files ----------------------------------------------------------------


def photos() -> None:
    rng = random.Random(2025)
    scenes = [
        ("IMG_0001.jpg", lambda: harbor(480, 360, rng)),
        ("IMG_0002.JPG", lambda: mountains(480, 360, rng)),
        ("IMG_0003.jpeg", lambda: forest(480, 360, rng)),
        ("IMG_0004.png", lambda: city(480, 360, rng)),
        ("IMG_0005.jpg", lambda: sunset(480, 360, rng)),
        ("IMG_0006.JPEG", lambda: meadow(480, 360, rng)),
        ("IMG_0007.jpg", lambda: lake(480, 360, rng)),
        ("IMG_0008.JPG", lambda: snow(480, 360, rng)),
        ("IMG_0009.png", lambda: city(480, 360, rng)),
        ("IMG_0010.jpeg", lambda: harbor(480, 360, rng)),
        ("IMG_0011.jpg", lambda: mountains(480, 360, rng)),
        ("IMG_0012.JPEG", lambda: forest(480, 360, rng)),
        ("Beach Day 1.jpg", lambda: beach(480, 360, rng, 0.7)),
        ("Beach Day 2.jpg", lambda: beach(480, 360, rng, 0.3)),
    ]
    for name, make in scenes:
        path = BASE / "photos/2025" / name
        canvas = make()
        if name.endswith(".png"):
            write(path, canvas.png())
        else:
            write_jpeg(path, canvas)

    raw_rng = random.Random(2026)
    raws = {
        "DSC_1001.NEF": (160, 120, beach),
        "DSC_1002.NEF": (160, 120, mountains),
        "DSC_1003.NEF": (160, 120, lake),
        "DSC_1004.NEF": (640, 640, harbor),
        "DSC_1005.NEF": (160, 120, sunset),
        "DSC_1006.NEF": (160, 120, meadow),
    }
    for name, (w, h, scene) in raws.items():
        write(BASE / "photos/2026/raw" / name, scene(w, h, raw_rng).tiff("NIKON CORPORATION", "NIKON Z 6II"))


def website_images() -> None:
    rng = random.Random(7)
    images = BASE / "projects/website/assets/images"
    write(images / "logo.png", logo().png())
    write_jpeg(images / "hero.jpg", harbor(1200, 600, rng), 85)
    write_jpeg(images / "team-1.jpeg", portrait(320, 320, rng, (15, 107, 122)))
    write_jpeg(images / "team-2.JPG", portrait(320, 320, rng, (200, 90, 60)))


def downloads() -> None:
    d = BASE / "downloads"
    rng = random.Random(42)

    report_pages = [
        [
            "Harbor Street Studio - Quarterly report, Q3 2026",
            "",
            "Revenue: EUR 48,200 (Q2: EUR 41,900)",
            "New sites launched: 6",
            "Care plans: 23 active, 2 cancelled",
            "Average page weight: 412 KB (target: under 500 KB)",
            "",
            "Photo: the new office on Harbor Street.",
        ],
        [
            "Highlights",
            "",
            "- The bakery site loads in 0.8 s on a phone.",
            "- Every site now has a print stylesheet.",
            "- Backups are restored once a month as a drill.",
            "",
            "Next quarter",
            "",
            "- Move every site to the new hosting plan.",
            "- Two blog posts a month.",
        ],
    ]
    write(d / "report-q3.pdf", pdf(report_pages, image=harbor(240, 200, rng), title="Quarterly report Q3 2026"))
    write(d / "invoice-0042.pdf", invoice("0042", "2026-10-01", [("Web hosting, October", 29.0), ("Backup storage, 50 GB", 6.5)]))
    write(d / "invoice-0043.pdf", invoice("0043", "2026-10-15", [("Domain renewal, harborstreet.example", 14.0)]))

    lines = ["date,page,visits,unique_visitors,avg_seconds,signups"]
    day = 0
    import datetime as dt

    start = dt.date(2026, 6, 1)
    while start + dt.timedelta(days=day) <= dt.date(2026, 10, 17):
        when = (start + dt.timedelta(days=day)).isoformat()
        for page, base_visits in (("/", 180), ("/about.html", 45), ("/blog/", 70)):
            visits = base_visits + rng.randint(-25, 40)
            uniques = int(visits * rng.uniform(0.7, 0.9))
            lines.append(f"{when},{page},{visits},{uniques},{rng.randint(25, 140)},{rng.randint(0, 4)}")
        day += 1
    write(d / "data-export.csv", ("\n".join(lines) + "\n").encode())

    readings = ["sensor,timestamp,celsius,humidity"]
    for i in range(96):
        hour, minute = divmod(i * 15, 60)
        readings.append(f"office-1,2026-09-24T{hour:02d}:{minute:02d}:00Z,{19.5 + 2.5 * math.sin(i / 15):.1f},{45 + (i * 7) % 12}")
    buf = io.BytesIO()
    with gzip.GzipFile(filename="readings.csv", mode="wb", fileobj=buf, mtime=1790236800) as gz:
        gz.write(("\n".join(readings) + "\n").encode())
    write(d / "mystery", buf.getvalue())

    old = d / "old"
    write(old / "Screenshot 2026-04-02 at 10.15.32.png", screenshot(800, 500).png())
    write(
        old / "bank-statement-2026-04.pdf",
        pdf([["Lisbon Savings Bank", "Statement for April 2026", "", "Opening balance   EUR 3,412.18", "Closing balance   EUR 3,980.44"]], title="Statement April 2026"),
    )
    write(
        old / "boarding-pass-LIS.pdf",
        pdf([["BOARDING PASS", "", "Passenger: LEARNER/HACK", "From: Lisbon (LIS)  To: Krakow (KRK)", "Date: 2026-05-24  Seat: 14C  Gate: 22"]], title="Boarding pass"),
    )
    write_jpeg(old / "wallpaper-mountains.jpg", mountains(1280, 720, random.Random(9)), 82)

    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, text in (
            ("meetup-slides/slides.md", "# Shell tricks for web people\n\n1. find\n2. xargs\n3. rsync\n"),
            ("meetup-slides/notes.txt", "Remember to show find -mtime with a real folder.\n"),
        ):
            info = zipfile.ZipInfo(name, date_time=(2026, 7, 1, 18, 30, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, text)
    write(old / "meetup-slides.zip", zbuf.getvalue())

    write(
        old / "budget-2026.csv",
        b"month,income,rent,software,travel\n2026-01,3900,1100,84,0\n2026-02,4100,1100,84,240\n2026-03,4300,1100,96,0\n"
        b"2026-04,4200,1100,96,310\n2026-05,4450,1150,96,0\n2026-06,4500,1150,110,120\n",
    )
    write(
        old / "vacation-checklist.txt",
        b"Before the trip\n- passport\n- chargers\n- out-of-office reply\n- water the plants\n- back up the laptop\n",
    )

    tbuf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=tbuf, mtime=1786665600) as gz:
        with tarfile.open(fileobj=gz, mode="w", format=tarfile.USTAR_FORMAT) as tf:
            for name, text, mode in (
                ("node-hello/", None, 0o755),
                ("node-hello/package.json", '{\n  "name": "node-hello",\n  "version": "1.0.0",\n  "main": "index.js"\n}\n', 0o644),
                ("node-hello/index.js", 'console.log("hello from node");\n', 0o644),
                ("node-hello/README.md", "# node-hello\n\nRun it with `node index.js`.\n", 0o644),
            ):
                info = tarfile.TarInfo(name.rstrip("/"))
                info.mtime = 1786665600
                info.mode = mode
                info.uname = info.gname = "learner"
                info.uid = info.gid = 1000
                if text is None:
                    info.type = tarfile.DIRTYPE
                    tf.addfile(info)
                else:
                    data = text.encode()
                    info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
    write(old / "node-hello.tar.gz", tbuf.getvalue())

    write(
        old / "receipt-0193.pdf",
        pdf([["Harbor Coffee Roasters", "Receipt 0193  2026-08-23", "", "2 x Flat white      EUR 7.00", "1 x Almond croissant  EUR 3.20", "", "Total  EUR 10.20"]], title="Receipt 0193"),
    )
    write(
        old / "team-offsite.ics",
        b"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Harbor Street Studio//Calendar//EN\r\nBEGIN:VEVENT\r\n"
        b"UID:offsite-2026@harborstreet.example\r\nDTSTAMP:20260830T090000Z\r\nDTSTART:20260918T080000Z\r\n"
        b"DTEND:20260918T160000Z\r\nSUMMARY:Team offsite\r\nLOCATION:Sintra\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",
    )
    write(
        old / "notes-backup.txt",
        b"Copied from the old laptop on 2026-09-07.\n\n- wifi at the office: ask Ben\n- printer is on the second floor\n- the NAS backs up every night at 02:00\n",
    )
    write(
        old / "cover-letter.txt",
        b"Dear hiring team,\n\nI build fast, accessible websites for small businesses, and I would love to\nbring that to your team.\n\nKind regards,\nHack Student\n",
    )


def main() -> None:
    photos()
    website_images()
    downloads()


if __name__ == "__main__":
    main()
