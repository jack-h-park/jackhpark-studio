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
