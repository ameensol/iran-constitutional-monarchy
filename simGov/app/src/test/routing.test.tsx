import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import RootApp from '../RootApp';

describe('public routing and locale', () => {
  it('renders the public landing route without critical accessibility violations', async () => {
    history.replaceState({}, '', '/en');
    render(<RootApp />);
    expect(await screen.findByRole('heading', { name: 'A constitution you can test.' })).toBeInTheDocument();
    const report = await axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(report.violations.filter((violation) => violation.impact === 'critical')).toHaveLength(0);
  });

  it('switches direction and preserves the current route', async () => {
    history.replaceState({}, '', '/en/learn');
    render(<RootApp />);
    expect(await screen.findByRole('heading', { name: 'Constitutional power, one relationship at a time.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'فا' }));
    await waitFor(() => expect(location.pathname).toBe('/fa/learn'));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('dir', 'rtl'));
  });
});
