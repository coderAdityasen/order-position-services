import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';

export type CsvRow = {
  recordNumber: number;
  row: Record<string, string>;
};

/**
 * Streams CSV records one at a time. The file is never loaded as a whole.
 */
export async function* streamCsvRows(filePath: string): AsyncGenerator<CsvRow> {
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      relax_quotes: true,
    }),
  );

  let recordNumber = 0;
  try {
    for await (const record of parser) {
      recordNumber += 1;
      yield {
        recordNumber,
        row: record as Record<string, string>,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to parse CSV at record ${recordNumber + 1}: ${message}`);
  }
}
