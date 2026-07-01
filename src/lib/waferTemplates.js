const DEFAULT_WAFER_TEMPLATE_ID = "wafer-undefined-chip-size";
const DEFAULT_WAFER_TEMPLATE_NAME = "Wafer-Undefined Chip Size";

const BOTTOM_NOTCH_101_TEMPLATE = `
ChipID	Column	Row
1	4	9
2	5	9
3	6	9
4	7	9
5	8	9
6	9	9
7	10	9
8	2	8
9	3	8
10	4	8
11	5	8
12	6	8
13	7	8
14	8	8
15	9	8
16	10	8
17	11	8
18	12	8
19	1	7
20	2	7
21	3	7
22	4	7
23	5	7
24	6	7
25	7	7
26	8	7
27	9	7
28	10	7
29	11	7
30	12	7
31	13	7
32	1	6
33	2	6
34	3	6
35	4	6
36	5	6
37	6	6
38	7	6
39	8	6
40	9	6
41	10	6
42	11	6
43	12	6
44	13	6
45	1	5
46	2	5
47	3	5
48	4	5
49	5	5
50	6	5
51	7	5
52	8	5
53	9	5
54	10	5
55	11	5
56	12	5
57	13	5
58	1	4
59	2	4
60	3	4
61	4	4
62	5	4
63	6	4
64	7	4
65	8	4
66	9	4
67	10	4
68	11	4
69	12	4
70	13	4
71	1	3
72	2	3
73	3	3
74	4	3
75	5	3
76	6	3
77	7	3
78	8	3
79	9	3
80	10	3
81	11	3
82	12	3
83	13	3
84	2	2
85	3	2
86	4	2
87	5	2
88	6	2
89	7	2
90	8	2
91	9	2
92	10	2
93	11	2
94	12	2
95	4	1
96	5	1
97	6	1
98	7	1
99	8	1
100	9	1
101	10	1
`;

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseTemplateRows(text) {
  return String(text || "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [chipId, column, row] = line.split(/\s+/);
      return {
        chipId: `Chip${Number(chipId)}`,
        chipNumber: Number(chipId),
        dieX: Number(column),
        dieY: Number(row)
      };
    })
    .filter((entry) => Number.isFinite(entry.chipNumber) && Number.isFinite(entry.dieX) && Number.isFinite(entry.dieY));
}

