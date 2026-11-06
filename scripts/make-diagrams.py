#!/usr/bin/env python3
"""Draws the Learn-tab diagrams as SVG files in docs/diagrams/.

Run:  python3 scripts/make-diagrams.py
Each diagram matches the site's colours and switches to dark colours when the device is in
dark mode. A lesson section shows one with:  "diagram": {"src": "diagrams/<name>.svg", "alt": "...", "caption": "..."}
"""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parent.parent / "docs" / "diagrams"

STYLE = """
.bg{fill:#ffffff}
.t{font:600 15px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;fill:#12202b}
.tb{font:700 17px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;fill:#12202b}
.s{font:500 13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;fill:#5b6a78}
.m{font:600 13px ui-monospace,Menlo,Consolas,monospace;fill:#12202b}
.h{font:700 12px ui-monospace,Menlo,Consolas,monospace;fill:#0a6b84;letter-spacing:.08em}
.w{fill:#ffffff}
.box{fill:#f3f8fa;stroke:#a9bfca;stroke-width:1.5}
.acc{fill:#e3f1f5;stroke:#0a6b84;stroke-width:1.5}
.bad{fill:#fbe5e3;stroke:#b3302b;stroke-width:1.5}
.good{fill:#e1f3e8;stroke:#1d7a45;stroke-width:1.5}
.amb{fill:#fbf0dc;stroke:#a8650a;stroke-width:1.5}
.dim{fill:#eef2f4;stroke:#c9d3da;stroke-width:1.5}
.solid-acc{fill:#0a6b84}.solid-bad{fill:#b3302b}.solid-good{fill:#1d7a45}.solid-amb{fill:#a8650a}.solid-ink{fill:#12202b}
.ln{stroke:#5b6a78;stroke-width:2;fill:none}
.ln-acc{stroke:#0a6b84;stroke-width:2.2;fill:none}
.ln-bad{stroke:#b3302b;stroke-width:2.2;fill:none}
.ln-good{stroke:#1d7a45;stroke-width:2.2;fill:none}
.dash{stroke-dasharray:6 5}
.tx-acc{fill:#0a6b84}.tx-bad{fill:#b3302b}.tx-good{fill:#1d7a45}.tx-amb{fill:#a8650a}
.ic{fill:none;stroke:#12202b;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ic-bad{fill:none;stroke:#b3302b;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ic-acc{fill:none;stroke:#0a6b84;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mk-ln{fill:#5b6a78}.mk-acc{fill:#0a6b84}.mk-bad{fill:#b3302b}.mk-good{fill:#1d7a45}
@media (prefers-color-scheme: dark){
.bg{fill:#15202a}
.t,.tb,.m{fill:#e6edf3}.s{fill:#98a8b6}.h{fill:#4fb6cf}
.box{fill:#192632;stroke:#3a4c5a}.acc{fill:#143440;stroke:#4fb6cf}.bad{fill:#3c1d1b;stroke:#ef7c76}
.good{fill:#15352a;stroke:#5cc98a}.amb{fill:#392b13;stroke:#e2a645}.dim{fill:#1b2833;stroke:#34444f}
.solid-acc{fill:#2f8fa8}.solid-bad{fill:#c9534d}.solid-good{fill:#2f9a5f}.solid-amb{fill:#b97c1e}.solid-ink{fill:#e6edf3}
.ln{stroke:#98a8b6}.ln-acc{stroke:#4fb6cf}.ln-bad{stroke:#ef7c76}.ln-good{stroke:#5cc98a}
.tx-acc{fill:#4fb6cf}.tx-bad{fill:#ef7c76}.tx-good{fill:#5cc98a}.tx-amb{fill:#e2a645}
.ic{stroke:#e6edf3}.ic-bad{stroke:#ef7c76}.ic-acc{stroke:#4fb6cf}
.mk-ln{fill:#98a8b6}.mk-acc{fill:#4fb6cf}.mk-bad{fill:#ef7c76}.mk-good{fill:#5cc98a}
}
"""

