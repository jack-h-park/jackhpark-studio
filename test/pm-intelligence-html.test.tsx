import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { SelectedWork } from "@/components/landing/SelectedWork";
import { DecisionExample } from "@/components/pm-intelligence-world/DecisionExample";
import { DiscoveryTrail } from "@/components/pm-intelligence-world/DiscoveryTrail";
import { Experience } from "@/components/pm-intelligence-world/Experience";
import { worldContent } from "@/content/pm-intelligence-world/content";
import { initialState } from "@/lib/pm-intelligence-world/state";

void test("server HTML introduces every input and use without a canvas or completed mission", () => {
  const html = renderToStaticMarkup(<Experience content={worldContent} />);
  for (const item of [...worldContent.inputs, ...worldContent.uses])
    assert.ok(html.includes(item.title.replaceAll("&", "&amp;")));
  assert.match(html, /Agents prepare/);
  assert.match(html, /learning gains/);
  assert.doesNotMatch(html, /<canvas/);
  assert.match(html, /Open 3D world/);
  for (const section of worldContent.sections)
    assert.ok(html.includes(`id="${section.id}"`));
});

void test("decision invitation does not masquerade as a completed or live decision", () => {
  const html = renderToStaticMarkup(
    <DecisionExample
      scenario={worldContent.decisionExample}
      decision={initialState.decision}
      dispatch={() => {}}
    />,
  );
  assert.match(html, /Enter the simulation/);
  assert.doesNotMatch(html, /Your decision record/);
});
void test("simulation record requires a reason and retains uncertainty and next review", () => {
  const props = { scenario: worldContent.decisionExample, dispatch: () => {} };
  const empty = renderToStaticMarkup(
    <DecisionExample
      {...props}
      decision={{ entered: true, choice: "verify", reason: "  " }}
    />,
  );
  assert.doesNotMatch(empty, /Your decision record/);
  const full = renderToStaticMarkup(
    <DecisionExample
      {...props}
      decision={{
        entered: true,
        choice: "verify",
        reason: "Need customer evidence",
      }}
    />,
  );
  assert.match(full, /Your decision record/);
  assert.match(full, /Need customer evidence/);
  assert.match(full, /Next review/);
  assert.match(full, /Illustrative/);
});
void test("landing retains the existing PM Intelligence destination and offers a separate experience", () => {
  const html = renderToStaticMarkup(<SelectedWork />);
  assert.match(html, /href="\/experiences\/pm-intelligence"/);
  assert.match(html, /href="\/chat"/);
});

void test("trail invitation is optional and initial trail shows inputs without certifying completion", () => {
  const html = renderToStaticMarkup(
    <DiscoveryTrail
      content={worldContent}
      state={initialState}
      dispatch={() => {}}
      onStart={() => {}}
    />,
  );
  assert.match(html, /Start discovery trail/);
  assert.doesNotMatch(html, /Your exploration passport/);
  const state = {
    ...initialState,
    discovery: { ...initialState.discovery, started: true },
  };
  const active = renderToStaticMarkup(
    <DiscoveryTrail
      content={worldContent}
      state={state}
      dispatch={() => {}}
      onStart={() => {}}
    />,
  );
  assert.match(active, /EXPLORATION RECEIPTS \/ 0 OF 4/);
  assert.match(active, /DISCOVER INPUT/);
  assert.doesNotMatch(active, /Trail complete/);
});
