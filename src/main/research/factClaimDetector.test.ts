/**
 * factClaimDetector.test.ts — Unit tests for the pure fact-claim detector.
 *
 * Covers: positive matches per library, word-boundary negative cases,
 * min-confidence filtering, multiple matches in one chunk, empty chunk.
 */

import { describe, expect, it } from 'vitest';

import { detectFactClaims } from './factClaimDetector';

describe('detectFactClaims', () => {
  describe('empty input', () => {
    it('returns empty array for empty string', () => {
      expect(detectFactClaims('')).toEqual([]);
    });
  });

  describe('positive cases — react', () => {
    it('matches useState(', () => {
      const results = detectFactClaims('const [x, setX] = useState(0);');
      const match = results.find((r) => r.library === 'react');
      expect(match).toBeDefined();
      expect(match!.matchText).toMatch(/useState/);
    });

    it('matches useEffect(', () => {
      const results = detectFactClaims('useEffect(() => {}, []);');
      expect(results.some((r) => r.library === 'react')).toBe(true);
    });

    it('matches custom hooks like useMyHook(', () => {
      const results = detectFactClaims('const val = useMyHook(options);');
      expect(results.some((r) => r.library === 'react')).toBe(true);
    });
  });

  describe('negative cases — word boundary', () => {
    it('does not match mouseStatus (no word boundary before use)', () => {
      const results = detectFactClaims('const mouseStatus = true;');
      expect(results.some((r) => r.library === 'react')).toBe(false);
    });

    it('does not match causeError (embedded use)', () => {
      const results = detectFactClaims('causeError()');
      expect(results.some((r) => r.library === 'react')).toBe(false);
    });
  });

  describe('positive cases — zod', () => {
    it('matches z.string(', () => {
      const results = detectFactClaims('const schema = z.string();');
      expect(results.some((r) => r.library === 'zod')).toBe(true);
    });

    it('matches z.object(', () => {
      const results = detectFactClaims('z.object({ name: z.string() })');
      const zodMatches = results.filter((r) => r.library === 'zod');
      expect(zodMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('positive cases — @prisma/client', () => {
    it('matches prisma.user.findMany', () => {
      const results = detectFactClaims('await prisma.user.findMany({ where: {} })');
      expect(results.some((r) => r.library === '@prisma/client')).toBe(true);
    });

    it('matches prisma.post.create', () => {
      const results = detectFactClaims('prisma.post.create({ data })');
      expect(results.some((r) => r.library === '@prisma/client')).toBe(true);
    });
  });

  describe('positive cases — next', () => {
    it('matches useRouter(', () => {
      const results = detectFactClaims('const router = useRouter();', 'high');
      expect(results.some((r) => r.library === 'next')).toBe(true);
    });

    it('matches usePathname(', () => {
      const results = detectFactClaims('const path = usePathname();', 'high');
      expect(results.some((r) => r.library === 'next')).toBe(true);
    });

    it('matches useSearchParams(', () => {
      const results = detectFactClaims('const sp = useSearchParams();', 'high');
      expect(results.some((r) => r.library === 'next')).toBe(true);
    });
  });

  describe('positive cases — @tanstack/react-query', () => {
    it('matches useQuery(', () => {
      const results = detectFactClaims('const { data } = useQuery({ queryKey: [] });');
      expect(results.some((r) => r.library === '@tanstack/react-query')).toBe(true);
    });

    it('matches useMutation(', () => {
      const results = detectFactClaims('const mut = useMutation({ mutationFn });');
      expect(results.some((r) => r.library === '@tanstack/react-query')).toBe(true);
    });
  });

  describe('positive cases — drizzle-orm', () => {
    it('matches db.select(', () => {
      const results = detectFactClaims('const rows = await db.select().from(users);');
      expect(results.some((r) => r.library === 'drizzle-orm')).toBe(true);
    });

    it('matches db.insert(', () => {
      const results = detectFactClaims('await db.insert(users).values({ name });');
      expect(results.some((r) => r.library === 'drizzle-orm')).toBe(true);
    });
  });

  describe('positive cases — svelte', () => {
    it('matches $state(', () => {
      const results = detectFactClaims('let count = $state(0);', 'high');
      expect(results.some((r) => r.library === 'svelte')).toBe(true);
    });

    it('matches $derived(', () => {
      const results = detectFactClaims('const doubled = $derived(count * 2);', 'high');
      expect(results.some((r) => r.library === 'svelte')).toBe(true);
    });

    it('matches $effect(', () => {
      const results = detectFactClaims('$effect(() => { console.warn(x); });', 'high');
      expect(results.some((r) => r.library === 'svelte')).toBe(true);
    });
  });

  describe('positive cases — hono', () => {
    it('matches app.get( at low confidence', () => {
      const results = detectFactClaims('app.get("/", (c) => c.text("hi"))', 'low');
      expect(results.some((r) => r.library === 'hono')).toBe(true);
    });
  });

  describe('positive cases — framer-motion', () => {
    it('matches motion.div', () => {
      const results = detectFactClaims('<motion.div animate={{ x: 0 }}>', 'high');
      expect(results.some((r) => r.library === 'framer-motion')).toBe(true);
    });
  });

  describe('min-confidence filtering', () => {
    it('minConfidence high filters out medium and low patterns', () => {
      // useQuery is medium; z.string() is high — chunk contains both
      const chunk = 'const { data } = useQuery({}) and z.string()';
      const results = detectFactClaims(chunk, 'high');
      expect(results.some((r) => r.library === '@tanstack/react-query')).toBe(false);
      expect(results.some((r) => r.library === 'zod')).toBe(true);
    });

    it('minConfidence low includes all patterns', () => {
      const chunk = 'app.get("/", handler)';
      const results = detectFactClaims(chunk, 'low');
      expect(results.some((r) => r.library === 'hono')).toBe(true);
    });

    it('default minConfidence (medium) excludes low-confidence patterns', () => {
      const chunk = 'app.get("/", handler)';
      const results = detectFactClaims(chunk);
      expect(results.some((r) => r.library === 'hono')).toBe(false);
    });
  });

  describe('multiple matches in one chunk', () => {
    it('returns all matches when chunk contains multiple library patterns', () => {
      const chunk = 'z.object({ id: z.string() }) and prisma.user.findMany';
      const results = detectFactClaims(chunk, 'high');
      const libs = results.map((r) => r.library);
      expect(libs).toContain('zod');
      expect(libs).toContain('@prisma/client');
    });

    it('returns multiple matches for repeated patterns in same chunk', () => {
      const chunk = 'z.string() z.number() z.boolean()';
      const results = detectFactClaims(chunk, 'high');
      const zod = results.filter((r) => r.library === 'zod');
      expect(zod.length).toBeGreaterThanOrEqual(3);
    });

    it('includes correct offset for each match', () => {
      const chunk = 'z.string() then z.number()';
      const results = detectFactClaims(chunk, 'high').filter((r) => r.library === 'zod');
      expect(results.length).toBeGreaterThanOrEqual(2);
      // offsets should differ
      const offsets = results.map((r) => r.offset);
      expect(new Set(offsets).size).toBeGreaterThan(1);
    });
  });
});