MARKERS = "".join(
    f'<marker id="a-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
    f'<path d="M0 0 10 5 0 10z" class="mk-{k}"/></marker>'
    for k in ("ln", "acc", "bad", "good")
)


def svg(name, w, h, title, desc, body):
    out = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t d">'
           f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>'
           f'<style>{STYLE}</style><defs>{MARKERS}</defs>'
           f'<rect class="bg" width="{w}" height="{h}" rx="16"/>{body}</svg>\n')
    (OUT / f"{name}.svg").write_text(out, encoding="utf-8")


def T(x, y, s, cls="t", anchor="middle"):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{escape(s)}</text>'


def R(x, y, w, h, cls="box", rx=10):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" class="{cls}"/>'


def node(x, y, w, h, title, sub=None, cls="box", tcls="t"):
    cy = y + h / 2 + (5 if not sub else -3)
    out = R(x, y, w, h, cls) + T(x + w / 2, cy, title, tcls)
    if sub:
        out += T(x + w / 2, cy + 19, sub, "s")
    return out


def A(x1, y1, x2, y2, kind="ln", dash=False, both=False):
    start = f' marker-start="url(#a-{kind})"' if both else ""
    return (f'<path d="M{x1} {y1} L{x2} {y2}" class="ln{"" if kind == "ln" else "-" + kind}{" dash" if dash else ""}"'
            f' marker-end="url(#a-{kind})"{start}/>')


def P(d, cls="ln"):
    return f'<path d="{d}" class="{cls}"/>'


# Simple icons (drawn around a centre point)
def person(cx, cy, cls="ic"):
    return f'<circle cx="{cx}" cy="{cy - 10}" r="7" class="{cls}"/><path d="M{cx - 12} {cy + 14} q0 -14 12 -14 q12 0 12 14" class="{cls}"/>'


def computer(cx, cy, cls="ic"):
    return (f'<rect x="{cx - 15}" y="{cy - 13}" width="30" height="20" rx="3" class="{cls}"/>'
            f'<path d="M{cx - 7} {cy + 13} h14 M{cx} {cy + 7} v6" class="{cls}"/>')


def server(cx, cy, cls="ic"):
    s = ""
    for i in range(3):
        s += f'<rect x="{cx - 15}" y="{cy - 17 + i * 12}" width="30" height="10" rx="2" class="{cls}"/><circle cx="{cx - 9}" cy="{cy - 12 + i * 12}" r="1.4" class="{cls}"/>'
    return s


def cloud(cx, cy, cls="ic", s=1.0):
    return (f'<path transform="translate({cx} {cy}) scale({s})" d="M-26 12 h52 a13 13 0 0 0 0 -26 a19 19 0 0 0 -36 -6 a13 13 0 0 0 -16 32 z" class="{cls}"/>')


def padlock(cx, cy, cls="ic"):
    return (f'<rect x="{cx - 9}" y="{cy - 3}" width="18" height="14" rx="3" class="{cls}"/>'
            f'<path d="M{cx - 5} {cy - 3} v-5 a5 5 0 0 1 10 0 v5" class="{cls}"/>')


def tick(cx, cy, cls="ln-good"):
    return f'<circle cx="{cx}" cy="{cy}" r="11" class="good"/><path d="M{cx - 5} {cy} l3.5 4 l6.5 -8" class="{cls}"/>'


def cross(cx, cy, cls="ln-bad"):
    return f'<circle cx="{cx}" cy="{cy}" r="11" class="bad"/><path d="M{cx - 4.5} {cy - 4.5} l9 9 M{cx + 4.5} {cy - 4.5} l-9 9" class="{cls}"/>'


