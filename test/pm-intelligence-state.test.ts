import assert from 'node:assert/strict';
import test from 'node:test';
import { experienceReducer as reduce, initialState, getSequence } from '@/lib/pm-intelligence-world/state';
void test('decision entry is explicit and navigation preserves a reason until reset',()=>{
 assert.equal(reduce(initialState,{type:'CHOOSE_DECISION',choice:'proceed'}).decision.choice,null);
 let s=reduce(initialState,{type:'ENTER_DECISION'});
 s=reduce(s,{type:'CHOOSE_DECISION',choice:'verify'}); s=reduce(s,{type:'SET_REASON',reason:'Need evidence'});
 s=reduce(s,{type:'SET_MODE',mode:'guide'}); s=reduce(s,{type:'FOCUS_SECTION',section:'limits'});
 assert.deepEqual(s.decision,{entered:true,choice:'verify',reason:'Need evidence'});
 assert.deepEqual(reduce(s,{type:'RESET_DECISION'}).decision,{entered:false,choice:null,reason:''});
});
void test('guide completes the introduction without decisions and progression clamps',()=>{
 assert.equal(getSequence('guide').includes('decisions'),false);
 assert.equal(reduce(initialState,{type:'PREVIOUS'}).section,'overview');
 let s=reduce(initialState,{type:'SET_MODE',mode:'guide'});
 for(let i=0;i<20;i++)s=reduce(s,{type:'NEXT'});
 assert.equal(s.section,'limits'); assert.equal(s.decision.entered,false);
 assert.equal(reduce({...s,mode:'explore'},{type:'NEXT'}).section,'limits');
});
