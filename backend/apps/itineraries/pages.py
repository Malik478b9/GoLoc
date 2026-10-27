"""
Server-rendered itinerary pages. The document prints cleanly (Print → Save as
PDF works on phones and desktops), and the poster is a single shareable card.
Every value is escaped: the content is written by AI and edited by Captains.
"""
from django.utils.html import escape

STYLE = """
:root{--ink:#12211F;--ink2:#3D4A47;--muted:#6B7774;--line:#E4DCCB;--sand:#F6EFE1;--paper:#FBF8F1;--green:#2F7A6B;--greenSoft:#DCEDE7;--gold:#E8A33D;--goldSoft:#FBEBD0;--night:#0E2B2C}
*{box-sizing:border-box}body{margin:0;background:var(--sand);color:var(--ink);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:30px;line-height:1.2;margin:6px 0}h2{font-size:20px;margin:28px 0 10px}h3{font-size:17px;margin:0}
.muted{color:var(--muted)}.small{font-size:13px}.label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--gold)}
.card{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px;margin:12px 0;break-inside:avoid}
.hero{background:var(--night);color:#fff;border-radius:20px;padding:24px}.hero .muted{color:#C9D6D2}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.chip{background:var(--greenSoft);color:var(--green);border-radius:99px;padding:3px 10px;font-size:13px;font-weight:600}
.hero .chip{background:#ffffff1f;color:#fff}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.grid2{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:7px 6px;border-top:1px solid var(--line);vertical-align:top}
td.t{width:64px;font-weight:700;white-space:nowrap}.type{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--green);font-weight:700}
.day{display:flex;gap:12px;align-items:baseline}.daynum{background:var(--green);color:#fff;border-radius:10px;padding:4px 10px;font-weight:700;white-space:nowrap}
.kv{display:grid;grid-template-columns:110px 1fr;gap:4px 10px;margin-top:10px;font-size:14px}.kv b{color:var(--ink2)}
.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:99px;background:var(--goldSoft);color:#8A5A12;margin-left:6px}
ul{margin:6px 0;padding-left:20px}.btn{display:inline-block;background:var(--green);color:#fff;border:0;border-radius:12px;padding:10px 16px;font-weight:700;text-decoration:none;cursor:pointer;margin:4px 8px 4px 0}
@media print{body{background:#fff}.noprint{display:none}.card{border-color:#ddd}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
"""


def _e(v):
    return escape("" if v is None else str(v))


def _list(items, cls=""):
    items = [i for i in (items or []) if str(i).strip()]
    return f"<ul class='{cls}'>" + "".join(f"<li>{_e(i)}</li>" for i in items) + "</ul>" if items else ""


def _leg(title, leg):
    if not leg or not any(str(v).strip() for k, v in leg.items() if k != "date_label"):
        return ""
    rows = [("When", " · ".join(x for x in (leg.get("date_label"), leg.get("time")) if x)), ("How", leg.get("mode")),
            ("Where", leg.get("point")), ("Pickup", leg.get("pickup")), ("Notes", leg.get("notes"))]
    body = "".join(f"<b>{k}</b><span>{_e(v)}</span>" for k, v in rows if v)
    return f"<div class='card'><h3>{title}</h3><div class='kv'>{body}</div></div>"


def _day(d):
    sched = "".join(
        f"<tr><td class='t'>{_e(s.get('time'))}</td><td><span class='type'>{_e(s.get('type'))}</span><br>"
        f"<b>{_e(s.get('activity'))}</b>{' · ' + _e(s.get('place')) if s.get('place') else ''}"
        f"{'<br><span class=muted>' + _e(s.get('details')) + '</span>' if s.get('details') else ''}</td>"
        f"<td class='small muted' style='text-align:right'>{_e(s.get('cost'))}</td></tr>"
        for s in d.get("schedule") or []
    )
    meals = d.get("meals") or {}
    stay = d.get("stay") or {}
    kv = [("Breakfast", meals.get("breakfast")), ("Lunch", meals.get("lunch")), ("Dinner", meals.get("dinner")),
          ("Transport", d.get("transport"))]
    hotel = " · ".join(x for x in (stay.get("hotel"), stay.get("area"), stay.get("category")) if x)
    if hotel:
        tag = "" if stay.get("confirmed") else "<span class='tag'>to confirm</span>"
        stay_html = f"<b>Stay</b><span>{_e(hotel)}{tag}{'<br><span class=muted small>' + _e(stay.get('notes')) + '</span>' if stay.get('notes') else ''}</span>"
    else:
        stay_html = ""
    kv_html = stay_html + "".join(f"<b>{k}</b><span>{_e(v)}</span>" for k, v in kv if v)
    tickets = "".join(f"<li>{_e(t.get('item'))}{' — ' + _e(t.get('price')) if t.get('price') else ''}"
                      f"{' <span class=muted>(' + _e(t.get('notes')) + ')</span>' if t.get('notes') else ''}</li>"
                      for t in d.get("tickets") or [] if t.get("item"))
    return (
        f"<div class='card'><div class='day'><span class='daynum'>Day {_e(d.get('day'))}</span>"
        f"<div><h3>{_e(d.get('title'))}</h3><div class='muted small'>{_e(d.get('date_label'))}"
        f"{' · ' + _e(d.get('base')) if d.get('base') else ''}</div></div></div>"
        f"{'<p>' + _e(d.get('overview')) + '</p>' if d.get('overview') else ''}"
        f"{'<table>' + sched + '</table>' if sched else ''}"
        f"{'<div class=kv>' + kv_html + '</div>' if kv_html else ''}"
        f"{'<p class=small><b>Tickets & permits</b></p><ul class=small>' + tickets + '</ul>' if tickets else ''}"
        f"{'<p class=small><b>Tips</b></p>' + _list(d.get('tips'), 'small') if d.get('tips') else ''}"
        "</div>"
    )


