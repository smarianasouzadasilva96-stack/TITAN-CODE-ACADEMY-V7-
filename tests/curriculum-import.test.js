import test from 'node:test';
import assert from 'node:assert/strict';
import {courses} from '../server/curriculum.js';
test('currículo completo e IDs estáveis',()=>{
 assert.equal(courses.length,48);
 assert.equal(courses.flatMap(c=>c.modules.flatMap(m=>m.lessons)).length,7232);
 for(const c of courses){const ls=c.modules.flatMap(m=>m.lessons);assert.equal(new Set(ls.map(l=>l.id)).size,ls.length);for(const l of ls){assert.ok(l.title&&l.explanation&&l.example&&l.exercise&&l.question&&l.review);assert.ok(Number.isInteger(l.correct)&&l.correct>=0&&l.correct<l.options.length);}}
 assert.equal(courses.find(c=>c.id==='html').modules[0].lessons[0].id,'fundamentos');
});
