#!/usr/bin/env python3
"""Regenerates docs/schema.drawio from the running local database.

The diagram is introspected rather than drawn, because a hand-maintained ERD
drifts from the migrations the first time somebody is in a hurry. Run it after
any schema change:

    npm run db:erd          (from the repository root, with npm run db:start up)

Reads through `docker exec` on the Supabase CLI's database container, so it
needs no Python database driver — only the local stack.
"""
import io
import os
import re
import subprocess
import sys
from xml.sax.saxutils import escape

CONTAINER = os.environ.get('SUPABASE_DB_CONTAINER', 'supabase_db_app')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'schema.drawio')

# Partitions are excluded on both sides: 24 monthly children of `ocitavanje` would
# add nothing but noise, and each one carries a copy of the parent's foreign keys.
NOT_A_PARTITION = 'not in (select inhrelid from pg_inherits)'

COLUMNS_SQL = f"""
select c.relname, a.attnum, a.attname,
       format_type(a.atttypid, a.atttypmod),
       a.attnotnull,
       exists(select 1 from pg_constraint pc
              where pc.conrelid = c.oid and pc.contype = 'p' and a.attnum = any(pc.conkey)),
       coalesce((select cl2.relname from pg_constraint pc
                 join pg_class cl2 on cl2.oid = pc.confrelid
                 where pc.conrelid = c.oid and pc.contype = 'f'
                   and a.attnum = any(pc.conkey) limit 1), '')
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'app' and c.relkind in ('r', 'p') and c.oid {NOT_A_PARTITION}
order by c.relname, a.attnum;
"""

FKS_SQL = f"""
select c.relname, cl2.relname, a.attname
from pg_constraint pc
join pg_class c on c.oid = pc.conrelid
join pg_class cl2 on cl2.oid = pc.confrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum = pc.conkey[1]
where n.nspname = 'app' and pc.contype = 'f'
  and c.oid {NOT_A_PARTITION} and cl2.oid {NOT_A_PARTITION}
order by 1, 2;
"""

# Same grouping as the module map in docs/backend-architecture.md, so the two
# pictures can be read side by side.
AREAS = [
    ('Geografija', '#dae8fc', '#6c8ebf',
     ['mesna_zajednica', 'naselje', 'naselje_alias']),
    ('Imovina i uredjaji', '#d5e8d4', '#82b366',
     ['sabirno_mesto', 'kontejner', 'uredjaj', 'uredjaj_montaza']),
    ('Telemetrija', '#ffe6cc', '#d79b00',
     ['ocitavanje', 'kontejner_stanje', 'alarm', 'praznjenje']),
    ('Sezonalnost i prognoza', '#fff2cc', '#d6b656',
     ['kalendarski_dogadjaj', 'prognoza_punjenja']),
    ('Divlje deponije', '#f8cecc', '#b85450',
     ['deponija_kanonska', 'deponija_lokacija', 'deponija_opservacija',
      'izvorna_serija', 'akcija_ciscenja']),
    ('Prijave i ljudi', '#e1d5e7', '#9673a6',
     ['korisnik', 'gradjanin', 'posrednik', 'prijava', 'prijava_foto', 'dolazna_poruka']),
    ('Rizik i rute', '#b0e3e6', '#0e8088',
     ['rizik', 'crna_tacka', 'vozilo', 'plan_rute', 'stajaliste_rute', 'rastojanje']),
    ('Raspored, obavestenja, bodovi', '#d0cee2', '#56517e',
     ['plan_odvoza', 'pretplata', 'obavestenje', 'bod_transakcija', 'rezultat_takmicenja']),
]

TYPE_SHORT = [
    (r'^timestamp with time zone$', 'timestamptz'),
    (r'^character varying', 'varchar'),
    (r'^extensions\.geography\(Point,4326\)$', 'geography(Point)'),
    (r'^extensions\.geography\(Polygon,4326\)$', 'geography(Polygon)'),
    (r'^app\.', ''),          # domain enums read better without the schema prefix
    (r'^integer$', 'int'),
    (r'^boolean$', 'bool'),
    (r'^double precision$', 'float8'),
]

