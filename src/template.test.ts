import { assertEquals } from "jsr:@std/assert";
import { renderMessage } from "./template.ts";

const lobby = {
  name: "DotA v6.83 -apem",
  map: "DotA Allstars",
  host: "Player123",
  server: "us",
  slotsTaken: 5,
  slotsTotal: 10,
};

// Basic tests
Deno.test("returns undefined for undefined template", () => {
  assertEquals(renderMessage(undefined, lobby), undefined);
});

Deno.test("empty template returns undefined", () => {
  assertEquals(renderMessage("", lobby), undefined);
});

Deno.test("template with no special syntax passes through", () => {
  assertEquals(
    renderMessage("Just a plain message", lobby),
    "Just a plain message",
  );
});

// Contains condition tests
Deno.test("if contains - matching", () => {
  assertEquals(
    renderMessage('{{#if name contains "DotA"}}Found DotA{{/if}}', lobby),
    "Found DotA",
  );
});

Deno.test("if contains - not matching", () => {
  assertEquals(
    renderMessage('{{#if name contains "Legion"}}Found Legion{{/if}}', lobby),
    "",
  );
});

Deno.test("if contains - case insensitive", () => {
  assertEquals(
    renderMessage('{{#if name contains "dota"}}Found{{/if}}', lobby),
    "Found",
  );
});

// Matches condition tests
Deno.test("if matches - matching regex", () => {
  assertEquals(
    renderMessage('{{#if name matches "/dota/i"}}Matched{{/if}}', lobby),
    "Matched",
  );
});

Deno.test("if matches - not matching regex", () => {
  assertEquals(
    renderMessage('{{#if name matches "/^Legion/"}}Matched{{/if}}', lobby),
    "",
  );
});

Deno.test("if matches - regex with flags", () => {
  assertEquals(
    renderMessage('{{#if map matches "/allstars$/i"}}Matched{{/if}}', lobby),
    "Matched",
  );
});

// If/else tests
Deno.test("if/else - condition true", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}Its DotA{{#else}}Not DotA{{/if}}',
      lobby,
    ),
    "Its DotA",
  );
});

Deno.test("if/else - condition false", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "Legion"}}Its Legion{{#else}}Not Legion{{/if}}',
      lobby,
    ),
    "Not Legion",
  );
});

// If/elseif/else tests
Deno.test("if/elseif/else - first condition matches", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}DotA{{#elseif name contains "TD"}}TD{{#else}}Other{{/if}}',
      lobby,
    ),
    "DotA",
  );
});

Deno.test("if/elseif/else - second condition matches", () => {
  const tdLobby = { ...lobby, name: "Tree TD v2" };
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}DotA{{#elseif name contains "TD"}}TD{{#else}}Other{{/if}}',
      tdLobby,
    ),
    "TD",
  );
});

Deno.test("if/elseif/else - no condition matches", () => {
  const otherLobby = { ...lobby, name: "Random Game" };
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}DotA{{#elseif name contains "TD"}}TD{{#else}}Other{{/if}}',
      otherLobby,
    ),
    "Other",
  );
});

// Multiple conditionals
Deno.test("multiple conditionals in one template", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}DotA{{/if}} on {{#if server contains "us"}}US{{#else}}EU{{/if}}',
      lobby,
    ),
    "DotA on US",
  );
});

// Edge cases
Deno.test("nested braces in content", () => {
  assertEquals(
    renderMessage('{{#if name contains "DotA"}}{hello}{{/if}}', lobby),
    "{hello}",
  );
});

// Nested conditionals
Deno.test("nested if - both true", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}{{#if server contains "us"}}US DotA{{/if}}{{/if}}',
      lobby,
    ),
    "US DotA",
  );
});

Deno.test("nested if - outer true, inner false", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}{{#if server contains "eu"}}EU DotA{{/if}}{{/if}}',
      lobby,
    ),
    "",
  );
});

Deno.test("nested if - outer false", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "Legion"}}{{#if server contains "us"}}US Legion{{/if}}{{/if}}',
      lobby,
    ),
    "",
  );
});

Deno.test("nested if with else", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}{{#if server contains "eu"}}EU{{#else}}Not EU{{/if}}{{/if}}',
      lobby,
    ),
    "Not EU",
  );
});

Deno.test("deeply nested conditionals", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}{{#if server contains "us"}}{{#if host contains "Player"}}Found{{/if}}{{/if}}{{/if}}',
      lobby,
    ),
    "Found",
  );
});

// AND operator tests
Deno.test("and operator - both true", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA" and server contains "us"}}Both match{{/if}}',
      lobby,
    ),
    "Both match",
  );
});

Deno.test("and operator - first false", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "Legion" and server contains "us"}}Both match{{/if}}',
      lobby,
    ),
    "",
  );
});

Deno.test("and operator - second false", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA" and server contains "eu"}}Both match{{/if}}',
      lobby,
    ),
    "",
  );
});

// OR operator tests
Deno.test("or operator - both true", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA" or server contains "us"}}One matches{{/if}}',
      lobby,
    ),
    "One matches",
  );
});

Deno.test("or operator - first true", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA" or server contains "eu"}}One matches{{/if}}',
      lobby,
    ),
    "One matches",
  );
});

Deno.test("or operator - second true", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "Legion" or server contains "us"}}One matches{{/if}}',
      lobby,
    ),
    "One matches",
  );
});

Deno.test("or operator - both false", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "Legion" or server contains "eu"}}One matches{{/if}}',
      lobby,
    ),
    "",
  );
});

// Combined and/or
Deno.test("and/or in elseif", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "Legion"}}Legion{{#elseif name contains "DotA" and server contains "us"}}US DotA{{/if}}',
      lobby,
    ),
    "US DotA",
  );
});
