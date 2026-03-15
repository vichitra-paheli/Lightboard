import { describe, expect, it } from 'vitest';
import { DataSourceError } from './data-source-service';

describe('DataSourceError', () => {
  it('creates an error with type and message', () => {
    const error = new DataSourceError('Not found', 'not_found');
    expect(error.message).toBe('Not found');
    expect(error.type).toBe('not_found');
    expect(error.name).toBe('DataSourceError');
  });

  it('is an instance of Error', () => {
    const error = new DataSourceError('Test', 'query');
    expect(error).toBeInstanceOf(Error);
  });
});