W, KEYW, HDR, ROW = 300, 36, 26, 20
GAP_Y, GAP_SUBCOL, GAP_AREA, MAX_Y = 34, 320, 70, 1500


def psql(sql):
    result = subprocess.run(
        ['docker', 'exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
         '-t', '-A', '-F', '|', '-c', sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f'psql failed against {CONTAINER}. Is `npm run db:start` up?\n{result.stderr.strip()}')
    return [line for line in result.stdout.splitlines() if line.strip()]


def short(t):
    for pattern, replacement in TYPE_SHORT:
        t = re.sub(pattern, replacement, t)
    return t


def introspect():
    tables = {}
    for line in psql(COLUMNS_SQL):
        table, _num, name, typ, notnull, pk, fk = line.split('|')
        tables.setdefault(table, []).append({
            'name': name, 'type': short(typ),
            'null': notnull != 't', 'pk': pk == 't', 'fk': fk,
        })
    fks = [tuple(line.split('|')) for line in psql(FKS_SQL)]
    return tables, fks


def subcolumns(tables, names):
    """How many stacked columns an area needs, so its caption can span them."""
    count, y = 1, 0
    for name in names:
        height = HDR + ROW * len(tables[name])
        if y and y + height > MAX_Y:
            count, y = count + 1, 0
        y += height + GAP_Y
    return count


def build(tables, fks):
    cells, edges, placed = [], [], set()
    x = 40

    for title, fill, stroke, names in AREAS:
        names = [n for n in names if n in tables]
        if not names:
            continue
        spans = subcolumns(tables, names)
        slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
        cells.append(
            f'<mxCell id="A_{slug}" value="{escape(title.upper())}" '
            f'style="text;html=1;fontSize=15;fontStyle=1;fontColor={stroke};align=left;verticalAlign=middle;" '
            f'vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="-46" width="{spans * GAP_SUBCOL}" height="28" as="geometry"/></mxCell>'
        )

        sub, y = 0, 0
        for name in names:
            rows = tables[name]
            height = HDR + ROW * len(rows)
            if y and y + height > MAX_Y:
                sub, y = sub + 1, 0
            table_id = f'T_{name}'
            cells.append(
                f'<mxCell id="{table_id}" value="{escape(name)}" style="shape=table;startSize={HDR};container=1;'
                f'collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;'
                f'resizeLast=1;html=1;fontSize=13;fillColor={fill};strokeColor={stroke};" vertex="1" parent="1">'
                f'<mxGeometry x="{x + sub * GAP_SUBCOL}" y="{y}" width="{W}" height="{height}" as="geometry"/></mxCell>'
            )
            for i, column in enumerate(rows):
                row_id = f'R_{name}_{column["name"]}'
                key = ('PF' if column['pk'] and column['fk']
                       else 'PK' if column['pk']
                       else 'FK' if column['fk'] else '')
                # '?' marks a nullable column: shorter than 'NOT NULL' on the
                # majority of rows, and it is the exception that matters.
                label = f'{column["name"]}{"?" if column["null"] else ""} : {column["type"]}'
                cells.append(
                    f'<mxCell id="{row_id}" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;'
                    f'swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];'
                    f'portConstraint=eastwest;top=0;left=0;right=0;bottom=0;html=1;" vertex="1" parent="{table_id}">'
                    f'<mxGeometry y="{HDR + i * ROW}" width="{W}" height="{ROW}" as="geometry"/></mxCell>'
                )
                cells.append(
                    f'<mxCell id="{row_id}_k" value="{key}" style="shape=partialRectangle;connectable=0;'
                    f'fillColor=none;top=0;left=0;bottom=0;right=0;fontSize=9;fontStyle=1;fontColor={stroke};'
                    f'align=center;overflow=hidden;html=1;" vertex="1" parent="{row_id}">'
                    f'<mxGeometry width="{KEYW}" height="{ROW}" as="geometry"/></mxCell>'
                )
                cells.append(
                    f'<mxCell id="{row_id}_n" value="{escape(label)}" style="shape=partialRectangle;connectable=0;'
                    f'fillColor=none;top=0;left=0;bottom=0;right=0;align=left;spacingLeft=6;fontSize=11;'
                    f'{"fontStyle=1;" if column["pk"] else ""}overflow=hidden;html=1;" vertex="1" parent="{row_id}">'
                    f'<mxGeometry x="{KEYW}" width="{W - KEYW}" height="{ROW}" as="geometry"/></mxCell>'
                )
            placed.add(name)
            y += height + GAP_Y
        x += spans * GAP_SUBCOL + GAP_AREA

    # A new table that nobody assigned to an area would otherwise vanish from the
    # diagram without a word, which is the one failure worth being loud about.
    missing = sorted(set(tables) - placed)
    if missing:
        sys.exit(f'These tables are in no AREAS group, add them: {", ".join(missing)}')

    # The edge starts at the foreign-key row itself, so the line leaves the exact
    # column it belongs to rather than the middle of the table.
    for i, (src, dst, column) in enumerate(fks):
        edges.append(
            f'<mxCell id="E_{i}" style="edgeStyle=entityRelationEdgeStyle;rounded=0;html=1;exitX=0;exitY=0.5;'
            f'exitDx=0;exitDy=0;endArrow=ERone;endFill=0;startArrow=ERmany;startFill=0;strokeColor=#8c8c8c;'
            f'jumpStyle=arc;" edge="1" parent="1" source="R_{src}_{column}" target="T_{dst}">'
            f'<mxGeometry relative="1" as="geometry"/></mxCell>'
        )

    return cells, edges


LEGEND = (
    '<mxCell id="LEGEND" value="&lt;b&gt;Sema baze — app&lt;/b&gt;&lt;br&gt;'
    'Generisano iz zive baze (supabase/scripts/generate-erd.py). '
    'Izvor istine je supabase/migrations/ — ovaj fajl se ne crta rucno.&lt;br&gt;&lt;br&gt;'
    'PK primarni kljuc &amp;#183; FK strani kljuc &amp;#183; PF oba&lt;br&gt;'
    '&lt;b&gt;?&lt;/b&gt; posle imena kolone = dozvoljava NULL&lt;br&gt;'
    'Particije tabele ocitavanje nisu prikazane (24 mesecne).&lt;br&gt;'
    'Boja = domenska oblast, ista podela kao moduli u docs/backend-architecture.md." '
    'style="text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=12;spacing=8;'
    'fillColor=#f9f9f9;strokeColor=#b3b3b3;" vertex="1" parent="1">'
    '<mxGeometry x="40" y="-200" width="660" height="130" as="geometry"/></mxCell>'
)


def main():
    tables, fks = introspect()
    cells, edges = build(tables, fks)
    body = '\n        '.join([LEGEND] + cells + edges)
    xml = (
        '<mxfile host="app.diagrams.net" type="device">\n'
        '  <diagram name="app schema" id="app-schema">\n'
        '    <mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" '
        'arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">\n'
        '      <root>\n'
        '        <mxCell id="0" />\n'
        '        <mxCell id="1" parent="0" />\n'
        f'        {body}\n'
        '      </root>\n'
        '    </mxGraphModel>\n'
        '  </diagram>\n'
        '</mxfile>\n'
    )
    with io.open(os.path.normpath(OUT), 'w', encoding='utf-8') as handle:
        handle.write(xml)
    print(f'docs/schema.drawio: {len(tables)} tables, '
          f'{sum(len(v) for v in tables.values())} columns, {len(fks)} relations')


if __name__ == '__main__':
    main()
