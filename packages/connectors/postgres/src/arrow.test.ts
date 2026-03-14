import { describe, expect, it } from 'vitest';
import { Bool, Float64, Int32, Int64, TimestampMillisecond, Utf8 } from 'apache-arrow';
import { pgTypeToArrow, rowsToArrow } from './arrow';

describe('pgTypeToArrow', () => {
  it('maps integer types', () => {
    expect(pgTypeToArrow('int4')).toBeInstanceOf(Int32);
    expect(pgTypeToArrow('integer')).toBeInstanceOf(Int32);
    expect(pgTypeToArrow('int2')).toBeInstanceOf(Int32);
    expect(pgTypeToArrow('int8')).toBeInstanceOf(Int64);
    expect(pgTypeToArrow('bigint')).toBeInstanceOf(Int64);
  });

  it('maps float types', () => {
    expect(pgTypeToArrow('float4')).toBeInstanceOf(Float64);
    expect(pgTypeToArrow('float8')).toBeInstanceOf(Float64);
    expect(pgTypeToArrow('numeric')).toBeInstanceOf(Float64);
    expect(pgTypeToArrow('double precision')).toBeInstanceOf(Float64);
  });

  it('maps boolean', () => {
    expect(pgTypeToArrow('bool')).toBeInstanceOf(Bool);
    expect(pgTypeToArrow('boolean')).toBeInstanceOf(Bool);
  });

  it('maps text types', () => {
    expect(pgTypeToArrow('text')).toBeInstanceOf(Utf8);
    expect(pgTypeToArrow('varchar')).toBeInstanceOf(Utf8);
    expect(pgTypeToArrow('uuid')).toBeInstanceOf(Utf8);
    expect(pgTypeToArrow('jsonb')).toBeInstanceOf(Utf8);
  });

  it('maps timestamp types', () => {
    expect(pgTypeToArrow('timestamp')).toBeInstanceOf(TimestampMillisecond);
    expect(pgTypeToArrow('timestamptz')).toBeInstanceOf(TimestampMillisecond);
    expect(pgTypeToArrow('timestamp with time zone')).toBeInstanceOf(TimestampMillisecond);
  });

  it('falls back to Utf8 for unknown types', () => {
    expect(pgTypeToArrow('custom_type')).toBeInstanceOf(Utf8);
  });
});

describe('rowsToArrow', () => {
  it('returns empty result for no rows', () => {
    const result = rowsToArrow([], [{ name: 'id', dataTypeID: 23 }]);
    expect(result.rowCount).toBe(0);
    expect(result.buffer.length).toBe(0);
  });

  it('converts rows to Arrow IPC buffer', () => {
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    const fields = [
      { name: 'id', dataTypeID: 23, pgType: 'int4' },
      { name: 'name', dataTypeID: 25, pgType: 'text' },
    ];
    const result = rowsToArrow(rows, fields);
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(2);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('handles null values', () => {
    const rows = [{ id: 1, name: null }];
    const fields = [
      { name: 'id', dataTypeID: 23, pgType: 'int4' },
      { name: 'name', dataTypeID: 25, pgType: 'text' },
    ];
    const result = rowsToArrow(rows, fields);
    expect(result.rowCount).toBe(1);
  });
});
