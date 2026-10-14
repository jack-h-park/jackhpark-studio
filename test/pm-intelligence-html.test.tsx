import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import { Experience } from '@/components/pm-intelligence-world/Experience';
import {worldContent} from '@/content/pm-intelligence-world/content';
void test('server HTML introduces every input and use without a canvas or completed mission',()=>{
 const html=renderToStaticMarkup(<Experience content={worldContent}/>);
 for(const item of [...worldContent.inputs,...worldContent.uses])assert.ok(html.includes(item.title.replaceAll('&','&amp;')));
 assert.match(html,/Agents prepare/); assert.match(html,/learning gains/);
 assert.doesNotMatch(html,/<canvas/); assert.match(html,/Open 3D world/);
 for(const section of worldContent.sections)assert.ok(html.includes(`id="${section.id}"`));
});

import {DecisionExample} from '@/components/pm-intelligence-world/DecisionExample';
import {initialState} from '@/lib/pm-intelligence-world/state';
void test('decision invitation does not masquerade as a completed or live decision',()=>{
 const html=renderToStaticMarkup(<DecisionExample scenario={worldContent.decisionExample} decision={initialState.decision} dispatch={()=>{}}/>);
 assert.match(html,/Enter the simulation/); assert.doesNotMatch(html,/Your decision record/);
});
void test('simulation record requires a reason and retains uncertainty and next review',()=>{
 const props={scenario:worldContent.decisionExample,dispatch:()=>{}};
 const empty=renderToStaticMarkup(<DecisionExample {...props} decision={{entered:true,choice:'verify',reason:'  '}}/>);
 assert.doesNotMatch(empty,/Your decision record/);
 const full=renderToStaticMarkup(<DecisionExample {...props} decision={{entered:true,choice:'verify',reason:'Need customer evidence'}}/>);
 assert.match(full,/Your decision record/); assert.match(full,/Need customer evidence/); assert.match(full,/Next review/); assert.match(full,/Illustrative/);
});