def chain(name, title, desc, steps, w=760, h=170, loop=None):
    """Steps as arrow-shaped chevrons: [(heading, line1, line2, cls)]"""
    n = len(steps)
    gap = 10
    cw = (w - 40 - gap * (n - 1)) / n
    body = ""
    for i, (head, l1, l2, cls) in enumerate(steps):
        x = 20 + i * (cw + gap)
        tip = 16
        pts = (f"{x},{40} {x + cw - tip},{40} {x + cw},{40 + 45} {x + cw - tip},{130} {x},{130}"
               + ("" if i == 0 else f" {x + tip},{85}"))
        body += f'<polygon points="{pts}" class="{cls}" stroke-linejoin="round"/>'
        cx = x + cw / 2 + (tip / 2 if i else 0) - tip / 2
        body += T(cx, 70, head, "tb") + T(cx, 94, l1, "s") + T(cx, 112, l2, "s")
    if loop:
        body += P(f"M{w - 40} 136 q0 20 -20 20 H60 q-20 0 -20 -20", "ln dash") + f'<path d="M34 142 l6 -8 l6 8" class="ln"/>'
        body += T(w / 2, 151, loop, "s")
    body = T(20, 26, title.upper(), "h", "start") + body
    svg(name, w, h + (14 if loop else 0), title, desc, body)


