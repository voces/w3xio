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

// Variable interpolation tests
Deno.test("interpolates simple variables", () => {
  assertEquals(
    renderMessage("{{host}} is hosting {{map}}", lobby),
    "Player123 is hosting DotA Allstars",
  );
});

Deno.test("interpolates all available fields", () => {
  assertEquals(
    renderMessage(
      "{{name}} | {{map}} | {{host}} | {{server}} | {{slotsTaken}}/{{slotsTotal}}",
      lobby,
    ),
    "DotA v6.83 -apem | DotA Allstars | Player123 | us | 5/10",
  );
});

Deno.test("unknown variables are left as-is", () => {
  assertEquals(
    renderMessage("Hello {{unknown}} world", lobby),
    "Hello {{unknown}} world",
  );
});

Deno.test("returns undefined for undefined template", () => {
  assertEquals(renderMessage(undefined, lobby), undefined);
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

// Combined tests
Deno.test("conditionals with variable interpolation", () => {
  assertEquals(
    renderMessage(
      '{{#if name contains "DotA"}}@DotARole{{#else}}@Everyone{{/if}} - {{host}} hosting {{map}}',
      lobby,
    ),
    "@DotARole - Player123 hosting DotA Allstars",
  );
});

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
Deno.test("empty template returns undefined", () => {
  assertEquals(renderMessage("", lobby), undefined);
});

Deno.test("template with no special syntax passes through", () => {
  assertEquals(
    renderMessage("Just a plain message", lobby),
    "Just a plain message",
  );
});

Deno.test("nested braces in content", () => {
  assertEquals(
    renderMessage('{{#if name contains "DotA"}}{hello}{{/if}}', lobby),
    "{hello}",
  );
});