function normalizeLayout(layout = []) {
  return layout
    .map((entry, index) => {
      const chipNumber = toNumber(entry.chipNumber) ?? chipNumberFromId(entry.chipId) ?? index + 1;
      const dieX = toNumber(entry.dieX ?? entry.column);
      const dieY = toNumber(entry.dieY ?? entry.row);
      if (!Number.isFinite(chipNumber) || !Number.isFinite(dieX) || !Number.isFinite(dieY)) return null;
      return {
        chipId: entry.chipId || `Chip${chipNumber}`,
        chipNumber,
        dieX,
        dieY
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.dieY - a.dieY) || (a.dieX - b.dieX));
}

function layoutToMap(layout = []) {
  return new Map(normalizeLayout(layout).map((entry) => [entry.chipNumber, { dieX: entry.dieX, dieY: entry.dieY }]));
}

const BUILT_IN_TEMPLATES = [
  {
    id: DEFAULT_WAFER_TEMPLATE_ID,
    name: DEFAULT_WAFER_TEMPLATE_NAME,
    notchOrientation: "south",
    layout: parseTemplateRows(BOTTOM_NOTCH_101_TEMPLATE),
    source: "built-in",
    description: "Reference bottom-notch wafer template imported from the existing WST chip population."
  }
];

function resolveTemplateRecord(templateOrId = DEFAULT_WAFER_TEMPLATE_ID) {
  if (Array.isArray(templateOrId)) {
    return {
      id: "ad-hoc-layout",
      name: "Ad hoc layout",
      layout: normalizeLayout(templateOrId)
    };
  }

  if (templateOrId && typeof templateOrId === "object") {
    return {
      ...templateOrId,
      layout: normalizeLayout(templateOrId.layout || [])
    };
  }

  return BUILT_IN_TEMPLATES.find((template) => template.id === templateOrId) || BUILT_IN_TEMPLATES[0];
}

function clampInteger(value, fallback, minimum = 1) {
  return Math.max(Math.round(toNumber(value, fallback)), minimum);
}

export function chipNumberFromId(chipId) {
  const match = String(chipId || "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function shortChipLabel(chipId) {
  const number = chipNumberFromId(chipId);
  return number === null ? String(chipId || "") : String(number);
}

export function getBuiltInWaferTemplates() {
  return BUILT_IN_TEMPLATES.map((template) => ({
    ...template,
    layout: normalizeLayout(template.layout)
  }));
}

export function buildWaferTemplateDefinition(definition = {}) {
  return {
    id: definition.id || `wafer-template-${Date.now()}`,
    name: definition.name || "Custom Wafer Template",
    rows: clampInteger(definition.rows, 9),
    columns: clampInteger(definition.columns, 13),
    rowSpacing: toNumber(definition.rowSpacing, 1),
    columnSpacing: toNumber(definition.columnSpacing, 1),
    chipLengthX: Math.max(toNumber(definition.chipLengthX, 1), 0.1),
    chipWidthY: Math.max(toNumber(definition.chipWidthY, 1), 0.1),
    notchOrientation: definition.notchOrientation || "south",
    source: definition.source || "custom",
    description: definition.description || "User-generated center-filled wafer template.",
    layout: normalizeLayout(definition.layout || [])
  };
}

export function createCenterFilledWaferTemplate(definition = {}) {
  const rows = clampInteger(definition.rows, 9);
  const columns = clampInteger(definition.columns, 13);
  const rowSpacing = Math.max(toNumber(definition.rowSpacing, 1), 0.1);
  const columnSpacing = Math.max(toNumber(definition.columnSpacing, 1), 0.1);
  const chipLengthX = Math.max(toNumber(definition.chipLengthX, 1), 0.1);
  const chipWidthY = Math.max(toNumber(definition.chipWidthY, 1), 0.1);
  const radius = 100;
  const cellWidth = Math.max(chipLengthX + columnSpacing, 0.1);
  const cellHeight = Math.max(chipWidthY + rowSpacing, 0.1);
  const xCenter = (columns + 1) / 2;
  const yCenter = (rows + 1) / 2;
  const slots = [];

  for (let row = rows; row >= 1; row -= 1) {
    for (let column = 1; column <= columns; column += 1) {
      const offsetX = (column - xCenter) * cellWidth;
      const offsetY = (row - yCenter) * cellHeight;
      const chipRadius = Math.hypot(offsetX, offsetY);
      const edgeAllowance = Math.max(Math.hypot(chipLengthX, chipWidthY) / 2, Math.max(cellWidth, cellHeight) * 0.35);
      if (chipRadius <= radius - edgeAllowance) {
        slots.push({ column, row, radius: chipRadius });
      }
    }
  }

  slots.sort((a, b) => a.radius - b.radius || b.row - a.row || a.column - b.column);

  const numberedLayout = slots
    .map((slot, index) => ({
      chipId: `Chip${index + 1}`,
      chipNumber: index + 1,
      dieX: slot.column,
      dieY: slot.row
    }))
    .sort((a, b) => (b.dieY - a.dieY) || (a.dieX - b.dieX));

  return buildWaferTemplateDefinition({
    ...definition,
    rows,
    columns,
    rowSpacing,
    columnSpacing,
    chipLengthX,
    chipWidthY,
    layout: numberedLayout
  });
}

export function getWaferTemplateCoordinate(chipId, templateOrId = DEFAULT_WAFER_TEMPLATE_ID) {
  const chipNumber = chipNumberFromId(chipId);
  if (chipNumber === null) return null;
  return layoutToMap(resolveTemplateRecord(templateOrId).layout).get(chipNumber) || null;
}

export function getWaferTemplateLayout(templateOrId = DEFAULT_WAFER_TEMPLATE_ID) {
  return resolveTemplateRecord(templateOrId).layout;
}

export function getWaferTemplateMeta(templateOrId = DEFAULT_WAFER_TEMPLATE_ID) {
  const { layout, ...meta } = resolveTemplateRecord(templateOrId);
  return {
    ...meta,
    layout: normalizeLayout(layout)
  };
}

export function applyWaferTemplate(row, templateOrId = DEFAULT_WAFER_TEMPLATE_ID) {
  if (row.die_x !== null && row.die_x !== undefined && row.die_y !== null && row.die_y !== undefined) {
    return row;
  }

  const coordinate = getWaferTemplateCoordinate(row.chip_id, templateOrId);
  if (!coordinate) return row;

  return {
    ...row,
    die_x: coordinate.dieX,
    die_y: coordinate.dieY
  };
}

export function defaultWaferTemplateId() {
  return DEFAULT_WAFER_TEMPLATE_ID;
}
