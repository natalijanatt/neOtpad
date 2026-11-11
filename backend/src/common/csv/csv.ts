/**
 * RFC 4180 reader for the `waste-scraper/data/` exports.
 *
 * Hand-rolled rather than added as a dependency: the files are a few dozen rows
 * each, the only awkward part is quoted fields (`napomena` and `spajanje_razlog`
 * both contain commas), and a reader short enough to read end to end is easier
 * to trust than a dependency nobody in the repo has configured yet.
 */

export type CsvRow = Readonly<Record<string, string>>;

/**
 * Parses a whole file. A row whose cell count differs from the header throws
 * rather than being padded: in a file where half the columns are legitimately
 * empty, a silent off-by-one shifts `povrsina_m2` into `zapremina_m3` and the
 * import still "succeeds".
 */
export function parseCsv(text: string): CsvRow[] {
  const [header, ...body] = splitRows(text);

  if (header === undefined) {
    return [];
  }

  return body
    // The exports end with a newline, which leaves one empty trailing row.
    .filter((cells) => cells.some((cell) => cell.length > 0))
    .map((cells, index) => {
      if (cells.length !== header.length) {
        throw new Error(
          `CSV row ${index + 2}: expected ${header.length} cells, found ${cells.length}`,
        );
      }

      return Object.fromEntries(header.map((name, i) => [name, cells[i]!]));
    });
}

function splitRows(text: string): string[][] {
  // The scraper writes UTF-8 with a BOM; left in place it becomes part of the
  // first column name and every lookup of `kanonski_id` returns undefined.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    switch (ch) {
      case '"':
        quoted = true;
        break;
      case ',':
        row.push(field);
        field = '';
        break;
      case '\r':
        break; // CRLF: the LF below closes the row.
      case '\n':
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        break;
      default:
        field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
