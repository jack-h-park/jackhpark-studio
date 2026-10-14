import assert from 'node:assert/strict';
import test from 'node:test';
import {parseFragment,formatFragment} from '@/lib/pm-intelligence-world/navigation';
void test('untrusted fragments normalize without activating an example',()=>{
 for(const hash of ['','#unknown/missing','#guide/knowledge/extra','#quick/%xx'])assert.deepEqual(parseFragment(hash),{mode:'quick',section:'overview'});
 assert.deepEqual(parseFragment(formatFragment('guide','knowledge')),{mode:'guide',section:'knowledge'});
 assert.deepEqual(parseFragment('#explore/decisions'),{mode:'explore',section:'decisions'});
});
