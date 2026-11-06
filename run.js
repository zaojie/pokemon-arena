'use strict';

// One expedition lasts five encounters. Relics belong to that expedition only.
const expeditionWaves = [
  { name: '林间初遇', count: 15, health: 14, pace: 2.5, recovery: 5.1 },
  { name: '溪岸交锋', count: 20, health: 17, pace: 2.7, recovery: 4.8 },
  { name: '林火包围', count: 26, health: 20, pace: 3.0, recovery: 4.5 },
  { name: '双翼夹击', count: 32, health: 24, pace: 3.3, recovery: 4.3 },
  { name: '森林霸主', count: 36, health: 28, pace: 3.5, recovery: 4.0 },
];

const expeditionRelics = [
  { key:'chain', name:'连锁闪电', family:'电弧', description:'命中后，向 8 米内另一只敌人弹射半额伤害。每级多跳 1 次。' },
  { key:'volley', name:'分叉闪电', family:'分裂', description:'每次攻击多释放 1 枚副弹，优先追击另一目标，造成 60% 伤害。' },
  { key:'pierce', name:'贯穿电枪', family:'贯穿', description:'电击穿过 1 个额外目标，每次贯穿均可再次触发电弧。' },
  { key:'charge', name:'蓄能磁石', family:'增幅', description:'主弹基础伤害 +5，副弹和连锁闪电同步增强。' },
  { key:'tempo', name:'高速充能', family:'连射', description:'发射间隔缩短 18%，同时提升所有副弹的射速。' },
  { key:'sap', name:'森林汲取', family:'续航', description:'立即恢复 22 点体力，每击倒一只敌人再回复 3 点。' },
];

const fireRelics = [
  {key:'kindle', name:'烈焰灼心', family:'灼烧', description:'每次灼烧伤害 +3。主火球、扇形火花都能点燃目标。'},
  {key:'burst', name:'熔岩爆芯', family:'爆破', description:'火球爆炸每级扩宽 1 米，溅射伤害 +6。范围内敌人都会被点燃。'},
  {key:'fan', name:'扇形火花', family:'散射', description:'每级额外发射一对斜向火花，各造成 40% 直击伤害和完整灼烧。'},
  {key:'cinder', name:'长燃余烬', family:'余烬', description:'每级延长 2 次灼烧。重复命中会刷新剩余次数。'},
  {key:'flare', name:'趁热打铁', family:'追击', description:'命中已在燃烧的敌人时，每级追加 6 点直击伤害。'},
  {key:'stoke', name:'急燃节拍', family:'连射', description:'每级缩短 16% 发射间隔，同时加快主火球和扇形火花。'},
];

const waterRelics = [
  {key:'bounce', name:'跳弹水珠', family:'弹跳', description:'每级可向 9 米内另一只敌人弹跳一次。跳弹保留 80% 伤害并附加减速。'},
  {key:'frost', name:'寒流', family:'减速', description:'每级提高 10 个百分点的减速，延长 0.6 秒。'},
  {key:'wave', name:'潮汐冲击', family:'扩散', description:'水弹命中时减速附近敌人。每级增加 4 点范围伤害和 1 米半径。'},
  {key:'breaker', name:'高压水枪', family:'追击', description:'直击已减速的敌人时，每级追加 4 点伤害，跳弹同样生效。'},
  {key:'foam', name:'双重泡沫', family:'连珠', description:'每第三次攻击，每级追加一颗延后出发的水珠，沿原弹道追击。'},
  {key:'stream', name:'湍流节拍', family:'连射', description:'每级缩短 15% 发射间隔，更快触发第三击的连珠。'},
];

function relicsFor(species) {
  if (species === 4) return fireRelics;
  if (species === 7) return waterRelics;
  return expeditionRelics;
}

function beginExpedition(species = 25) {
  return {
    species, stage: 0, wave: 1, waterCasts: 0, level: 1, xp: 0, nextXp: 4, draftReason: null,
    levels: Object.fromEntries(relicsFor(species).map(r => [r.key, 0])),
    offers: [],
  };
}

function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawRelics(run, random = Math.random) {
  // Always offer one move-changing relic. Stack levels or combine effects.
  const pool = relicsFor(run.species);
  const lead = shuffled(pool.slice(0, 3), random)[0];
  return shuffled([lead, ...shuffled(pool.filter(r => r !== lead), random).slice(0, 2)], random);
}
