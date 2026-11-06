'use strict';

const starterMoves = {
  25: { name: '皮卡丘', type: '电', attack: '电击', style: '电击穿过前排，可强化连锁、分裂与贯穿。' },
  4: { name: '小火龙', type: '火', attack: '火球', style: '火球爆开并点燃周围敌人，可叠加扇形火花与爆破传火。' },
  7: { name: '杰尼龟', type: '水', attack: '水枪', style: '水弹弹向另一只敌人并使其减速，可叠加弹跳与潮汐扩散。' }
};

function renderStarter(id) {
  const move = starterMoves[id];
  const radio = document.querySelector(`input[name="starter"][value="${id}"]`);
  radio.checked = true;
  document.body.dataset.partner = id;
  document.getElementById('starterType').textContent = move.type + '系';
  document.getElementById('starterMove').textContent = move.style;
  const route = document.getElementById('evolutionRoute');
  const forms = evolutionLines[id];
  route.hidden = forms.length === 1;
  route.replaceChildren(...forms.slice(1).map(form => {
    const step = document.createElement('span');
    const sprite = new Image(32,32);
    sprite.alt = ''; sprite.src = 'assets/' + form.id + '.png';
    step.append(sprite,'Lv.' + form.level + ' ' + form.name);
    return step;
  }));
  document.getElementById('partnerName').textContent = move.name;
  document.getElementById('partnerType').textContent = move.type;
  document.getElementById('partnerPortrait').src = 'assets/' + id + '.png';

}

document.getElementById('starterPicker').addEventListener('change', event => {
  const radio = event.target;
  if (radio.name === 'starter') selectStarter(Number(radio.value));
});
