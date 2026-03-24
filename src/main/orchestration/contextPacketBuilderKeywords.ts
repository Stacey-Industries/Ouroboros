/**
 * contextPacketBuilderKeywords.ts — Goal keyword extraction for context packet building.
 *
 * Extracted from contextPacketBuilder.ts to keep each file under 300 lines.
 */

const GOAL_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'nor',
  'for',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'as',
  'is',
  'it',
  'its',
  'be',
  'are',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'this',
  'that',
  'these',
  'those',
  'not',
  'no',
  'from',
  'with',
  'into',
  'than',
  'then',
  'when',
  'where',
  'why',
  'how',
  'what',
  'which',
  'who',
  'all',
  'any',
  'some',
  'also',
  'just',
  'now',
  'only',
  'too',
  'very',
  'there',
  'here',
  'if',
  'so',
  'up',
  'out',
  'about',
  'do',
  'made',
  'make',
]);

export function extractGoalKeywords(goal: string): string[] {
  const tokens: string[] = [];
  for (const raw of goal.split(/\s+/)) {
    const stripped = raw.replace(/^[^\w]+|[^\w]+$/g, '');
    if (!stripped) continue;
    for (const part of stripped.split(/[-_]+/)) {
      for (const sub of part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')) {
        tokens.push(sub.toLowerCase());
      }
    }
  }
  return [
    ...new Set(tokens.filter((t) => t.length >= 3 && !GOAL_STOP_WORDS.has(t) && !/^\d+$/.test(t))),
  ].slice(0, 20);
}
