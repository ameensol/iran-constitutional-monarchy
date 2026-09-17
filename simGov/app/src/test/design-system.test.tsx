import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, Dialog, Progress } from '../design-system';

describe('design system primitives', () => {
  it('exposes disabled and progress semantics', () => {
    render(<><Button disabled>Unavailable</Button><Progress value={66} label="Article review" /></>);
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '66');
  });

  it('closes a dialog with Escape', () => {
    const close = vi.fn();
    render(<Dialog open title="Confirm" onClose={close}>Body</Dialog>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });
});
