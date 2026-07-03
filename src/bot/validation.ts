import isSafeRegex from "safe-regex2";

const MAX_PATTERN_LENGTH = 1000;

/**
 * Create a ReDoS-safe regex from a /pattern/flags string.
 * Returns null if invalid or potentially dangerous.
 */
function createSafeRegex(patternStr: string): RegExp | null {
  const match = patternStr.match(/^\/(.*)\/(\w*)$/);
  if (!match) return null;
  const [, pattern, flags] = match;
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  try {
    const regex = new RegExp(pattern, flags || undefined);
    if (!isSafeRegex(regex)) {
      return null;
    }
    return regex;
  } catch {
    return null;
  }
}

/**
 * Validate a rule value (for regex patterns).
 * Returns an error message if invalid, null if valid.
 */
export function validateRuleValue(value: string): string | null {
  if (value.startsWith("/")) {
    const regex = createSafeRegex(value);
    if (!regex) {
      return `Invalid or unsafe regex pattern: ${value}`;
    }
  }
  return null;
}

/**
 * Validate a message template.
 * Returns an error message if invalid, null if valid.
 */
export function validateTemplate(template: string): string | null {
  // Find all matches "pattern" anywhere in conditionals (handles and/or compounds)
  const matchesPattern = /\bmatches\s+"([^"]*)"/g;
  let match;
  while ((match = matchesPattern.exec(template)) !== null) {
    const pattern = match[1];
    if (!createSafeRegex(pattern)) {
      return `Invalid or unsafe regex pattern in template: ${pattern}`;
    }
  }
  return null;
}
