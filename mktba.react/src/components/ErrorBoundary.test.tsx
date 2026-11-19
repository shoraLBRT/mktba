import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import { ErrorBoundary } from './ErrorBoundary';

const Thrower = (): never => {
  throw new Error('boom');
};

const renderBoundary = (resetKey: string, child: React.ReactNode) => (
  <LocalizationProvider>
    <MemoryRouter>
      <ErrorBoundary resetKey={resetKey}>{child}</ErrorBoundary>
    </MemoryRouter>
  </LocalizationProvider>
);

beforeEach(() => {
  // React and the boundary both log a caught render error; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('given a healthy child, when rendered, then shows the child', () => {
    render(renderBoundary('/a', <p>content</p>));

    expect(screen.getByText('content')).toBeTruthy();
  });

  it('given a child that throws, when rendered, then shows the Russian fallback with a way back', () => {
    render(renderBoundary('/a', <Thrower />));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Что-то пошло не так' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Обновить страницу' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'На главную' }).getAttribute('href')).toBe('/');
  });

  it('given a caught error, when the reset key changes, then renders the new children again', () => {
    const { rerender } = render(renderBoundary('/a', <Thrower />));

    rerender(renderBoundary('/b', <p>next page</p>));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('next page')).toBeTruthy();
  });
});
