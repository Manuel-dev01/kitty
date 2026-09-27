/**
 * Explicit consent, judged by the SERVER from the member's own words, never by the model.
 * Used by confirm_payment: a payment starts only if the member's latest message is an unambiguous yes.
 * English, Nigerian Pidgin and Swahili, as the treasurer speaks them.
 */
const YES = [
  'yes', 'yeah', 'yea', 'yep', 'yup', 'y', 'ok', 'okay', 'k', 'sure', 'confirm', 'confirmed', 'proceed', 'go ahead',
  'do it', 'pay', 'pay now', 'please pay', 'send it', 'approved', 'approve', 'correct', 'right',
  // Nigerian Pidgin
  'oya', 'oya pay', 'ehen', 'na so', 'abeg pay', 'pay am', 'make e go', 'e go', 'sharp', 'no wahala',
  // Swahili
  'ndiyo', 'ndio', 'sawa', 'sawa sawa', 'endelea', 'lipa', 'lipa sasa', 'ee', 'naam', 'haya',
];

const NO = /\b(no|nope|nah|not|don'?t|dont|stop|wait|later|cancel|never|hold on|tomorrow|abeg no|no be|mba|hapana|siyo|la|subiri|baadaye|usi)\b/;

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True only for a short, unambiguous affirmation with no negation anywhere in it. */
export function isExplicitYes(message: string): boolean {
  const m = normalise(message);
  if (!m || m.split(' ').length > 6 || NO.test(m)) return false;
  // Strip friendly padding: "yes please", "yes o", "ok abeg", "sawa asante".
  const core = m.replace(/\b(please|pls|plz|o|oo|abeg|asante|thanks|thank you|go|now|sasa|na|am)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return YES.includes(m) || YES.includes(core) || YES.some((y) => m === `${y} ${y}`) || /^(yes|ok|okay|sure|ndiyo|sawa|oya)\b/.test(core);
}
