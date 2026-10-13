// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrainingLayout } from './TrainingLayout';

describe('TrainingLayout', () => {
  it('shows a placeholder in the side column until there is feedback', () => {
    render(<TrainingLayout main={<p>Tisch</p>} side={false} />);
    expect(screen.getByText('Tisch').closest('.training-layout__main')).toBeTruthy();
    expect(screen.getByText(/Deine Auswertung erscheint hier/).closest('.training-layout__side')).toBeTruthy();
  });

  it('puts the feedback into the side column', () => {
    render(<TrainingLayout main={<p>Tisch</p>} side={<p>Richtig</p>} />);
    expect(screen.getByText('Richtig').closest('.training-layout__side')).toBeTruthy();
    expect(screen.queryByText(/Deine Auswertung erscheint hier/)).toBeNull();
  });
});
