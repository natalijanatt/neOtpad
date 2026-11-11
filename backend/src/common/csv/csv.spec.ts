import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('strips the BOM the scraper writes, so the first column name is usable', () => {
    const rows = parseCsv('﻿location_id,naziv\nSEPA-01,Krupac\n');

    expect(rows[0]!['location_id']).toBe('SEPA-01');
  });

  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv('id,napomena\n1,"Krupac, Pirot, 732397"\n');

    expect(rows[0]!['napomena']).toBe('Krupac, Pirot, 732397');
  });

  it('reads a doubled quote as one character', () => {
    const rows = parseCsv('id,opis\n1,"plan navodi ""3000 m3 i vise"""\n');

    expect(rows[0]!['opis']).toBe('plan navodi "3000 m3 i vise"');
  });

  it('handles CRLF and a trailing newline without inventing an empty row', () => {
    const rows = parseCsv('id,naziv\r\n1,Krupac\r\n');

    expect(rows).toHaveLength(1);
  });

  it('keeps empty cells empty rather than dropping the column', () => {
    const rows = parseCsv('id,povrsina_m2,zapremina_m3\n1,,300\n');

    expect(rows[0]).toEqual({ id: '1', povrsina_m2: '', zapremina_m3: '300' });
  });

  it('refuses a row with the wrong number of cells', () => {
    // Padding it would shift povrsina_m2 into zapremina_m3 and import cleanly.
    expect(() => parseCsv('id,povrsina_m2,zapremina_m3\n1,300\n')).toThrow(/row 2/);
  });
});
