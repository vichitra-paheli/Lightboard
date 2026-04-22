import { describe, expect, it } from 'vitest';

import {
  hydratePersistedMessage,
  summarizeToolResult,
  toPersistedMessagesWithNames,
} from './persisted';

describe('summarizeToolResult', () => {
  describe('run_sql / execute_query', () => {
    it('keeps small rowsets intact and reports row count in summary', () => {
      const raw = JSON.stringify({
        columns: ['a', 'b'],
        rowCount: 3,
        rows: [
          { a: 1, b: 2 },
          { a: 3, b: 4 },
          { a: 5, b: 6 },
        ],
      });
      const out = summarizeToolResult('run_sql', raw);
      const content = JSON.parse(out.content) as { rows: unknown[] };
      expect(content.rows).toHaveLength(3);
      expect(out.truncated).toBeUndefined();
      expect(out.summary).toBe('→ 3 rows');
    });

    it('caps oversized rowsets at 20 rows and flags truncated', () => {
      const rows = Array.from({ length: 250 }, (_, i) => ({ id: i, val: `row_${i}` }));
      const raw = JSON.stringify({ columns: ['id', 'val'], rowCount: 250, rows });
      const out = summarizeToolResult('run_sql', raw);
      const content = JSON.parse(out.content) as {
        rows: unknown[];
        truncatedRowCount?: number;
      };
      expect(content.rows).toHaveLength(20);
      expect(content.truncatedRowCount).toBe(250);
      expect(out.truncated).toBe(true);
      expect(out.summary).toBe('→ 250 rows');
    });

    it('treats execute_query the same as run_sql', () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({ id: i }));
      const raw = JSON.stringify({ rowCount: 30, rows });
      const out = summarizeToolResult('execute_query', raw);
      const content = JSON.parse(out.content) as { rows: unknown[] };
      expect(content.rows).toHaveLength(20);
      expect(out.truncated).toBe(true);
    });
  });

  describe('create_view / modify_view', () => {
    it('preserves the full HTML payload — never truncates a view', () => {
      const html = '<html>'.padEnd(50_000, 'x');
      const raw = JSON.stringify({
        viewSpec: { html, title: 'Test view', sql: 'SELECT 1' },
      });
      const out = summarizeToolResult('create_view', raw);
      expect(out.content).toBe(raw);
      expect(out.truncated).toBeUndefined();
      expect(out.summary).toBe('→ view created');
    });

    it('keeps modify_view payloads intact', () => {
      const raw = JSON.stringify({ viewSpec: { html: '<svg/>', title: 'V2' } });
      const out = summarizeToolResult('modify_view', raw);
      expect(out.content).toBe(raw);
      expect(out.summary).toBe('→ view updated');
    });
  });

  describe('delegate_* / await_tasks', () => {
    it('drops data.rows from a delegate_query result', () => {
      const raw = JSON.stringify({
        success: true,
        role: 'query',
        summary: 'returned 412 rows',
        scratchpad_table: 'query_1',
        data: {
          columns: ['a'],
          rows: Array.from({ length: 412 }, (_, i) => ({ a: i })),
        },
      });
      const out = summarizeToolResult('delegate_query', raw);
      const parsed = JSON.parse(out.content) as {
        data?: { rows?: unknown };
        success?: boolean;
        role?: string;
        scratchpad_table?: string;
        summary?: string;
      };
      expect(parsed.success).toBe(true);
      expect(parsed.role).toBe('query');
      expect(parsed.summary).toBe('returned 412 rows');
      expect(parsed.scratchpad_table).toBe('query_1');
      expect(parsed.data?.rows).toBeUndefined();
    });

    it('keeps viewSpec inside a delegate_view result', () => {
      const raw = JSON.stringify({
        success: true,
        role: 'view',
        summary: 'rendered chart',
        viewSpec: { html: '<svg/>', title: 'Chart' },
      });
      const out = summarizeToolResult('delegate_view', raw);
      const parsed = JSON.parse(out.content) as {
        viewSpec?: { html?: string };
      };
      expect(parsed.viewSpec?.html).toBe('<svg/>');
    });

    it('strips data.rows from each entry of an await_tasks map', () => {
      const raw = JSON.stringify({
        task_query_1: {
          success: true,
          role: 'query',
          summary: '120 rows',
          data: { rows: [{ a: 1 }, { a: 2 }, { a: 3 }] },
          data_summary: { rowCount: 120 },
        },
        task_view_1: {
          success: true,
          role: 'view',
          summary: 'view ok',
          viewSpec: { html: '<svg/>', title: 'V' },
        },
      });
      const out = summarizeToolResult('await_tasks', raw);
      const parsed = JSON.parse(out.content) as Record<string, {
        data?: { rows?: unknown };
        data_summary?: { rowCount?: number };
        viewSpec?: { html?: string };
      }>;
      expect(parsed.task_query_1!.data?.rows).toBeUndefined();
      expect(parsed.task_query_1!.data_summary?.rowCount).toBe(120);
      expect(parsed.task_view_1!.viewSpec?.html).toBe('<svg/>');
    });
  });

  describe('analyze_table', () => {
    it('keeps columns / rowCount / findings / first 5 sample rows', () => {
      const raw = JSON.stringify({
        columns: ['a', 'b'],
        rowCount: 999,
        findings: ['outlier in column a'],
        sampleRows: Array.from({ length: 50 }, (_, i) => ({ a: i, b: i * 2 })),
      });
      const out = summarizeToolResult('analyze_table', raw);
      const parsed = JSON.parse(out.content) as {
        columns?: string[];
        rowCount?: number;
        findings?: string[];
        sampleRows?: unknown[];
      };
      expect(parsed.columns).toEqual(['a', 'b']);
      expect(parsed.rowCount).toBe(999);
      expect(parsed.findings).toEqual(['outlier in column a']);
      expect(parsed.sampleRows).toHaveLength(5);
    });
  });

  describe('load_scratchpad', () => {
    it('replaces content with a scratchpad_not_restored stub', () => {
      const raw = JSON.stringify({
        id: 'query_3',
        rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
        rowCount: 3,
      });
      const out = summarizeToolResult('load_scratchpad', raw);
      const parsed = JSON.parse(out.content) as {
        note: string;
        requestedId?: string;
      };
      expect(parsed.note).toBe('scratchpad_not_restored');
      expect(parsed.requestedId).toBe('query_3');
    });

    it('still emits a stub even when the original output had no id', () => {
      const out = summarizeToolResult('load_scratchpad', '"raw text without an id"');
      const parsed = JSON.parse(out.content) as { note: string };
      expect(parsed.note).toBe('scratchpad_not_restored');
    });
  });

  describe('get_schema / describe_table / propose_schema_doc', () => {
    it('keeps schema payloads intact when small', () => {
      const raw = JSON.stringify({ tables: [{ name: 'users', columns: [] }] });
      const out = summarizeToolResult('get_schema', raw);
      expect(out.content).toBe(raw);
      expect(out.truncated).toBeUndefined();
    });
  });

  describe('fallback', () => {
    it('truncates oversize fallback content at 16 KB and flags it', () => {
      const big = 'x'.repeat(20_000);
      const out = summarizeToolResult('some_unknown_tool', big);
      expect(out.truncated).toBe(true);
      expect(out.content.endsWith('...[truncated]')).toBe(true);
      // Body itself should be exactly 16 KB before the suffix.
      expect(out.content.length).toBe(16_384 + '...[truncated]'.length);
    });

    it('leaves small fallback content alone', () => {
      const small = 'short result';
      const out = summarizeToolResult('some_unknown_tool', small);
      expect(out.content).toBe(small);
      expect(out.truncated).toBeUndefined();
    });
  });

  describe('errors', () => {
    it('marks isError and keeps the raw error string under the cap', () => {
      const out = summarizeToolResult('run_sql', 'syntax error at "SELET"', true);
      expect(out.isError).toBe(true);
      expect(out.content).toBe('syntax error at "SELET"');
      expect(out.summary).toBe('→ error');
    });
  });
});

