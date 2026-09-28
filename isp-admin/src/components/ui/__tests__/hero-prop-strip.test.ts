/**
 * Coverage for the HeroUI-prop-stripping helpers in ``Input`` and
 * ``Label``. The wrappers sit between the React Hook Form parents
 * (which spread HeroUI-style props automatically) and the underlying
 * DOM element — without stripping the leak, you get the
 * ``React does not recognize the ``isInvalid`` prop on a DOM
 * element`` warning in devtools.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import { __test__ } from '../input';

const { stripHeroUIProps, HEROUI_ONLY_PROPS } = __test__;

describe('Input prop-stripping helper', () => {
  test('removes HeroUI-only props from a spread payload', () => {
    const dirty = {
      className: 'h-9',
      placeholder: 'Enter username',
      'aria-invalid': true,
      // These four are the ones that actually surface in the
      // browser console. The helper drops them before reaching the
      // DOM, so they never produce a console warning.
      isInvalid: true,
      isRequired: true,
      isDisabled: true,
      classNames: { input: 'red' },
    };
    const clean = stripHeroUIProps(dirty);
    assert.strictEqual(clean.className, 'h-9');
    assert.strictEqual(clean.placeholder, 'Enter username');
    assert.strictEqual(clean['aria-invalid'], true);
    assert.strictEqual('isInvalid' in clean, false);
    assert.strictEqual('isRequired' in clean, false);
    assert.strictEqual('isDisabled' in clean, false);
    assert.strictEqual('classNames' in clean, false);
  });

  test('returns the same prototype/identity for the safely-shaped slice', () => {
    // Spread-style consumers rely on the helper returning a plain
    // object (not null / not a Map) — make sure.
    const out: any = stripHeroUIProps({ value: 'x' });
    assert.strictEqual(typeof out, 'object');
    assert.notStrictEqual(out, null);
    assert.strictEqual(Array.isArray(out), false);
  });

  test('keeps every known DOM prop (autoFocus, onChange, type, …)', () => {
    const out: any = stripHeroUIProps({
      type: 'email',
      autoFocus: true,
      onChange: () => {},
      onBlur: () => {},
      maxLength: 64,
      'data-testid': 'tenant-input',
    });
    assert.strictEqual(out.type, 'email');
    assert.strictEqual(out.autoFocus, true);
    assert.strictEqual(typeof out.onChange, 'function');
    assert.strictEqual(typeof out.onBlur, 'function');
    assert.strictEqual(out.maxLength, 64);
    assert.strictEqual(out['data-testid'], 'tenant-input');
  });

  test('HEROUI_ONLY_PROPS set contains the documented leak list', () => {
    // If a new HeroUI prop starts leaking, this assertion forces
    // us to add it to the strip list explicitly.
    for (const prop of [
      'isInvalid',
      'isDisabled',
      'isRequired',
      'isReadOnly',
      'classNames',
      'validationState',
    ]) {
      assert.ok(HEROUI_ONLY_PROPS.has(prop), `expected ${prop} in the strip set`);
    }
  });

  test('does not mutate the input object', () => {
    // Spreading object spread-shallow-copies so the helper must not
    // be in-place — callers reuse the form-controller's payload.
    const original = { isInvalid: true, value: 'x' };
    const snapshot = JSON.stringify(original);
    stripHeroUIProps(original);
    assert.strictEqual(JSON.stringify(original), snapshot);
  });
});
