import { describe, expect, it } from 'vitest';
import { isExplicitYes } from './consent';

describe('explicit consent (judged by the server, not the model)', () => {
  it.each(['Yes', 'yes please', 'YES!', 'ok', 'Okay', 'sure', 'go ahead', 'confirm', 'oya', 'oya pay', 'ehen', 'abeg pay', 'ndiyo', 'Sawa', 'lipa', 'yes o', 'Yes, pay it'])(
    'accepts %j',
    (m) => expect(isExplicitYes(m)).toBe(true),
  );

  it.each([
    'no',
    'not now',
    'wait',
    'yes but wait',
    'ok later',
    "don't pay",
    'maybe',
    'hmm',
    'I go pay Friday abeg',
    'hapana',
    'sawa, subiri kidogo',
    'what is the amount?',
    'yes yes yes yes yes yes yes yes', // too long to be a clear confirmation
    '',
  ])('rejects %j', (m) => expect(isExplicitYes(m)).toBe(false));
});
