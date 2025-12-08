type TemplateContext = {
  name: string;
  map: string;
  host: string;
  server: string;
  slotsTaken: number;
  slotsTotal: number;
};

/**
 * Parse a /pattern/flags string into a RegExp.
 * Returns null if not a valid regex pattern.
 */
function parseRegex(patternStr: string): RegExp | null {
  const match = patternStr.match(/^\/(.*)\/(\w*)$/);
  if (!match) return null;
  const [, pattern, flags] = match;
  try {
    return new RegExp(pattern, flags || undefined);
  } catch {
    return null;
  }
}

// Cached compiled regex patterns
const compiledPatterns = new Map<string, RegExp>();

/**
 * Evaluate a condition: field contains|matches value
 */
function evaluateCondition(
  field: string,
  operator: string,
  value: string,
  context: TemplateContext,
): boolean {
  const rawValue = context[field as keyof TemplateContext];
  if (rawValue === undefined) return false;
  const fieldValue = String(rawValue);

  switch (operator) {
    case "contains":
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    case "matches": {
      // Use cached regex (validated at creation time in discord-bot)
      let regex = compiledPatterns.get(value);
      if (!regex) {
        regex = parseRegex(value) ?? undefined;
        if (regex) compiledPatterns.set(value, regex);
      }
      return regex ? regex.test(fieldValue) : false;
    }
    default:
      return false;
  }
}

/**
 * Render a message template with conditional interpolation.
 *
 * Syntax:
 *   Variables: {{field}}
 *   Conditionals:
 *     {{#if field contains "value"}}...{{/if}}
 *     {{#if field matches "/pattern/flags"}}...{{/if}}
 *     {{#elseif field contains "value"}}...
 *     {{#else}}...
 *
 * Example:
 *   {{#if name contains "DotA"}}@DotARole{{#else}}@Everyone{{/if}} - {{host}} is hosting {{map}}
 */
export function renderMessage(
  template: string | undefined,
  context: TemplateContext,
): string | undefined {
  if (!template) return undefined;

  let result = template;

  // Process conditionals: {{#if field op "value"}}...{{/if}}
  const conditionalPattern =
    /\{\{#if\s+(\w+)\s+(contains|matches)\s+"([^"]*)"\}\}([\s\S]*?)\{\{\/if\}\}/g;

  result = result.replace(
    conditionalPattern,
    (_, field, operator, value, body) => {
      // Parse the body into branches
      const branchPattern =
        /\{\{#(elseif\s+(\w+)\s+(contains|matches)\s+"([^"]*)"|else)\}\}/g;
      const branches: { condition: (() => boolean) | null; content: string }[] =
        [];

      let lastIndex = 0;
      let branchMatch;
      let currentContent = "";

      // First branch is the if-condition
      while ((branchMatch = branchPattern.exec(body)) !== null) {
        currentContent = body.slice(lastIndex, branchMatch.index);

        if (branches.length === 0) {
          // This is content for the if-branch
          branches.push({
            condition: () => evaluateCondition(field, operator, value, context),
            content: currentContent,
          });
        } else {
          // This is content for a previous elseif/else
          branches[branches.length - 1].content = currentContent;
        }

        const branchType = branchMatch[1];
        if (branchType === "else") {
          branches.push({ condition: null, content: "" });
        } else {
          // elseif
          const elseifField = branchMatch[2];
          const elseifOp = branchMatch[3];
          const elseifValue = branchMatch[4];
          branches.push({
            condition: () =>
              evaluateCondition(elseifField, elseifOp, elseifValue, context),
            content: "",
          });
        }

        lastIndex = branchMatch.index + branchMatch[0].length;
      }

      // Remaining content goes to the last branch (or the if-branch if no elseif/else)
      const remainingContent = body.slice(lastIndex);
      if (branches.length === 0) {
        branches.push({
          condition: () => evaluateCondition(field, operator, value, context),
          content: remainingContent,
        });
      } else {
        branches[branches.length - 1].content = remainingContent;
      }

      // Find the first matching branch
      for (const branch of branches) {
        if (branch.condition === null || branch.condition()) {
          return branch.content;
        }
      }

      return "";
    },
  );

  // Interpolate known variables: {{field}}
  // Unknown variables are left as-is so users can see typos
  result = result.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    const val = context[field as keyof TemplateContext];
    return val !== undefined ? String(val) : match;
  });

  return result;
}
