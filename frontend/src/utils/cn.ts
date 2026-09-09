/**
 * Simple classnames merger — replacement for clsx/tailwind-merge cn()
 * Merges class strings, filters falsy values, deduplicates
 */
export function cn(...classes: (string | undefined | null | false | 0)[]): string {
  return classes.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}
