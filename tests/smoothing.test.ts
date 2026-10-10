import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AngleSmoother, circularMean } from '../src/core/smoothing.ts';

const FRAME_MS = 1000 / 60;

/** Runs the smoother towards one target and returns every intermediate unwrapped angle. */
function run(smoother: AngleSmoother, target: number, frames: number): number[] {
  const path: number[] = [];
  for (let i = 0; i < frames; i++) path.push(smoother.update(target, FRAME_MS));
  return path;
}

describe('AngleSmoother', () => {
  it('snaps to the first reading instead of sweeping in from zero', () => {
    const smoother = new AngleSmoother();
    assert.equal(smoother.wrapped, null);
    assert.equal(smoother.update(217, FRAME_MS), 217);
    assert.equal(smoother.wrapped, 217);
  });

  it('crosses north clockwise without a full spin (350 -> 10)', () => {
    const smoother = new AngleSmoother();
    smoother.update(350, FRAME_MS);
    const path = run(smoother, 10, 120);
    let previous = 350;
    for (const angle of path) {
      assert.ok(angle >= previous - 1e-9, `angle went backwards: ${previous} -> ${angle}`);
      assert.ok(angle <= 370 + 1e-9, `overshot: ${angle}`);
      previous = angle;
    }
    assert.ok(Math.abs(path.at(-1)! - 370) < 0.1, `should settle at 370 (=10), got ${path.at(-1)}`);
    assert.ok(Math.abs(smoother.wrapped! - 10) < 0.1);
  });

  it('crosses north anticlockwise without a full spin (10 -> 350)', () => {
    const smoother = new AngleSmoother();
    smoother.update(10, FRAME_MS);
    const path = run(smoother, 350, 120);
    let previous = 10;
    for (const angle of path) {
      assert.ok(angle <= previous + 1e-9, `angle went forwards: ${previous} -> ${angle}`);
      assert.ok(angle >= -10 - 1e-9, `overshot: ${angle}`);
      previous = angle;
    }
    assert.ok(Math.abs(path.at(-1)! + 10) < 0.1, `should settle at -10 (=350), got ${path.at(-1)}`);
    assert.ok(Math.abs(smoother.wrapped! - 350) < 0.1);
  });

  it('never moves more than the remaining error in one step', () => {
    const smoother = new AngleSmoother();
    smoother.update(0, FRAME_MS);
    const first = smoother.update(90, FRAME_MS);
    assert.ok(first > 0 && first < 90);
    // Even a huge gap between frames (app was suspended) must not overshoot.
    const late = smoother.update(90, 60_000);
    assert.ok(late > first && late <= 90);
  });

  it('keeps turning the same way through several full rotations', () => {
    const smoother = new AngleSmoother();
    smoother.update(0, FRAME_MS);
    let target = 0;
    let previous = 0;
    for (let i = 0; i < 2000; i++) {
      target = (target + 2) % 360; // phone spun steadily clockwise
      const angle = smoother.update(target, FRAME_MS);
      assert.ok(angle >= previous - 1e-9, 'steady clockwise turn must never jump back');
      previous = angle;
    }
    assert.ok(previous > 3600, 'unwrapped angle keeps accumulating');
  });

  it('is responsive: a 90° turn is mostly followed within a third of a second', () => {
    const smoother = new AngleSmoother();
    smoother.update(0, FRAME_MS);
    const path = run(smoother, 90, 20);
    assert.ok(path.at(-1)! > 75, `after 20 frames expected > 75°, got ${path.at(-1)}`);
  });

  it('damps compass jitter around a steady heading', () => {
    const smoother = new AngleSmoother();
    smoother.update(0, FRAME_MS);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 600; i++) {
      // ±4° of noise wobbling across north
      const noisy = (360 + (i % 2 === 0 ? 4 : -4)) % 360;
      const angle = smoother.update(noisy, FRAME_MS);
      if (i > 60) {
        min = Math.min(min, angle);
        max = Math.max(max, angle);
      }
    }
    assert.ok(max - min < 2, `jitter should shrink well below the ±4° input, got ${max - min}`);
    assert.ok(Math.abs(max) < 4 && Math.abs(min) < 4, 'stays near north, no wrap to 360');
  });

  it('ignores non-finite input and restarts cleanly after reset', () => {
    const smoother = new AngleSmoother();
    smoother.update(100, FRAME_MS);
    assert.equal(smoother.update(Number.NaN, FRAME_MS), 100);
    smoother.reset();
    assert.equal(smoother.continuous, null);
    assert.equal(smoother.update(5, FRAME_MS), 5);
  });
});

describe('circularMean', () => {
  it('averages across north', () => {
    const mean = circularMean([350, 10]);
    assert.ok(mean !== null && (mean < 1e-6 || mean > 360 - 1e-6), `expected 0, got ${mean}`);
  });

  it('is undefined when the directions cancel or nothing is given', () => {
    assert.equal(circularMean([0, 180]), null);
    assert.equal(circularMean([]), null);
  });
});