def build():
    OUT.mkdir(parents=True, exist_ok=True)

    # ---------- Lesson 3: DoS vs DDoS ----------
    b = T(24, 34, "DOS: ONE SOURCE", "h", "start")
    b += person(70, 92) + T(70, 128, "Attacker", "s")
    b += A(100, 90, 170, 90) + computer(205, 88) + T(205, 128, "One computer", "s")
    b += A(240, 90, 470, 90, "bad") + T(355, 78, "flood of requests", "s")
    b += R(490, 58, 92, 64, "bad") + server(536, 92, "ic-bad") + T(536, 140, "Web server", "s")
    b += R(612, 66, 128, 48, "good") + T(676, 87, "Easy to block:", "s") + T(676, 104, "one source", "s")
    b += P("M20 162 H740", "ln dash")
    b += T(24, 192, "DDOS: MANY SOURCES (A BOTNET)", "h", "start")
    b += person(70, 268) + T(70, 304, "Attacker", "s")
    b += A(100, 266, 160, 266) + R(162, 236, 96, 60, "acc") + server(210, 264, "ic-acc") + T(210, 316, "C&C server", "s")
    bots_y = [212, 240, 268, 296, 324]
    for y in bots_y:
        b += A(260, 266, 316, y - 2, "acc") + computer(340, y)
        b += A(366, y, 486, 266, "bad")
    b += T(340, 352, "Infected 'zombie' computers", "s")
    b += R(490, 234, 92, 64, "bad") + server(536, 268, "ic-bad") + T(536, 316, "Web server", "s")
    b += R(612, 232, 128, 70, "bad") + T(676, 257, "Hard to block:", "s") + T(676, 274, "traffic from", "s") + T(676, 291, "everywhere", "s")
    svg("dos-vs-ddos", 760, 370, "DoS vs DDoS",
        "Top: a DoS attack, where one attacker uses one computer to flood a web server with requests. It is easy to block because there is one source. "
        "Bottom: a DDoS attack, where the attacker controls a command-and-control server that directs many infected zombie computers (a botnet) "
        "to flood the web server at once. It is hard to block because traffic comes from everywhere.", b)

    # ---------- Lesson 5: DNS lookup vs spoofing ----------
    b = T(24, 34, "NORMAL DNS LOOKUP", "h", "start")
    b += person(64, 104) + T(64, 140, "You", "s")
    b += A(92, 92, 224, 92, "acc") + T(158, 80, "1. IP of bank.com?", "s")
    b += R(228, 64, 120, 60, "acc") + server(288, 94, "ic-acc") + T(288, 140, "DNS server", "s")
    b += A(226, 108, 94, 108, "good") + T(158, 126, "2. Real IP", "s")
    b += A(64, 148, 64, 200, "good").replace("M64 148", "M64 150")
    b += R(20, 202, 90, 46, "good") + T(65, 224, "Real", "t") + T(65, 240, "bank site", "s")
    b += T(160, 186, "3. You reach the", "s") + T(160, 202, "real website", "s")
    b += P("M380 20 V280", "ln dash")
    b += T(404, 34, "DNS SPOOFING", "h", "start")
    b += person(728, 102, "ic-bad") + T(728, 138, "Hacker", "s")
    b += A(704, 96, 644, 96, "bad") + T(684, 72, "1. Fake entry", "s")
    b += R(520, 64, 120, 60, "bad") + server(580, 94, "ic-bad") + T(580, 140, "DNS server", "s")
    b += person(436, 104) + T(436, 140, "You", "s")
    b += A(462, 92, 516, 92, "acc") + T(489, 56, "2. bank.com?", "s")
    b += A(580, 150, 580, 196, "bad") + T(636, 176, "3. Fake IP", "s")
    b += R(520, 200, 120, 50, "bad") + T(580, 222, "Fake look-alike", "t") + T(580, 240, "steals logins", "s")
    b += R(656, 200, 88, 50, "dim") + T(700, 222, "Real site", "s") + T(700, 240, "not reached", "s")
    b += T(580, 272, "Red flag: no padlock / 'Not secure' warning", "s")
    svg("dns-spoofing", 760, 290, "Normal DNS lookup vs DNS spoofing",
        "Left: a normal DNS lookup. You ask the DNS server for the IP address of bank.com, it replies with the real IP, and you reach the real bank site. "
        "Right: DNS spoofing. A hacker inserts a fake entry into the DNS server, so when you ask for bank.com it replies with a fake IP and you land on "
        "a fake look-alike site that steals your login details; the real site is never reached. A red flag is the missing padlock or a 'Not secure' warning.", b)

    # ---------- Lesson 15: port states ----------
    b = T(24, 32, "WHAT A PORT SCANNER SEES", "h", "start")
    rows = [
        ("OPEN", "Port accepts the connection", "A service is listening", "good", "good"),
        ("CLOSED", "Port replies: 'nothing here'", "No service right now (keep scanning)", "amb", "amb"),
        ("FILTERED", "No reply at all", "A firewall silently blocks it", "acc", "acc"),
    ]
    for i, (state, l1, l2, cls, kind) in enumerate(rows):
        y = 52 + i * 86
        b += R(20, y, 120, 66, "box") + computer(54, y + 33) + T(100, y + 38, "Scanner", "s")
        b += A(146, y + 22, 300, y + 22, "ln") + T(222, y + 14, "request", "s")
        if state == "FILTERED":
            b += f'<rect x="306" y="{y - 2}" width="16" height="70" rx="3" class="solid-acc"/>' + T(240, y + 56, "no reply", "s")
            b += R(340, y, 120, 66, "dim") + T(400, y + 39, "Port", "t")
        else:
            b += R(340, y, 120, 66, cls) + T(400, y + 39, "Port", "t")
            b += A(338, y + 46, 148, y + 46, "good" if state == "OPEN" else "ln", dash=state == "CLOSED")
            b += T(240, y + 62, "accepted" if state == "OPEN" else "refused", "s")
        b += R(480, y, 260, 66, cls) + T(498, y + 24, state, "tb", "start") + T(498, y + 43, l1, "s", "start") + T(498, y + 59, l2, "s", "start")
    svg("port-states", 760, 318, "Port states: open, closed, filtered",
        "Three rows showing what a port scanner sees. Open: the scanner sends a request and the port accepts the connection because a service is listening. "
        "Closed: the port replies to refuse the connection because nothing is listening right now, so keep scanning as it could open later. "
        "Filtered: a firewall silently blocks the request so there is no reply at all.", b)

    # ---------- Lesson 9: cause risk impact response ----------
    chain("vuln-chain", "The four-step exam chain",
          "Four linked steps for answering vulnerability questions, using a school's unpatched till as the example. Cause: the till runs unpatched software. "
          "Risk: an attacker exploits the known weakness. Impact: payment data stolen or tills shut down. Response: a patch management policy.",
          [("Cause", "The till runs old,", "unpatched software", "acc"),
           ("Risk", "An attacker exploits", "the known weakness", "amb"),
           ("Impact", "Payment data stolen", "or tills shut down", "bad"),
           ("Response", "Patch management", "policy: update it", "good")])

    # ---------- Lesson 9: firewall and ports ----------
    b = T(24, 32, "A FIREWALL IS A GATE BETWEEN THE INTERNET AND YOUR NETWORK", "h", "start")
    b += cloud(90, 140, "ic", 1.4) + T(90, 196, "Internet", "t")
    ports = [("443 HTTPS", True), ("80 HTTP", True), ("3389 Remote Desktop", False), ("21 FTP (not needed)", False)]
    b += R(250, 52, 190, 196, "acc") + T(345, 76, "Firewall", "tb")
    for i, (p, ok) in enumerate(ports):
        y = 96 + i * 36
        b += R(266, y, 158, 28, "good" if ok else "bad", 8) + T(345, y + 19, p, "s")
        if ok:
            b += A(150, 142, 262, y + 14, "good")
            b += A(428, y + 14, 560, 150, "good")
        else:
            b += A(150, 146, 262, y + 14, "bad", dash=True)
            b += cross(444, y + 14)
    b += R(564, 96, 176, 110, "good") + computer(612, 136) + server(690, 140) + T(652, 186, "Trusted network", "t")
    b += T(560, 236, "Close or block ports", "s") + T(560, 254, "that aren't needed", "s")
    svg("firewall-ports", 760, 270, "How a firewall uses ports",
        "Traffic from the internet reaches the firewall, which acts as a gate. Ports that are needed, such as 443 for HTTPS and 80 for HTTP, are allowed "
        "through to the trusted network. Ports that are not needed, such as 3389 Remote Desktop and 21 FTP, are blocked. Close or block ports that aren't needed.", b)

    # ---------- Lesson 15: detection & management ----------
    chain("vuln-management", "Detection and management software",
          "Four repeating steps used by vulnerability detection and management software. Scan devices against a database of known vulnerabilities. "
          "Score each one, for example with a CVSS score from 0 to 10. Prioritise the most dangerous first. Track each fix until it is done, then scan again.",
          [("1 Scan", "Check devices against", "known vulnerabilities", "acc"),
           ("2 Score", "Rate each one, e.g.", "CVSS 0 to 10", "amb"),
           ("3 Prioritise", "Most dangerous and", "easiest to exploit first", "bad"),
           ("4 Track", "Follow each fix", "until it's done", "good")], loop="Repeat regularly: new vulnerabilities appear all the time")

    # ---------- Lesson 8: NIST CSF ----------
    chain("nist-csf", "NIST Cybersecurity Framework: five core functions",
          "The five core functions of the NIST Cybersecurity Framework in order. Identify: know what to protect and the risks. Protect: put safeguards in place. "
          "Detect: spot attacks quickly. Respond: act to contain an incident. Recover: restore systems and learn from it, then the cycle repeats.",
          [("Identify", "What to protect", "and the risks", "acc"),
           ("Protect", "Safeguards, e.g.", "access, training", "good"),
           ("Detect", "Spot attacks", "quickly", "amb"),
           ("Respond", "Contain it,", "limit damage", "bad"),
           ("Recover", "Restore, then", "learn from it", "acc")], w=780, loop="Learn from each incident and start again")

    # ---------- Lesson 11: mobile lifecycle ----------
    b = T(24, 32, "LIFECYCLE OF A MOBILE DEVICE", "h", "start")
    stages = [("Release", "Device launched", "acc"), ("Active updates", "Regular OS and", "good"), ("End-of-support", "Updates stop;", "amb"), ("Rising risk", "Known flaws", "bad")]
    sub2 = ["and on sale", "security updates", "phone still works", "never fixed"]
    for i, (h, s1, cls) in enumerate(stages):
        x = 20 + i * 185
        b += R(x, 50, 170, 74, cls) + T(x + 85, 78, h, "tb") + T(x + 85, 98, s1, "s") + T(x + 85, 114, sub2[i], "s")
        if i < 3:
            b += A(x + 172, 87, x + 183, 87)
    b += T(24, 156, "SECURITY RISK", "h", "start")
    b += f'<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#1d7a45"/><stop offset=".5" stop-color="#1d7a45"/><stop offset=".7" stop-color="#a8650a"/><stop offset="1" stop-color="#b3302b"/></linearGradient></defs>'
    b += '<path d="M20 198 L20 184 L380 184 C470 184 520 168 560 160 S700 136 740 128 L740 198 Z" fill="url(#g)" opacity=".9"/>'
    b += T(200, 196, "Low while patched", "s w") + T(650, 190, "High: unpatched", "s w")
    svg("mobile-lifecycle", 760, 214, "Lifecycle of a mobile device",
        "Four stages in order: Release, when the device is launched; Active updates, when the manufacturer sends regular OS and security updates; "
        "End-of-support, when updates stop but the phone still works; and Rising risk, when known flaws are never fixed. "
        "A bar underneath shows security risk staying low while patched, then rising sharply after end-of-support.", b)

    # ---------- Lesson 12: review timescales ----------
    b = T(24, 32, "SECURITY REVIEWS: SUGGESTED TIMESCALES", "h", "start")
    b += P("M40 96 H720", "ln-acc")
    items = [("Daily", "Doors, alarms and", "restricted areas"), ("Monthly", "Access logs,", "passes and CCTV"), ("Every 6 months", "Staff access: remove", "what isn't needed"), ("Annually", "Full physical", "security audit")]
    for i, (h, a, c) in enumerate(items):
        x = 100 + i * 170
        b += f'<circle cx="{x}" cy="96" r="10" class="solid-acc"/>' + T(x, 70, h, "tb") + T(x, 128, a, "s") + T(x, 146, c, "s")
    b += R(196, 164, 368, 40, "bad") + T(380, 189, "After an incident: review immediately and improve", "s")
    svg("review-timescales", 760, 216, "Security review timescales",
        "A timeline of physical security reviews. Daily: check doors, alarms and restricted areas. Monthly: review access logs, security passes and CCTV. "
        "Every 6 months: check staff access and remove what isn't needed. Annually: a full physical security audit. After an incident: review immediately and improve.", b)

    # ---------- Lesson 6: mantrap ----------
    b = T(24, 32, "HOW A MANTRAP (AIRLOCK) STOPS TAILGATING", "h", "start")
    b += R(20, 56, 190, 150, "dim") + T(115, 80, "Outside", "t")
    b += person(80, 140) + person(150, 140, "ic-bad") + T(150, 186, "Tailgater", "s") + T(80, 186, "Staff", "s")
    b += f'<rect x="214" y="56" width="12" height="150" rx="3" class="solid-acc"/>' + R(232, 70, 24, 30, "acc", 4) + T(244, 118, "pass", "s")
    b += R(262, 56, 236, 150, "acc") + T(380, 80, "Mantrap chamber", "t") + person(380, 140) + T(380, 186, "Only one person fits", "s")
    b += cross(150, 104)
    b += f'<rect x="502" y="56" width="12" height="150" rx="3" class="solid-acc"/>' + R(520, 70, 24, 30, "acc", 4) + T(532, 118, "scan", "s")
    b += R(550, 56, 190, 150, "good") + T(645, 80, "Secure area", "t") + server(625, 140) + server(665, 140)
    b += A(100, 220, 360, 220, "acc") + A(400, 220, 660, 220, "acc")
    b += T(230, 240, "Door 1: authenticate", "s") + T(530, 240, "Door 2 opens only when door 1 is shut", "s")
    svg("mantrap", 760, 252, "How a mantrap stops tailgating",
        "Plan view of a mantrap. From outside, a member of staff authenticates with a pass at door 1 and enters the mantrap chamber, which fits only one person, "
        "so a tailgater behind them is blocked. Door 2 checks them again and only opens when door 1 is shut, letting them into the secure area.", b)

    # ---------- Lesson 7: four losses ----------
    b = T(24, 32, "ONE ATTACK, FOUR TYPES OF LOSS: BRITISH AIRWAYS (2018)", "h", "start")
    quads = [("Operational", "Booking and payment", "systems disrupted", "acc", 20, 50),
             ("Financial", "£20m ICO fine plus", "customer compensation", "amb", 470, 50),
             ("Reputational", "Media coverage damaged", "public trust", "bad", 20, 180),
             ("Intellectual property", "Internal security info", "exposed", "good", 470, 180)]
    for h, a, c, cls, x, y in quads:
        b += R(x, y, 270, 100, cls) + T(x + 135, y + 36, h, "tb") + T(x + 135, y + 60, a, "s") + T(x + 135, y + 78, c, "s")
    b += f'<circle cx="380" cy="165" r="62" class="bad"/>' + T(380, 158, "Data breach:", "t") + T(380, 178, "~400,000", "tb") + T(380, 196, "customers", "s")
    for x1, y1, x2, y2 in [(330, 130, 292, 110), (430, 130, 468, 110), (330, 200, 292, 222), (430, 200, 468, 222)]:
        b += A(x1, y1, x2, y2, "bad")
    svg("four-losses", 760, 296, "One attack, four types of loss",
        "The 2018 British Airways data breach affecting around 400,000 customers in the centre, with arrows to four types of loss. Operational: booking and payment "
        "systems disrupted. Financial: a £20 million ICO fine plus customer compensation. Reputational: media coverage damaged public trust. "
        "Intellectual property: internal security information exposed.", b)

    # ---------- Lesson 2: virus vs worm ----------
    b = T(24, 32, "VIRUS: SPREADS BY INFECTING FILES", "h", "start")
    for i in range(3):
        x = 50 + i * 120
        b += R(x, 60, 70, 86, "bad") + P(f"M{x + 50} 60 v16 h20", "ln") + T(x + 35, 112, "file", "s")
        if i < 2:
            b += A(x + 74, 103, x + 116, 103, "bad")
    b += person(110, 196) + T(160, 196, "needs someone to", "s", "start") + T(160, 214, "open or run a file", "s", "start")
    b += P("M400 20 V240", "ln dash")
    b += T(424, 32, "WORM: SPREADS BY ITSELF", "h", "start")
    pcs = [(470, 80), (600, 80), (720, 80), (530, 170), (660, 170)]
    for (x, y) in pcs:
        b += R(x - 30, y - 26, 60, 50, "bad") + computer(x, y - 2, "ic-bad")
    for (a, c) in [(0, 1), (1, 2), (0, 3), (3, 4), (1, 4)]:
        (x1, y1), (x2, y2) = pcs[a], pcs[c]
        b += A(x1 + (32 if x2 > x1 else 0), y1 + (26 if y2 > y1 else 0), x2 - (32 if x2 > x1 else 0), y2 - (26 if y2 > y1 else 0), "bad")
    b += T(590, 226, "Self-replicates across the network (LAN, email, links)", "s")
    svg("virus-vs-worm", 760, 244, "Virus vs worm",
        "Left: a virus spreads by infecting files, passing from one file to the next, and needs someone to open or run an infected file. "
        "Right: a worm spreads by itself, copying itself from computer to computer across a network through the LAN, email or links, with no one needing to open anything.", b)

    # ---------- Lesson 10: SQL injection ----------
    b = T(24, 32, "HOW ' OR 1=1 -- BREAKS A LOGIN", "h", "start")
    b += R(20, 46, 720, 58, "good") + T(36, 70, "Normal:", "t", "start")
    b += T(110, 70, "WHERE username = 'Alex' AND password = 'password123'", "m", "start")
    b += T(36, 92, "The database checks both, so you get in only with the right password.", "s", "start")
    b += R(20, 122, 720, 58, "bad") + T(36, 146, "Attack:", "t", "start")
    b += T(110, 146, "WHERE username = '' OR 1=1 --' AND password = '...'", "m", "start")
    b += P("M338 141 H510", "ln-bad")  # the password check is commented out
    for lx, cx, s in [(130, 247, "' ends the username text"), (380, 292, "OR 1=1 is always true"), (620, 327, "-- turns the rest into a comment")]:
        b += A(lx, 198, cx, 160, "bad") + T(lx, 214, s, "s")
    b += R(196, 230, 368, 40, "bad") + T(380, 255, "Result: logged in without a valid password", "t")
    svg("sql-injection", 760, 284, "How SQL injection breaks a login",
        "Top: a normal login query checks WHERE username equals Alex AND password equals password123, so you only get in with the right password. "
        "Bottom: the attacker types quote OR 1=1 dash dash as the username. The quote ends the username text, OR 1=1 is always true, and the two dashes "
        "turn the rest of the line, including the password check, into a comment. Result: logged in without a valid password.", b)

    # ---------- Lesson 13: cloud data in transit ----------
    b = T(24, 32, "PROTECT CLOUD DATA IN TRANSIT AND WHEN STORED", "h", "start")
    b += R(20, 70, 150, 110, "acc") + computer(70, 116) + server(124, 120) + T(95, 160, "Your organisation", "s")
    b += cloud(630, 118, "ic-acc", 1.5) + T(630, 176, "Cloud provider", "s") + padlock(630, 118, "ic-acc")
    b += P("M180 112 C300 80 460 80 570 112", "ln-good") + f'<path d="M562 104 l9 8 l-11 4" class="ln-good"/>'
    b += R(330, 70, 110, 34, "good", 17) + padlock(350, 86) + T(398, 92, "encrypted", "s")
    b += T(385, 128, "HTTPS / VPN", "t")
    b += person(385, 196, "ic-bad") + T(385, 236, "Attacker can't read it", "s")
    b += A(385, 176, 385, 138, "bad", dash=True) + cross(410, 160)
    b += T(630, 210, "Stored data: encrypted", "s") + T(630, 228, "+ correct settings", "s")
    svg("cloud-transit", 760, 250, "Protecting cloud data",
        "Data travels from your organisation across the internet to a cloud provider. Using HTTPS or a VPN encrypts it in transit, so an attacker who "
        "intercepts it can't read it. At the cloud provider, stored data should also be encrypted and the security settings configured correctly.", b)

    # ---------- Lesson 14: attack vectors ----------
    b = T(24, 32, "ATTACK VECTORS: ROUTES INTO A NETWORK", "h", "start")
    b += R(280, 110, 200, 100, "acc") + T(380, 150, "College network", "tb") + T(380, 172, "routers · switches", "s") + T(380, 190, "access points", "s")
    b += node(20, 70, 200, 70, "Wireless", "Wi-Fi, Bluetooth, NFC, RFID", "amb")
    b += node(20, 180, 200, 70, "Fake access point", "pretends to be trusted", "bad")
    b += node(540, 70, 200, 70, "Internet connection", "modem / router", "amb")
    b += node(540, 180, 200, 70, "Internal device", "switch, router, AP", "amb")
    b += A(222, 105, 278, 140, "bad") + A(222, 215, 278, 180, "bad") + A(538, 105, 482, 140, "bad") + A(538, 215, 482, 180, "bad")
    b += T(380, 262, "One weak device in the middle can expose every device on the network", "s")
    svg("attack-vectors", 760, 280, "Attack vectors into a network",
        "A college network in the centre, with four routes in. Wireless: Wi-Fi, Bluetooth, NFC and RFID. A fake access point pretending to be trusted. "
        "The internet connection through the modem or router. An internal device such as a switch, router or access point. "
        "One weak device in the middle can expose every device on the network.", b)


if __name__ == "__main__":
    build()
    print("Diagrams written to", OUT)
    for f in sorted(OUT.glob("*.svg")):
        print(" -", f.name)