def render_document(it) -> str:
    c = it.content or {}
    p = it.poster or {}
    captain = it.captain
    costs = "".join(f"<tr><td>{_e(r.get('item'))}</td><td style='text-align:right'><b>{_e(r.get('amount'))}</b></td></tr>"
                    for r in c.get("cost_estimate") or [] if r.get("item"))
    sections = [
        ("What's included", _list(c.get("inclusions"))), ("Not included", _list(c.get("exclusions"))),
        ("Packing list", _list(c.get("packing_list"))), ("Important notes", _list(c.get("important_notes"))),
    ]
    extra = "".join(f"<div class='card'><h3>{t}</h3>{body}</div>" for t, body in sections if body)
    dates = f"{it.start_date:%d %b %Y} → {it.end_date:%d %b %Y}" if it.start_date and it.end_date else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(c.get('title') or it.title)} · GoLoc itinerary</title><style>{STYLE}</style></head><body><div class="wrap">
<div class="noprint" style="margin-bottom:12px"><button class="btn" onclick="window.print()">Print / Save as PDF</button><a class="btn" style="background:var(--gold)" href="poster/">Poster</a></div>
<div class="hero"><div class="label">{_e(it.code)} · {_e(it.get_tier_display())} · {_e(p.get('duration_label') or f'{it.days} days')}</div>
<h1>{_e(c.get('title') or it.title)}</h1><div class="muted">{_e(it.destination)}{' · ' + _e(dates) if dates else ''} · {it.guests} traveler{'s' if it.guests > 1 else ''}</div>
{'<p>' + _e(c.get('summary')) + '</p>' if c.get('summary') else ''}
<div class="chips">{''.join(f"<span class='chip'>{_e(h)}</span>" for h in (c.get('highlights') or [])[:8])}</div>
<p class="small muted" style="margin-bottom:0">Prepared by {_e(captain.name)} ({_e(captain.code)}), {_e(captain.get_captain_type_display())} · {_e(captain.city.name)}</p></div>
<div class="grid2">{_leg("Arrival", c.get("arrival"))}{_leg("Departure", c.get("departure"))}</div>
<h2>Day by day</h2>{''.join(_day(d) for d in c.get('days') or [])}
{f"<h2>Estimated costs</h2><div class='card'><table>{costs}</table><p class='small muted'>Estimates. Your booking price on GoLoc is what you pay.</p></div>" if costs else ''}
{extra}
<p class="small muted">Hotels marked “to confirm” are suggestions your Captain will confirm. Plans can change with weather and local conditions.</p>
</div></body></html>"""


def render_poster(it) -> str:
    p = it.poster or {}
    highlights = "".join(f"<li>{_e(h)}</li>" for h in (p.get("highlights") or [])[:5])
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(p.get('headline') or it.title)} · GoLoc</title><style>{STYLE}
.poster{{max-width:520px;margin:24px auto;background:var(--night);color:#fff;border-radius:28px;padding:32px;position:relative;overflow:hidden}}
.poster:before{{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:var(--gold);opacity:.18}}
.poster h1{{font-size:36px;margin:12px 0 6px}}.poster ul{{list-style:none;padding:0;margin:18px 0}}.poster li{{padding:8px 0;border-top:1px solid #ffffff22}}
.poster li:before{{content:"✓ ";color:var(--gold);font-weight:700}}.price{{font-size:22px;font-weight:800;color:var(--gold)}}
.cta{{display:inline-block;margin-top:16px;background:var(--gold);color:var(--night);padding:10px 18px;border-radius:12px;font-weight:800}}
</style></head><body><div class="wrap"><div class="poster">
<div class="label">{_e(p.get('duration_label') or f'{it.days} days')} · {_e(p.get('tier_label') or it.get_tier_display())}</div>
<h1>{_e(p.get('headline') or it.title)}</h1><div style="color:#C9D6D2">{_e(p.get('tagline') or it.destination)}</div>
<ul>{highlights}</ul>
{'<div class="price">' + _e(p.get('price_line')) + '</div>' if p.get('price_line') else ''}
<div class="cta">{_e(p.get('call_to_action') or 'Book on GoLoc')}</div>
<p class="small" style="color:#C9D6D2;margin-top:18px">{_e(it.captain.name)} · {_e(it.captain.code)} · GoLoc</p>
</div><div class="noprint" style="text-align:center"><a class="btn" href="../">Full itinerary</a><button class="btn" style="background:var(--gold)" onclick="window.print()">Print / Save</button></div></div></body></html>"""
