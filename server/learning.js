import { courses } from './curriculum.js';
import { transaction } from './db.js';
import { displayName, fail, text } from './security.js';

const lessonsOf = course => course.modules.flatMap(module => module.lessons);
const withoutAnswers = course => ({ ...course, modules: course.modules.map(module => ({
  ...module, lessons: module.lessons.map(({ correct, ...lesson }) => lesson)
})) });
const daysAgo = (now, days) => new Date(now - days * 86400000).toISOString().slice(0, 10);
const accessories = { none: 0, star: 100, crown: 380 };
const tracks = {
  html: 'web', css: 'web', javascript: 'web', typescript: 'web', php: 'web',
  python: 'fundamentos', lua: 'fundamentos', luau: 'fundamentos',
  java: 'sistemas', kotlin: 'sistemas', c: 'sistemas', cpp: 'sistemas', csharp: 'sistemas', go: 'sistemas', rust: 'sistemas',
  sql: 'dados'
};
const stages = [[0,'Ovo'],[25,'Nascimento'],[60,'Filhote'],[150,'Jovem'],[300,'Adulto'],[650,'Evolução especial']];

export function learning(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO courses VALUES (?, ?, 1, ?)');
  transaction(db, () => {
    for (const course of courses) {
      insert.run(course.id, JSON.stringify(course), Date.now());
      const row = db.prepare('SELECT data FROM courses WHERE id=?').get(course.id);
      const existing = JSON.parse(row.data);
      const ids = new Set(lessonsOf(existing).map(l => l.id));
      const additions = course.modules.map(m => ({...m, lessons:m.lessons.filter(l => !ids.has(l.id))})).filter(m => m.lessons.length);
      if (additions.length) db.prepare('UPDATE courses SET data=?,updated=? WHERE id=?').run(JSON.stringify({...existing, modules:[...existing.modules,...additions]}), Date.now(), course.id);
    }
  });
  function read(id) {
    const row = db.prepare('SELECT data FROM courses WHERE id=? AND published=1').get(id);
    if (!row) throw fail(404, 'Curso não encontrado.');
    return JSON.parse(row.data);
  }
  function overview(owner, goal = 3) {
    const progress = db.prepare('SELECT course,lesson,xp,completed FROM progress WHERE owner=? ORDER BY completed DESC').all(owner);
    const xp = progress.reduce((total, lesson) => total + lesson.xp, 0);
    const dates = new Set(progress.map(row => daysAgo(row.completed, 0)));
    const now = Date.now();
    const start = dates.has(daysAgo(now, 0)) ? 0 : 1;
    let streak = 0;
    while (dates.has(daysAgo(now, start + streak))) streak++;
    const week = progress.filter(row => row.completed > now - 7 * 86400000).length;
    const pet = db.prepare('SELECT name,accessory FROM pets WHERE owner=?').get(owner) || { name: 'Byte', accessory: 'none' };
    const stage = stages.findLastIndex(([min]) => xp >= min);
    const daily = progress.filter(row => daysAgo(row.completed, 0) === daysAgo(now, 0)).length;
    const evolution = [{ stage: 0, label: stages[0][1], xp: 0, date: null }];
    let earned = 0;
    for (const row of [...progress].reverse()) {
      earned += row.xp;
      for (let index = evolution.length; index < stages.length && earned >= stages[index][0]; index++) {
        const [threshold, label] = stages[index];
        evolution.push({ stage: index, xp: threshold, label, date: row.completed });
      }
    }
    const achievements = [
      { name: 'Primeiros passos', unlocked: progress.length > 0 },
      { name: 'Explorador', unlocked: new Set(progress.map(row => row.course)).size >= 3 },
      { name: 'Ritmo constante', unlocked: streak >= 3 },
      { name: 'Mestre de laboratório', unlocked: xp >= 300 }
    ];
    return { progress, xp, level: 1 + Math.floor(xp / 100), streak, week, goal, daily, achievements,
      pet: { ...pet, stage, label: stages[stage][1], next: stages[stage + 1]?.[0] || null,
        evolution, accessories: Object.keys(accessories).filter(key => xp >= accessories[key]) } };
  }
  return {
    list(owner) {
      const progress = db.prepare('SELECT course,count(*) AS n FROM progress WHERE owner=? GROUP BY course').all(owner);
      return db.prepare('SELECT data FROM courses WHERE published=1 ORDER BY rowid').all().map(row => {
        const course = JSON.parse(row.data);
        return { id: course.id, title: course.title, mark: course.mark, description: course.description, track: tracks[course.id] || 'fundamentos',
          total: lessonsOf(course).length, completed: progress.find(item => item.course === course.id)?.n || 0 };
      });
    },
    course(owner, id) {
      const course = read(id);
      const completed = db.prepare('SELECT lesson,completed FROM progress WHERE owner=? AND course=?').all(owner, id);
      const eligible = lessonsOf(course).length > 0 && lessonsOf(course).every(lesson => completed.some(row => row.lesson === lesson.id));
      const issued = eligible ? Math.max(...completed.map(row => row.completed)) : null;
      const user = eligible && db.prepare('SELECT name FROM users WHERE id=?').get(owner);
      const reviews = db.prepare('SELECT lesson,attempts,correct,reflection,updated FROM reviews WHERE owner=? AND course=?').all(owner, id);
      return { ...withoutAnswers(course), completed, reviews, certificate: eligible ? { name: displayName(user.name), course: course.title, issued } : null };
    },
    submit(owner, id, lessonId, data) {
      const lesson = lessonsOf(read(id)).find(item => item.id === lessonId);
      if (!lesson) throw fail(404, 'Lição não encontrada.');
      if (!Number.isInteger(data.answer) || data.answer < 0 || data.answer >= lesson.options.length) throw fail(400, 'Escolha uma resposta.');
      const reflection = lesson.kind === 'project' ? text(data.reflection, 4000, 'Relato de prática') : '';
      if (lesson.kind === 'project' && reflection.length < 20) throw fail(400, 'Descreva como testou o projeto em pelo menos 20 caracteres.');
      const correct = data.answer === lesson.correct;
      const completed = transaction(db, () => {
        const time = Date.now();
        db.prepare(`INSERT INTO reviews VALUES (?,?,?,1,?,?,?)
          ON CONFLICT(owner,course,lesson) DO UPDATE SET attempts=reviews.attempts+1,correct=excluded.correct,
            reflection=excluded.reflection,updated=excluded.updated`)
          .run(owner, id, lessonId, Number(correct), reflection, time);
        return correct && db.prepare('INSERT OR IGNORE INTO progress VALUES (?, ?, ?, ?, ?)').run(owner, id, lessonId, lesson.xp, time).changes;
      });
      return { correct, review: lesson.review, xp: completed ? lesson.xp : 0 };
    },
    *exportReviews(owner) {
      yield* db.prepare('SELECT course,lesson,attempts,correct,reflection,updated FROM reviews WHERE owner=?').all(owner);
    },
    overview,
    pet(owner, data) {
      const name = text(data.name, 32, 'Nome');
      if (!overview(owner).pet.accessories.includes(data.accessory)) throw fail(400, 'Acessório indisponível para o seu progresso.');
      db.prepare(`INSERT INTO pets VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name, accessory=excluded.accessory`)
        .run(owner, name, data.accessory);
      return overview(owner).pet;
    },
    adminList() { return db.prepare('SELECT id, data, published, updated FROM courses ORDER BY rowid').all().map(row => ({ ...row, data: JSON.parse(row.data) })); },
    adminUpdate(id, data) {
      const row = db.prepare('SELECT data FROM courses WHERE id=?').get(id);
      if (!row) throw fail(404, 'Curso não encontrado.');
      if (typeof data.published !== 'boolean') throw fail(400, 'Estado de publicação inválido.');
      const course = JSON.parse(row.data);
      course.title = text(data.title, 70, 'Título');
      course.description = text(data.description, 240, 'Descrição');
      if (data.lesson != null) {
        const lesson = lessonsOf(course).find(item => item.id === data.lesson);
        if (!lesson) throw fail(404, 'Lição não encontrada.');
        lesson.explanation = text(data.explanation, 8000, 'Explicação');
        lesson.example = text(data.example, 12000, 'Exemplo');
        lesson.exercise = text(data.exercise, 4000, 'Exercício');
      }
      db.prepare('UPDATE courses SET data=?,published=?,updated=? WHERE id=?').run(JSON.stringify(course), Number(data.published), Date.now(), id);
    }
  };
}
