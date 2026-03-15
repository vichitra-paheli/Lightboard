import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatMessage, type ChatMessageData } from './chat-message';

afterEach(() => {
  cleanup();
});

describe('ChatMessage', () => {
  it('renders user message as plain text', () => {
    const msg: ChatMessageData = { id: '1', role: 'user', content: 'Hello world' };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    const msg: ChatMessageData = { id: '2', role: 'assistant', content: '**bold text**' };
    render(<ChatMessage message={msg} />);
    const bold = screen.getByText('bold text');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders inline code in assistant messages', () => {
    const msg: ChatMessageData = { id: '3', role: 'assistant', content: 'Use `console.log`' };
    render(<ChatMessage message={msg} />);
    const code = screen.getByText('console.log');
    expect(code.tagName).toBe('CODE');
  });

  it('renders a GFM table in assistant messages', () => {
    const md = '| Name | Age |\n|------|-----|\n| Alice | 30 |';
    const msg: ChatMessageData = { id: '4', role: 'assistant', content: md };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('displays activeAgent label when provided', () => {
    const msg: ChatMessageData = { id: '5', role: 'assistant', content: 'Hi', activeAgent: 'SQL Agent' };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('SQL Agent')).toBeInTheDocument();
  });

  it('does not render activeAgent label when not provided', () => {
    const msg: ChatMessageData = { id: '6', role: 'assistant', content: 'Hi' };
    render(<ChatMessage message={msg} />);
    expect(screen.queryByText('SQL Agent')).not.toBeInTheDocument();
  });

  it('renders tool call badges with correct status icons', () => {
    const msg: ChatMessageData = {
      id: '7',
      role: 'assistant',
      content: 'Running query',
      toolCalls: [
        { name: 'run_sql', status: 'done' },
        { name: 'get_schema', status: 'error' },
      ],
    };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('run_sql')).toBeInTheDocument();
    expect(screen.getByText('get_schema')).toBeInTheDocument();
  });

  it('shows streaming cursor when isStreaming is true', () => {
    const msg: ChatMessageData = { id: '8', role: 'assistant', content: 'Loading', isStreaming: true };
    const { container } = render(<ChatMessage message={msg} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});

describe('ChatMessage thinking section', () => {
  it('renders collapsed thinking section when thinking is provided', () => {
    const msg: ChatMessageData = {
      id: '9',
      role: 'assistant',
      content: 'Result',
      thinking: 'Let me analyze this query...',
    };
    render(<ChatMessage message={msg} />);
    expect(screen.getByTestId('thinking-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('thinking-content')).not.toBeInTheDocument();
  });

  it('expands thinking content when toggle is clicked', () => {
    const msg: ChatMessageData = {
      id: '10',
      role: 'assistant',
      content: 'Result',
      thinking: 'Let me analyze this query...',
    };
    render(<ChatMessage message={msg} />);
    fireEvent.click(screen.getByTestId('thinking-toggle'));
    expect(screen.getByTestId('thinking-content')).toBeInTheDocument();
    expect(screen.getByText('Let me analyze this query...')).toBeInTheDocument();
  });

  it('collapses thinking content on second click', () => {
    const msg: ChatMessageData = {
      id: '11',
      role: 'assistant',
      content: 'Result',
      thinking: 'Reasoning text',
    };
    render(<ChatMessage message={msg} />);
    const toggle = screen.getByTestId('thinking-toggle');
    fireEvent.click(toggle);
    expect(screen.getByTestId('thinking-content')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('thinking-content')).not.toBeInTheDocument();
  });

  it('shows animated dots when thinking is streaming', () => {
    const msg: ChatMessageData = {
      id: '12',
      role: 'assistant',
      content: '',
      thinking: 'Thinking...',
      isStreaming: true,
    };
    render(<ChatMessage message={msg} />);
    expect(screen.getByTestId('thinking-dots')).toBeInTheDocument();
  });

  it('does not show animated dots when thinking is complete', () => {
    const msg: ChatMessageData = {
      id: '13',
      role: 'assistant',
      content: 'Done',
      thinking: 'Thought about it',
      isStreaming: false,
    };
    render(<ChatMessage message={msg} />);
    expect(screen.queryByTestId('thinking-dots')).not.toBeInTheDocument();
  });
});