describe('toPersistedMessagesWithNames', () => {
  it('numbers rows starting at priorSeq + 1 and resolves tool names from prior toolCalls', () => {
    const msgs = [
      { role: 'user' as const, content: 'top batters?' },
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: [{ id: 'tc1', name: 'run_sql', input: { sql: 'SELECT 1' } }],
      },
      {
        role: 'user' as const,
        content: '',
        toolResults: [
          {
            toolCallId: 'tc1',
            content: JSON.stringify({
              rowCount: 3,
              rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
            }),
          },
        ],
      },
    ];

    const rows = toPersistedMessagesWithNames(msgs, 5);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.sequence)).toEqual([6, 7, 8]);
    // The third row's tool result was looked up against tc1 from row 2 and
    // routed through the run_sql rule (which keeps the rows intact under cap).
    expect(rows[2]!.toolResults![0]!.toolName).toBe('run_sql');
    expect(rows[2]!.toolResults![0]!.summary).toBe('→ 3 rows');
  });

  it('hoists the HTML payload from create_view onto the row viewSpec column', () => {
    const html = '<svg>...</svg>';
    const msgs = [
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: [{ id: 'tc-view', name: 'create_view', input: { title: 'X' } }],
      },
      {
        role: 'user' as const,
        content: '',
        toolResults: [
          {
            toolCallId: 'tc-view',
            content: JSON.stringify({
              viewSpec: { html, title: 'X', sql: 'SELECT 1' },
            }),
          },
        ],
      },
    ];

    const rows = toPersistedMessagesWithNames(msgs, 0);
    expect(rows[1]!.viewSpec).toMatchObject({ html, title: 'X', sql: 'SELECT 1' });
  });
});

describe('hydratePersistedMessage', () => {
  it('round-trips role + content + toolCalls + toolResults', () => {
    const msg = hydratePersistedMessage({
      role: 'user',
      content: '',
      toolCalls: null,
      toolResults: [
        {
          toolCallId: 'tc1',
          toolName: 'run_sql',
          content: '{"rowCount":3}',
          isError: false,
        },
      ],
    });
    expect(msg.toolResults).toEqual([
      { toolCallId: 'tc1', content: '{"rowCount":3}' },
    ]);
    expect(msg.toolCalls).toBeUndefined();
  });
});
