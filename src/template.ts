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
 * Evaluate a single condition: field contains|matches value
 */
function evaluateSingleCondition(
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

// A single condition: field operator "value"
type SingleCondition = { field: string; operator: string; value: string };

// A compound condition with and/or
type Condition =
  | SingleCondition
  | { type: "and"; left: Condition; right: Condition }
  | { type: "or"; left: Condition; right: Condition };

/**
 * Evaluate a condition (single or compound) against a context
 */
function evaluateCondition(condition: Condition, context: TemplateContext): boolean {
  if ("type" in condition) {
    if (condition.type === "and") {
      return evaluateCondition(condition.left, context) && evaluateCondition(condition.right, context);
    } else {
      return evaluateCondition(condition.left, context) || evaluateCondition(condition.right, context);
    }
  }
  return evaluateSingleCondition(condition.field, condition.operator, condition.value, context);
}

// Token types for the parser
type Token =
  | { type: "text"; value: string }
  | { type: "if"; condition: Condition }
  | { type: "elseif"; condition: Condition }
  | { type: "else" }
  | { type: "endif" };

/**
 * Parse a condition string like: field contains "value" and field2 matches "/pattern/"
 */
function parseCondition(condStr: string): Condition | null {
  // Split by " or " first (lower precedence), then " and " (higher precedence)
  const orParts = condStr.split(/\s+or\s+/);
  if (orParts.length > 1) {
    let result = parseCondition(orParts[0]);
    if (!result) return null;
    for (let i = 1; i < orParts.length; i++) {
      const right = parseCondition(orParts[i]);
      if (!right) return null;
      result = { type: "or", left: result, right };
    }
    return result;
  }

  const andParts = condStr.split(/\s+and\s+/);
  if (andParts.length > 1) {
    let result = parseCondition(andParts[0]);
    if (!result) return null;
    for (let i = 1; i < andParts.length; i++) {
      const right = parseCondition(andParts[i]);
      if (!right) return null;
      result = { type: "and", left: result, right };
    }
    return result;
  }

  // Single condition: field operator "value"
  const singleMatch = condStr.match(/^(\w+)\s+(contains|matches)\s+"([^"]*)"$/);
  if (singleMatch) {
    return {
      field: singleMatch[1],
      operator: singleMatch[2],
      value: singleMatch[3],
    };
  }

  return null;
}

/**
 * Tokenize a template string into tokens
 */
function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  // Match {{#if ...}}, {{#elseif ...}}, {{#else}}, {{/if}}
  const tagPattern = /\{\{(#if\s+(.+?)|#elseif\s+(.+?)|#else|\/if)\}\}/g;

  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(template)) !== null) {
    // Add text before this tag
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: template.slice(lastIndex, match.index) });
    }

    const fullMatch = match[1];

    if (fullMatch.startsWith("#if ")) {
      const condition = parseCondition(match[2]);
      if (condition) {
        tokens.push({ type: "if", condition });
      }
    } else if (fullMatch.startsWith("#elseif ")) {
      const condition = parseCondition(match[3]);
      if (condition) {
        tokens.push({ type: "elseif", condition });
      }
    } else if (fullMatch === "#else") {
      tokens.push({ type: "else" });
    } else if (fullMatch === "/if") {
      tokens.push({ type: "endif" });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < template.length) {
    tokens.push({ type: "text", value: template.slice(lastIndex) });
  }

  return tokens;
}

// AST node types
type ASTNode =
  | { type: "text"; value: string }
  | {
      type: "conditional";
      branches: {
        condition: Condition | null;
        body: ASTNode[];
      }[];
    };

/**
 * Parse tokens into an AST, handling nested conditionals
 */
function parse(tokens: Token[]): ASTNode[] {
  let i = 0;

  function parseUntil(
    stopTypes: Token["type"][],
  ): { nodes: ASTNode[]; stoppedAt: Token | null } {
    const result: ASTNode[] = [];

    while (i < tokens.length) {
      const token = tokens[i];

      if (stopTypes.includes(token.type)) {
        return { nodes: result, stoppedAt: token };
      }

      if (token.type === "text") {
        result.push({ type: "text", value: token.value });
        i++;
      } else if (token.type === "if") {
        // Start of a conditional block
        const branches: ASTNode & { type: "conditional" } = {
          type: "conditional",
          branches: [],
        };

        // Parse if branch
        const ifCondition = token.condition;
        i++;
        const ifBody = parseUntil(["elseif", "else", "endif"]);
        branches.branches.push({ condition: ifCondition, body: ifBody.nodes });

        // Parse elseif/else branches
        while (ifBody.stoppedAt && ifBody.stoppedAt.type !== "endif") {
          if (ifBody.stoppedAt.type === "elseif") {
            const elseifCondition = ifBody.stoppedAt.condition;
            i++;
            const elseifBody = parseUntil(["elseif", "else", "endif"]);
            branches.branches.push({
              condition: elseifCondition,
              body: elseifBody.nodes,
            });
            ifBody.stoppedAt = elseifBody.stoppedAt;
          } else if (ifBody.stoppedAt.type === "else") {
            i++;
            const elseBody = parseUntil(["endif"]);
            branches.branches.push({ condition: null, body: elseBody.nodes });
            ifBody.stoppedAt = elseBody.stoppedAt;
          }
        }

        // Skip the endif
        if (ifBody.stoppedAt?.type === "endif") {
          i++;
        }

        result.push(branches);
      } else {
        // Unexpected token, skip it
        i++;
      }
    }

    return { nodes: result, stoppedAt: null };
  }

  return parseUntil([]).nodes;
}

/**
 * Evaluate an AST with a given context
 */
function evaluate(nodes: ASTNode[], context: TemplateContext): string {
  let result = "";

  for (const node of nodes) {
    if (node.type === "text") {
      result += node.value;
    } else if (node.type === "conditional") {
      // Find first matching branch
      for (const branch of node.branches) {
        if (branch.condition === null || evaluateCondition(branch.condition, context)) {
          result += evaluate(branch.body, context);
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Render a message template with conditional interpolation.
 * Supports nested conditionals and compound conditions (and/or).
 *
 * Syntax:
 *   Conditionals (nestable):
 *     {{#if field contains "value"}}...{{/if}}
 *     {{#if field matches "/pattern/flags"}}...{{/if}}
 *     {{#if field contains "a" and field2 contains "b"}}...{{/if}}
 *     {{#if field contains "a" or field2 contains "b"}}...{{/if}}
 *     {{#elseif field contains "value"}}...
 *     {{#else}}...
 *
 * Example:
 *   {{#if name contains "DotA" and server contains "us"}}US DotA{{#else}}Other{{/if}}
 */
export function renderMessage(
  template: string | undefined,
  context: TemplateContext,
): string | undefined {
  if (!template) return undefined;

  const tokens = tokenize(template);
  const ast = parse(tokens);
  return evaluate(ast, context);
}
