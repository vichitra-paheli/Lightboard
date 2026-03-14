import {
  Bool,
  type DataType,
  Float64,
  Int32,
  Int64,
  tableFromArrays,
  tableToIPC,
  TimestampMillisecond,
  Utf8,
} from 'apache-arrow';
import type { ArrowRecordBatch, ArrowResult } from '@lightboard/connector-sdk';

/** Maps PostgreSQL type names to Arrow data types. */
const PG_TO_ARROW: Record<string, DataType> = {
  int2: new Int32(),
  int4: new Int32(),
  int8: new Int64(),
  smallint: new Int32(),
  integer: new Int32(),
  bigint: new Int64(),
  float4: new Float64(),
  float8: new Float64(),
  real: new Float64(),
  'double precision': new Float64(),
  numeric: new Float64(),
  decimal: new Float64(),
  bool: new Bool(),
  boolean: new Bool(),
  text: new Utf8(),
  varchar: new Utf8(),
  'character varying': new Utf8(),
  char: new Utf8(),
  character: new Utf8(),
  name: new Utf8(),
  uuid: new Utf8(),
  json: new Utf8(),
  jsonb: new Utf8(),
  timestamp: new TimestampMillisecond(),
  timestamptz: new TimestampMillisecond(),
  'timestamp without time zone': new TimestampMillisecond(),
  'timestamp with time zone': new TimestampMillisecond(),
  date: new Utf8(),
  time: new Utf8(),
  interval: new Utf8(),
};

/** Returns the Arrow DataType for a Postgres type name. Falls back to Utf8. */
export function pgTypeToArrow(pgType: string): DataType {
  return PG_TO_ARROW[pgType.toLowerCase()] ?? new Utf8();
}

/**
 * Converts pg query result rows into an Arrow IPC buffer.
 * Each column is mapped from its Postgres type to the corresponding Arrow type.
 */
export function rowsToArrow(
  rows: Record<string, unknown>[],
  fields: { name: string; dataTypeID: number; pgType?: string }[],
): ArrowResult {
  if (rows.length === 0) {
    return { buffer: new Uint8Array(), rowCount: 0, columnCount: fields.length };
  }

  // Build column arrays keyed by field name
  const columnData: Record<string, unknown[]> = {};
  for (const f of fields) {
    columnData[f.name] = rows.map((row) => {
      const val = row[f.name];
      if (val === null || val === undefined) return null;
      if (val instanceof Date) return val.getTime();
      return val;
    });
  }

  const table = tableFromArrays(columnData);
  const buffer = tableToIPC(table);

  return {
    buffer: new Uint8Array(buffer),
    rowCount: rows.length,
    columnCount: fields.length,
  };
}

/**
 * Converts a batch of rows into an Arrow record batch for streaming.
 */
export function rowsToArrowBatch(
  rows: Record<string, unknown>[],
  fields: { name: string; dataTypeID: number; pgType?: string }[],
): ArrowRecordBatch {
  const result = rowsToArrow(rows, fields);
  return { buffer: result.buffer, rowCount: result.rowCount };
}
