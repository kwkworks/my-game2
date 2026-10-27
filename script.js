// =====================================================
//  재의 왕관 - 텍스트 판타지 RPG
//  구성: 1) 기본 데이터  2) 이야기 장면  3) 엔딩
//        4) 게임 진행/판정  5) 턴제 전투  6) 저장·도감  7) 화면 그리기
// =====================================================
(() => {
  'use strict';

  const SAVE_KEY = 'textrpg.save.v1';
  const CODEX_KEY = 'textrpg.codex.v1';

  // ---------- 작은 도구들 ----------
  const app = document.getElementById('app');
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mod = v => Math.floor((v - 10) / 2);           // 능력치 → 보정치 (16 → +3)
  const sign = n => (n >= 0 ? '+' : '') + n;
  const d20 = () => 1 + Math.floor(Math.random() * 20);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const val = (x, s) => (typeof x === 'function' ? x(s) : x); // 값 또는 함수를 값으로

  // =====================================================
  // 1) 기본 데이터
  // =====================================================
  const STAT_NAMES = { STR: '힘', DEX: '민첩', INT: '지능', CHA: '매력' };

  const CLASSES = {
    warrior: {
      name: '전사', icon: '⚔️', hp: 32,
      desc: '튼튼한 체력과 강한 근접 공격. 힘 판정에 강하다.',
      stats: { STR: 16, DEX: 12, INT: 8, CHA: 10 },
      atk: 'STR', basic: { name: '검격', dmg: [4, 8] }, crit: 20,
      skill: { name: '강타', hit: -3, mult: 2, desc: '명중 -3, 피해 2배' },
    },
    mage: {
      name: '마법사', icon: '🔮', hp: 22,
      desc: '체력은 약하지만 지식과 마법이 뛰어나다. 지능 판정에 강하다.',
      stats: { STR: 8, DEX: 12, INT: 16, CHA: 12 },
      atk: 'INT', basic: { name: '마력탄', dmg: [3, 7] }, crit: 20,
      skill: { name: '화염구', hit: 0, mult: 1.8, auto: true, desc: '반드시 명중, 피해 1.8배' },
    },
    rogue: {
      name: '도적', icon: '🗡️', hp: 26,
      desc: '재빠르고 잘 피한다. 민첩 판정에 강하고 치명타가 잦다.',
      stats: { STR: 10, DEX: 16, INT: 12, CHA: 12 },
      atk: 'DEX', basic: { name: '단검', dmg: [3, 6] }, crit: 18,
      skill: { name: '급소 찌르기', hit: 4, mult: 1.8, desc: '명중 +4, 피해 1.8배' },
    },
  };

  const COMPANIONS = {
    garen: { name: '가렌', role: '용병 전사', icon: '🛡️' },
    lia: { name: '리아', role: '성직자', icon: '✨' },
    sera: { name: '세라', role: '엘프 궁수', icon: '🏹' },
  };

  const ENEMIES = {
    bandit: { name: '산적 두목', icon: '🗡️', hp: 20, ac: 12, atk: 3, dmg: [3, 5] },
    ghoul: { name: '구울 무리', icon: '🧟', hp: 22, ac: 11, atk: 3, dmg: [3, 5] },
    skeleton: { name: '해골 기사', icon: '💀', hp: 26, ac: 13, atk: 4, dmg: [4, 6] },
    vernon: { name: '대주교 베르논', icon: '👻', hp: 42, ac: 13, atk: 5, dmg: [4, 7], special: { name: '죽음의 손길', dmg: 8 } },
    sera: { name: '배신한 세라', icon: '🏹', hp: 20, ac: 14, atk: 5, dmg: [3, 6] },
  };

  // ---------- 상태를 바꾸는 도우미 (장면 데이터에서 사용) ----------
  const has = (s, id) => !!s.party[id] && !s.party[id].out;
  const join = (s, id, aff) => { s.party[id] = { aff }; note(s, `${COMPANIONS[id].name}이(가) 동료가 됨`); };
  const like = (s, id, n) => { if (has(s, id)) s.party[id].aff = Math.max(-3, Math.min(5, s.party[id].aff + n)); };
  const rep = (s, n) => { s.rep = Math.max(-5, Math.min(5, s.rep + n)); };
  const hurt = (s, n) => { s.hp = Math.max(0, s.hp - n); };
  const heal = (s, n) => { s.hp = Math.min(s.maxHp, s.hp + n); };
  const note = (s, t) => { s.log.push(t); };
  const flag = (s, f) => { s.flags[f] = true; };
  const partySize = s => Object.keys(s.party).filter(id => has(s, id)).length;
  const seraWillBetray = s => has(s, 'sera') && !s.flags.seraTrust && s.party.sera.aff < 3;

  // =====================================================
  // 2) 이야기 장면
  //  choice = { text, when?, check?, success?, failure?, result? }
  //  result = { text, fx?(s), next | fight }
  //  next 가 'end:xxx' 이면 엔딩으로 간다.
  // =====================================================
  const SCENES = {
    arrival: {
      title: '회색여울 마을',
      text: s => `붉은 노을이 잦아들 무렵, ${CLASSES[s.cls].name} ${s.name}은(는) 변경 마을 '회색여울'의 목책문 앞에 선다. 길바닥엔 소금과 쇠못이 뿌려져 있고, 집집마다 창문에 판자를 덧댔다.

촌장 하렌이 횃불을 들고 달려온다. "모험가님이시지요? 석 달 전 북쪽 폐수도원에서 '재의 왕관'이 깨어난 뒤로, 매일 밤 무덤이 갈라집니다. 부디... 그 근원을 끊어 주십시오."`,
      choices: [
        {
          text: '"맡겨 주십시오." 의뢰를 수락한다.',
          result: { text: '하렌이 눈물을 글썽이며 당신의 손을 붙든다. 소식은 금세 마을에 퍼졌다.', fx: s => { rep(s, 1); note(s, '촌장의 의뢰를 흔쾌히 수락'); }, next: 'hub' },
        },
        {
          text: '보수부터 협상한다.',
          check: { stat: 'CHA', dc: 12 },
          success: { text: '능청스러운 흥정 끝에 하렌은 마을 비상용 치유 물약을 하나 내어 준다. (물약 +1)', fx: s => { s.potions++; note(s, '흥정으로 물약을 받아냄'); }, next: 'hub' },
          failure: { text: '"사람이 죽어 가는데 돈 얘기라니..." 주민들이 수군거린다. (평판 -1)', fx: s => { rep(s, -1); note(s, '보수를 요구하다 눈총을 삼'); }, next: 'hub' },
        },
        {
          text: '이건 내 싸움이 아니다. 마을을 떠난다.',
          result: { text: '당신은 돌아선다. 등 뒤로 다급한 종소리가 울려 퍼진다.', fx: s => note(s, '의뢰를 거절하고 떠남'), next: 'end:flee' },
        },
      ],
    },

    hub: {
      title: '출발 준비',
      text: s => `여관 마루에서 지도를 펼친다. 폐수도원까지는 이틀 길이다. 출발 전에 동료를 구하거나 정보를 모을 수 있다.

현재 동료: ${partySize(s) ? Object.keys(s.party).filter(id => has(s, id)).map(id => COMPANIONS[id].name).join(', ') : '없음'} (최대 3명)`,
      choices: [
        { text: "🍺 '녹슨 방패' 주점에 간다", hint: '거친 용병이 있다는 소문', when: s => !s.flags.tavernDone, result: { next: 'tavern' } },
        { text: '⛪ 허물어진 예배당에 간다', hint: '부상자를 돌보는 성직자', when: s => !s.flags.chapelDone, result: { next: 'chapel' } },
        { text: '🌲 동쪽 숲길을 살펴본다', hint: '산적이 출몰한다는 길', when: s => !s.flags.forestDone, result: { next: 'forest' } },
        { text: '🗺️ 수도원을 향해 출발한다', hint: '이후엔 마을로 돌아올 수 없다', result: { text: '새벽 안개를 헤치고 북쪽 가도로 나선다.', fx: s => note(s, `동료 ${partySize(s)}명과 함께 출발`), next: 'road' } },
      ],
    },

    tavern: {
      title: "'녹슨 방패' 주점",
      text: `주점 구석에서 덩치 큰 용병 가렌이 홀로 술잔을 기울인다. 칼자국투성이 얼굴이 당신을 흘끗 본다.

"또 한 명의 호구가 마을을 구하러 왔군. 공짜로 목숨 거는 건 바보나 하는 짓이야."`,
      choices: [
        {
          text: '⚔️ [전사] 같은 칼잡이로서 잔을 부딪친다',
          when: s => s.cls === 'warrior',
          result: { text: '가렌이 당신의 굳은살 박인 손을 보고 피식 웃는다. "칼 좀 쥐어 본 손이군. 좋아, 같이 가지."', fx: s => { join(s, 'garen', 3); flag(s, 'tavernDone'); }, next: 'hub' },
        },
        {
          text: '술을 한 잔 사며 설득한다',
          check: { stat: 'CHA', dc: 12 },
          success: { text: '"...그 수도원엔 내 옛 동료들도 묻혀 있지." 가렌이 도끼를 집어 든다.', fx: s => { join(s, 'garen', 2); flag(s, 'tavernDone'); }, next: 'hub' },
          failure: { text: '"말만 번지르르하군." 가렌은 등을 돌려 버렸다.', fx: s => { flag(s, 'tavernDone'); note(s, '가렌 설득에 실패'); }, next: 'hub' },
        },
        {
          text: '팔씨름 내기를 건다',
          check: { stat: 'STR', dc: 13 },
          success: { text: '탁자가 쩍 갈라지며 가렌의 팔이 넘어간다. "하하! 약속은 약속이지."', fx: s => { join(s, 'garen', 1); flag(s, 'tavernDone'); }, next: 'hub' },
          failure: { text: '팔목이 꺾일 듯한 통증과 함께 패배. 주점이 웃음바다가 된다. (체력 -2)', fx: s => { hurt(s, 2); flag(s, 'tavernDone'); note(s, '팔씨름에서 가렌에게 패배'); }, next: 'hub' },
        },
        {
          text: '취객들에게 소문을 듣는다',
          when: s => !s.flags.rumor,
          result: { text: '취객들이 수군댄다. "대주교 베르논 말이야... 역병으로 죽은 딸을 되살리려다 미쳐 버렸다더군." (정보 획득)', fx: s => { flag(s, 'rumor'); note(s, '베르논의 소문을 들음'); }, next: 'tavern' },
        },
        { text: '여관으로 돌아간다', result: { next: 'hub' } },
      ],
    },

    chapel: {
      title: '허물어진 예배당',
      text: `금 간 성상 아래, 성직자 리아가 부상자들 사이를 오가며 붕대를 감고 있다. 약초 바구니는 이미 텅 비었다.

"누구든... 조금만 도와주실 분 안 계신가요?"`,
      choices: [
        {
          text: '🔮 [마법사] 마력으로 상처를 응급 처치한다',
          when: s => s.cls === 'mage' && !has(s, 'lia'),
          result: { text: '푸른 빛이 상처를 덮자 신음이 잦아든다. 리아가 두 손을 모은다. "당신과 함께라면 수도원에서도 사람들을 지킬 수 있겠어요."', fx: s => { rep(s, 1); join(s, 'lia', 2); flag(s, 'chapelDone'); }, next: 'hub' },
        },
        {
          text: '들판에서 약초를 구해 온다',
          when: s => !has(s, 'lia'),
          check: { stat: 'INT', dc: 11 },
          success: { text: '정확한 약초를 한 아름 구해 왔다. 리아는 감격해 당신의 여정에 동행하기로 한다. (평판 +1)', fx: s => { rep(s, 1); join(s, 'lia', 2); flag(s, 'chapelDone'); }, next: 'hub' },
          failure: { text: '엉뚱한 독풀을 뜯어 왔다... 리아는 정중히 고맙다고만 말했다.', fx: s => { flag(s, 'chapelDone'); note(s, '약초 구하기에 실패'); }, next: 'hub' },
        },
        {
          text: '가진 치유 물약 하나를 기부한다',
          when: s => s.potions > 0 && !has(s, 'lia'),
          result: { text: '물약 한 병이 소년의 목숨을 살렸다. 리아가 당신을 따라나선다. (물약 -1, 평판 +1)', fx: s => { s.potions--; rep(s, 1); join(s, 'lia', 3); flag(s, 'chapelDone'); }, next: 'hub' },
        },
        {
          text: '예배당 서고를 몰래 뒤진다',
          hint: '도적이라면 유리',
          when: s => !s.flags.knowsStory && !s.flags.libTried,
          check: { stat: 'DEX', dc: 13, cls: { rogue: 2 } },
          success: { text: "자물쇠를 따고 찾아낸 낡은 일기장: '엘라가 숨을 거두었다. 신이시여, 왕관이라도 좋으니 딸을 돌려주소서. — 베르논' (진실 획득, 평판 -1)", fx: s => { flag(s, 'knowsStory'); rep(s, -1); note(s, '베르논의 일기를 훔쳐 읽음'); }, next: 'chapel' },
          failure: { text: '자물쇠가 요란하게 덜컥거렸다. 부상자들의 시선이 따갑다. (평판 -1)', fx: s => { flag(s, 'libTried'); rep(s, -1); }, next: 'chapel' },
        },
        { text: '여관으로 돌아간다', result: { next: 'hub' } },
      ],
    },

    forest: {
      title: '동쪽 숲길',
      text: `모닥불 가에서 산적들이 사슬에 묶인 엘프 궁수를 조롱하고 있다. 엘프의 눈이 날카롭게 당신을 응시한다 — 도와 달라는 건지, 끼어들지 말라는 건지 알 수 없다.`,
      choices: [
        {
          text: '정면으로 덮친다',
          result: {
            text: '칼을 뽑아 들고 모닥불 속으로 뛰어든다!',
            fight: { enemy: 'bandit', winText: '산적 두목이 쓰러지자 나머지는 달아났다. 엘프가 사슬을 털어 낸다. "세라라고 해. 빚은 갚지."', winFx: s => { rep(s, 1); join(s, 'sera', 1); flag(s, 'forestDone'); }, win: 'hub' },
          },
        },
        {
          text: '몰래 다가가 사슬을 풀어 준다',
          check: { stat: 'DEX', dc: 13, cls: { rogue: 2 } },
          success: { text: '그림자처럼 다가가 사슬을 풀었다. 엘프는 소리 없이 산적들의 활을 부러뜨리고 따라온다. "세라야. 꽤 하는데?"', fx: s => { join(s, 'sera', 2); flag(s, 'forestDone'); }, next: 'hub' },
          failure: {
            text: '나뭇가지가 뚝! 산적들이 칼을 뽑아 든다. (체력 -3)',
            fx: s => hurt(s, 3),
            fight: { enemy: 'bandit', winText: '간신히 산적들을 몰아냈다. 엘프가 고개를 끄덕인다. "세라야. 함께 가지."', winFx: s => { join(s, 'sera', 1); flag(s, 'forestDone'); }, win: 'hub' },
          },
        },
        {
          text: '🔮 [마법사] 수면 마법을 건다',
          when: s => s.cls === 'mage',
          result: { text: '보랏빛 안개가 퍼지자 산적들이 코를 골기 시작한다. 엘프가 감탄한다. "편리한 재주네. 세라야."', fx: s => { join(s, 'sera', 2); flag(s, 'forestDone'); }, next: 'hub' },
        },
        {
          text: '말로 협상해 풀어 달라고 한다',
          check: { stat: 'CHA', dc: 14 },
          success: { text: '"수도원의 언데드가 곧 너희 소굴도 덮칠 거다." 겁먹은 산적들이 엘프를 풀어 준다. 그녀가 따라나선다.', fx: s => { join(s, 'sera', 1); flag(s, 'forestDone'); }, next: 'hub' },
          failure: {
            text: '"웃기는 소리!" 협상은 결렬됐다.',
            fight: { enemy: 'bandit', winText: '산적들을 몰아냈다. 엘프가 손목을 문지르며 말한다. "세라야. 동행하지."', winFx: s => { join(s, 'sera', 1); flag(s, 'forestDone'); }, win: 'hub' },
          },
        },
        {
          text: '못 본 척 지나간다',
          result: { text: '등 뒤로 비웃음 소리가 들린다. 마을에도 소문이 났다. (평판 -2)', fx: s => { rep(s, -2); flag(s, 'forestDone'); note(s, '붙잡힌 엘프를 외면함'); }, next: 'hub' },
        },
      ],
    },

    road: {
      title: '안개 낀 북쪽 가도',
      text: `이튿날 해 질 녘. 길가의 묘석들이 하나둘 흔들리더니, 굶주린 구울 무리가 흙을 털며 일어난다.`,
      choices: [
        { text: '맞서 싸운다', result: { fight: { enemy: 'ghoul', winText: '마지막 구울이 재로 무너졌다.', win: 'bridge' } } },
        {
          text: '✨ 리아의 성수로 쫓아낸다',
          when: s => has(s, 'lia'),
          result: { text: '리아가 성수를 뿌리며 기도하자 구울들이 비명을 지르며 흩어진다. "함께 오길 잘했죠?" (리아 호감 +1)', fx: s => like(s, 'lia', 1), next: 'bridge' },
        },
        {
          text: '어둠을 틈타 우회한다',
          check: { stat: 'DEX', dc: 13, cls: { rogue: 2 }, aid: { sera: 2 } },
          success: { text: '숨죽인 채 묘지를 빙 돌아 빠져나왔다.', next: 'bridge' },
          failure: { text: '구울 하나가 냄새를 맡았다! 발목을 물렸다. (체력 -3)', fx: s => hurt(s, 3), fight: { enemy: 'ghoul', winText: '구울 무리를 해치웠다.', win: 'bridge' } },
        },
      ],
    },

    bridge: {
      title: '망령의 다리',
      text: `안개 속 낡은 돌다리. 투명한 병사의 망령이 창을 가로로 들어 길을 막는다.

"통행세... 왕의 이름으로... 통행세를 내라..."`,
      choices: [
        {
          text: '🛡️ 가렌이 옛 군대식 경례로 답한다',
          when: s => has(s, 'garen'),
          result: { text: '가렌의 경례에 망령이 창을 세우고 경례로 답한다. "...통과." 가렌이 씁쓸하게 웃는다. "나도 한때 근위대였거든." (가렌 호감 +1, 평판 +1)', fx: s => { like(s, 'garen', 1); rep(s, 1); }, next: 'ghosts' },
        },
        {
          text: '망령에게 정체를 묻는다',
          check: { stat: 'INT', dc: 12, cls: { mage: 1 } },
          success: { text: '"나는... 마지막 근위병... 왕관이 우리 영혼을 묶었다..." 망령은 수도원 지하의 구조를 알려 주고 안식에 든다. (평판 +1)', fx: s => { rep(s, 1); flag(s, 'soldier'); note(s, '근위병 망령에게 안식을 줌'); }, next: 'ghosts' },
          failure: { text: '망령이 분노해 차가운 창날을 휘두른다! (체력 -4)', fx: s => hurt(s, 4), next: 'ghosts' },
        },
        {
          text: '치유 물약 한 병을 바친다',
          when: s => s.potions > 0,
          result: { text: '망령은 병을 받아 들고 안개처럼 흩어졌다. (물약 -1)', fx: s => { s.potions--; }, next: 'ghosts' },
        },
        {
          text: '힘으로 밀고 지나간다',
          check: { stat: 'STR', dc: 13, aid: { garen: 2 } },
          success: { text: '창을 밀쳐 내고 다리를 건넜다.', next: 'ghosts' },
          failure: { text: '영혼의 냉기가 뼛속까지 스민다. (체력 -5)', fx: s => hurt(s, 5), next: 'ghosts' },
        },
      ],
    },

    ghosts: {
      title: '잿빛 폐촌',
      text: `다리 너머, 주민이 모두 사라진 마을. 한 집 문틈으로 아이를 안은 유령 가족이 당신을 바라본다. 식탁엔 식어 버린 수프가 그대로 놓여 있다.`,
      choices: [
        {
          text: '✨ 리아와 함께 안식을 빌어 준다',
          when: s => has(s, 'lia'),
          result: { text: '리아의 기도가 끝나자 유령 가족이 미소 지으며 빛 속으로 사라진다. (평판 +2, 리아 호감 +1)', fx: s => { rep(s, 2); like(s, 'lia', 1); note(s, '유령 가족에게 안식을 줌'); }, next: 'camp' },
        },
        {
          text: '진심을 다해 안식을 빌어 준다',
          when: s => !has(s, 'lia'),
          check: { stat: 'CHA', dc: 13 },
          success: { text: '"이제 쉬세요." 유령 가족이 고개를 숙이고 사라진다. (평판 +2)', fx: s => { rep(s, 2); note(s, '유령 가족에게 안식을 줌'); }, next: 'camp' },
          failure: { text: '어설픈 기도는 그들에게 닿지 않았다. 유령들은 그저 당신을 지켜볼 뿐이다.', next: 'camp' },
        },
        {
          text: '빈집의 유품을 뒤진다',
          result: {
            text: s => `서랍 속에서 치유 물약 한 병을 찾았다. (물약 +1, 평판 -1)${has(s, 'garen') ? ' 가렌이 "쓸 만한 건 챙겨야지"라며 고개를 끄덕인다.' : ''}${has(s, 'lia') ? ' 리아는 말없이 시선을 피했다.' : ''}`,
            fx: s => { s.potions++; rep(s, -1); like(s, 'garen', 1); like(s, 'lia', -1); note(s, '폐촌의 유품을 챙김'); },
            next: 'camp',
          },
        },
        {
          text: '유령에게 수도원의 비밀을 묻는다',
          when: s => !s.flags.knowsStory,
          check: { stat: 'INT', dc: 12, aid: { lia: 1 } },
          success: { text: '"대주교님은... 따님 엘라를 살리려고... 마을 사람들의 영혼을 바쳤어요..." (진실 획득)', fx: s => { flag(s, 'knowsStory'); note(s, '유령에게 베르논의 진실을 들음'); }, next: 'camp' },
          failure: { text: '유령들은 겁에 질려 벽 속으로 사라졌다.', next: 'camp' },
        },
      ],
    },

    camp: {
      title: '마지막 야영',
      text: s => `폐촌 외곽의 모닥불. 달빛 아래 수도원의 검은 윤곽이 보인다. 내일이면 결전이다.${partySize(s) ? '\n\n동료들과 이야기를 나누거나, 바로 잠을 청할 수 있다.' : '\n\n홀로 지새우는 밤은 길고 춥다.'}`,
      choices: [
        {
          text: '🛡️ 가렌과 술잔을 나눈다',
          when: s => has(s, 'garen') && !s.flags.talkGaren,
          result: { text: '"근위대가 무너지던 날, 난 도망쳤어. 이번엔 안 도망칠 거다." 가렌이 당신의 어깨를 툭 친다. (가렌 호감 +1)', fx: s => { like(s, 'garen', 1); flag(s, 'talkGaren'); }, next: 'camp' },
        },
        {
          text: '✨ 리아와 함께 기도한다',
          when: s => has(s, 'lia') && !s.flags.talkLia,
          result: { text: '"제 목숨이 필요하다면, 저는 기꺼이 바칠 거예요." 리아의 목소리는 떨리지 않았다. (리아 호감 +1)', fx: s => { like(s, 'lia', 1); flag(s, 'talkLia'); }, next: 'camp' },
        },
        {
          text: '🏹 홀로 몰래 편지를 쓰는 세라에게 다가간다',
          hint: '세라의 호감이 높을수록 유리',
          when: s => has(s, 'sera') && !s.flags.talkSera,
          check: { stat: 'CHA', dc: 13, extra: s => ({ label: '세라 호감', n: s.party.sera.aff }) },
          success: { text: '세라가 편지를 불 속에 던진다. "...난 그림자 교단의 첩자였어. 왕관을 훔쳐 오라는 명령을 받았지. 하지만 이젠 네 편이야." (세라 호감 +2, 신뢰 획득)', fx: s => { like(s, 'sera', 2); flag(s, 'seraTrust'); flag(s, 'talkSera'); note(s, '세라의 비밀을 듣고 신뢰를 얻음'); }, next: 'camp' },
          failure: { text: '"그냥 고향에 보내는 편지야." 세라는 편지를 품에 넣고 등을 돌렸다. 어딘가 찜찜하다.', fx: s => flag(s, 'talkSera'), next: 'camp' },
        },
        {
          text: '잠을 청한다 (체력 회복)',
          result: { text: '모닥불 곁에서 깊이 잠들었다. (체력 +10)', fx: s => heal(s, 10), next: 'gate' },
        },
      ],
    },

    gate: {
      title: '폐수도원 정문',
      text: `부서진 종탑에서 재가 눈처럼 흩날린다. 정문 앞, 녹슨 갑옷을 입은 해골 기사가 대검을 짚고 서 있다.`,
      choices: [
        { text: '정면으로 돌파한다', result: { fight: { enemy: 'skeleton', winText: '해골 기사의 투구가 굴러떨어졌다. 정문이 열린다.', win: 'hall' } } },
        {
          text: '"엘라의 이름으로 대주교를 만나러 왔다."',
          when: s => s.flags.knowsStory,
          result: { text: '딸의 이름을 듣자 해골 기사가 천천히 대검을 내린다. 문이 삐걱이며 열린다.', fx: s => note(s, '엘라의 이름으로 문지기를 지나침'), next: 'hall' },
        },
        {
          text: '쪽문으로 잠입한다',
          check: { stat: 'DEX', dc: 14, cls: { rogue: 2 }, aid: { sera: 2 } },
          success: { text: '무너진 담장 틈으로 소리 없이 숨어들었다.', next: 'hall' },
          failure: { text: '들켰다! 기사의 대검을 맞으며 간신히 안으로 굴러 들어갔다. (체력 -4)', fx: s => hurt(s, 4), next: 'hall' },
        },
        {
          text: '문에 걸린 마법 봉인을 해제한다',
          check: { stat: 'INT', dc: 14, cls: { mage: 1 }, aid: { lia: 2 } },
          success: { text: '봉인이 풀리자 해골 기사도 함께 무너져 내렸다.', next: 'hall' },
          failure: { text: '봉인이 역류해 몸을 태웠다! 기사가 다가온다. (체력 -3)', fx: s => hurt(s, 3), fight: { enemy: 'skeleton', winText: '해골 기사가 무너졌다.', win: 'hall' } },
        },
      ],
    },

    hall: {
      title: '대예배당',
      text: `부서진 스테인드글라스 사이로 달빛이 쏟아진다. 제단 뒤 계단이 지하 묘실로 이어진다. 내려가면 돌아올 수 없을 것 같다.`,
      choices: [
        {
          text: '📚 서고를 뒤진다',
          when: s => !s.flags.knowsStory && !s.flags.hallLib,
          check: { stat: 'INT', dc: 11, cls: { mage: 2 } },
          success: { text: "베르논의 일기를 찾았다: '엘라, 아빠가 꼭 데려올게. 마을 하나쯤이야...' (진실 획득)", fx: s => { flag(s, 'knowsStory'); flag(s, 'hallLib'); note(s, '서고에서 베르논의 일기를 찾음'); }, next: 'hall' },
          failure: { text: '책들은 모두 재로 변해 있었다.', fx: s => flag(s, 'hallLib'), next: 'hall' },
        },
        {
          text: '🕯️ 제단 앞에서 숨을 고른다',
          when: s => !s.flags.altar,
          result: { text: s => `희미한 성스러운 기운이 상처를 감싼다. (체력 +8)${has(s, 'lia') ? ' 리아가 곁에서 함께 기도했다. (리아 호감 +1)' : ''}`, fx: s => { heal(s, 8); like(s, 'lia', 1); flag(s, 'altar'); }, next: 'hall' },
        },
        {
          text: '💰 금박 성물함을 연다',
          when: s => !s.flags.chest,
          result: { text: s => `성물함 안에서 물약 두 병을 챙겼다. (물약 +2, 평판 -1)${has(s, 'lia') ? ' 리아가 한숨을 쉰다.' : ''}`, fx: s => { s.potions += 2; rep(s, -1); like(s, 'lia', -1); flag(s, 'chest'); note(s, '수도원 성물을 챙김'); }, next: 'hall' },
        },
        { text: '⬇️ 지하 묘실로 내려간다', result: { next: 'crypt' } },
      ],
    },

    crypt: {
      title: '지하 묘실 입구',
      text: `해골로 쌓은 아치 너머로 푸른 불꽃이 일렁인다. 바닥 곳곳에 발판식 함정이 보인다.`,
      choices: [
        {
          text: '🏹 세라가 앞장선다',
          when: s => has(s, 'sera'),
          result: { text: s => `세라가 망설임 없이 안전한 발판만 골라 밟는다. ${s.flags.seraTrust ? '"교단에서 받은 지도가 이럴 때 쓸모 있네."' : '...처음 와 본 곳이 맞나? 의심이 스친다.'} (세라 호감 +1)`, fx: s => like(s, 'sera', 1), next: 'confront' },
        },
        {
          text: '함정을 해제한다',
          check: { stat: 'DEX', dc: 13, cls: { rogue: 3 } },
          success: { text: '딸깍. 함정이 모두 멈췄다.', next: 'confront' },
          failure: { text: '벽에서 독침이 날아왔다! (체력 -5)', fx: s => hurt(s, 5), next: 'confront' },
        },
        {
          text: '마법으로 안전한 길을 밝힌다',
          check: { stat: 'INT', dc: 13, cls: { mage: 1 }, aid: { lia: 1 } },
          success: { text: '빛나는 발판이 길을 알려 준다.', next: 'confront' },
          failure: { text: '빛이 흔들리는 사이 바닥이 꺼졌다! (체력 -5)', fx: s => hurt(s, 5), next: 'confront' },
        },
        { text: '그냥 달려서 통과한다', result: { text: '칼날과 화살을 온몸으로 받아 내며 돌파했다. (체력 -6)', fx: s => hurt(s, 6), next: 'confront' } },
      ],
    },

    confront: {
      title: '재의 옥좌',
      enter: s => flag(s, 'deep'),
      text: `묘실 한복판, 재로 빚은 옥좌 위에 대주교 베르논이 앉아 있다. 그의 손엔 잿빛 불꽃이 이는 왕관이, 발치엔 작은 소녀의 관이 놓여 있다.

"딸을... 엘라를 돌려받을 것이다. 누구도 방해하지 마라."`,
      choices: [
        {
          text: '진심으로 설득한다',
          hint: '진실을 알고 있다면 훨씬 쉽다',
          check: { stat: 'CHA', dc: s => (s.flags.knowsStory ? 11 : 17), aid: { lia: 2 }, extra: s => ({ label: '평판', n: s.rep >= 2 ? 1 : 0 }) },
          success: { text: '"엘라는... 이런 걸 바라지 않았겠지." 베르논의 손에서 왕관이 미끄러진다.', fx: s => note(s, '베르논을 설득함'), next: 'end:peace' },
          failure: { text: '"네가 무엇을 안다고!" 베르논이 분노하며 일어선다!', fx: s => note(s, '설득 실패, 베르논과 결전'), fight: { enemy: 'vernon', winText: '베르논이 무릎을 꿇고 재가 되어 흩어진다. "엘라... 미안하다..."', win: s => (seraWillBetray(s) ? 'betrayal' : 'after_boss') } },
        },
        {
          text: '정면 결전을 벌인다',
          result: { fx: s => note(s, '베르논과 정면 결전'), fight: { enemy: 'vernon', winText: '베르논이 무릎을 꿇고 재가 되어 흩어진다. "엘라... 미안하다..."', win: s => (seraWillBetray(s) ? 'betrayal' : 'after_boss') } },
        },
        {
          text: '"그 힘, 나와 나누지 않겠소?"',
          hint: '평판이 낮은 자만 떠올리는 생각',
          when: s => s.rep <= 0,
          check: { stat: 'CHA', dc: 14 },
          success: { text: '베르논이 기묘하게 웃는다. "좋다... 너를 후계자로 삼지." 왕관이 당신의 머리 위로 내려앉는다.', fx: s => note(s, '베르논과 거래해 왕관을 받음'), next: 'end:ashking' },
          failure: { text: '"감히 왕관을 탐내느냐!" 베르논이 공격해 온다!', fight: { enemy: 'vernon', winText: '베르논이 재가 되어 흩어졌다.', win: s => (seraWillBetray(s) ? 'betrayal' : 'after_boss') } },
        },
        { text: '겁에 질려 도망친다', result: { text: '당신은 뒤돌아 계단을 뛰어오른다...', fx: s => note(s, '최후의 순간 도망침'), next: 'end:flee' } },
      ],
    },

    betrayal: {
      title: '세라의 배신',
      text: `베르논이 쓰러진 순간, 화살 한 대가 당신의 발치에 꽂힌다.

세라가 시위를 당긴 채 왕관 쪽으로 다가간다. "미안해. 그림자 교단은 처음부터 이 왕관이 목적이었어. 비켜 줘... 너까지 쏘고 싶진 않아."`,
      choices: [
        {
          text: '세라를 막아선다 (전투)',
          result: { fx: s => { s.party.sera.out = 'enemy'; note(s, '배신한 세라와 싸움'); }, fight: { enemy: 'sera', winText: '세라가 쓰러지며 웃는다. "...역시 넌 강하네." 그녀의 눈이 감긴다.', winFx: s => { s.party.sera.out = 'dead'; }, win: 'after_boss' } },
        },
        {
          text: '"함께한 길이 거짓이었어?" 설득한다',
          hint: '세라의 호감이 높을수록 유리',
          check: { stat: 'CHA', dc: 15, aid: { lia: 1 }, extra: s => ({ label: '세라 호감', n: s.party.sera.aff }) },
          success: { text: '세라의 활이 천천히 내려간다. "...바보 같은 소리. 하지만 맞아, 거짓은 아니었어." (세라 신뢰 획득)', fx: s => { flag(s, 'seraTrust'); like(s, 'sera', 2); note(s, '배신하려던 세라를 설득함'); }, next: 'after_boss' },
          failure: { text: '"늦었어." 세라의 화살이 어깨를 꿰뚫고, 그녀는 왕관을 낚아채 어둠 속으로 사라진다.', fx: s => { hurt(s, 4); s.party.sera.out = 'fled'; note(s, '세라에게 왕관을 빼앗김'); }, next: 'end:betrayal' },
        },
        {
          text: '왕관을 향해 먼저 몸을 날린다',
          check: { stat: 'DEX', dc: 14, cls: { rogue: 2 } },
          success: { text: '왕관을 먼저 낚아챘다! 세라는 혀를 차고 어둠 속으로 사라졌다.', fx: s => { s.party.sera.out = 'fled'; note(s, '세라보다 먼저 왕관을 손에 넣음'); }, next: 'after_boss' },
          failure: { text: '한발 늦었다. 세라가 왕관을 쥐고 사라진다. (체력 -3)', fx: s => { hurt(s, 3); s.party.sera.out = 'fled'; note(s, '세라에게 왕관을 빼앗김'); }, next: 'end:betrayal' },
        },
      ],
    },

    after_boss: {
      title: '속삭이는 왕관',
      text: `잿빛 왕관이 홀로 공중에 떠올라 속삭인다.

'나를 써라... 죽은 자도 산 자도 네게 무릎 꿇으리라...'`,
      choices: [
        {
          text: '왕관을 부순다',
          hint: '전사는 힘, 그 외는 지능으로 판정',
          check: { stat: s => (s.cls === 'warrior' ? 'STR' : 'INT'), dc: 13, aid: { garen: 1, lia: 2 } },
          success: { text: '왕관이 날카로운 비명과 함께 산산이 부서진다! 묘실을 채우던 푸른 불꽃이 꺼진다.', fx: s => note(s, '재의 왕관을 파괴함'), next: s => (s.rep >= 2 ? 'end:hero' : 'end:lonely') },
          failure: { text: '왕관에 금만 갔다. 저주의 반동이 몸을 할퀸다. (체력 -4) 다시 시도할 수 있다.', fx: s => hurt(s, 4), next: 'after_boss' },
        },
        {
          text: '✨ 리아가 자신을 바쳐 왕관을 봉인한다',
          hint: '리아의 호감이 아주 높을 때만',
          when: s => has(s, 'lia') && s.party.lia.aff >= 3,
          result: { text: '"괜찮아요. 이게 제가 받은 사명이었어요." 리아가 왕관을 끌어안자 눈부신 빛이 묘실을 가득 채운다.', fx: s => { s.party.lia.out = 'sacrificed'; note(s, '리아가 스스로를 바쳐 왕관을 봉인함'); }, next: 'end:sacrifice' },
        },
        { text: '왕관을 머리에 쓴다', result: { text: '차가운 불꽃이 두개골 속으로 스며든다. 수천의 목소리가 당신을 왕이라 부른다.', fx: s => note(s, '스스로 재의 왕관을 씀'), next: 'end:ashking' } },
        { text: '왕관을 보자기에 싸서 챙긴다', result: { text: '이만한 보물이라면 어느 왕가든 비싸게 사 줄 것이다.', fx: s => note(s, '왕관을 팔기 위해 챙김'), next: 'end:merchant' } },
      ],
    },
  };

  // =====================================================
  // 3) 엔딩 (type: good 좋음 / mid 중간 / bad 나쁨)
  // =====================================================
  const ENDINGS = {
    hero: {
      title: '새벽의 영웅', type: 'good', icon: '🌅', hint: '왕관을 파괴하고, 평판을 높게 유지하자.',
      text: s => `왕관이 부서진 새벽, 회색여울의 무덤들은 영원히 잠잠해졌다. 마을 광장엔 ${s.name}의 이름을 새긴 비석이 세워졌고, 음유시인들은 '재를 걷어 낸 ${CLASSES[s.cls].name}'의 노래를 부른다.`,
    },
    peace: {
      title: '화해의 종소리', type: 'good', icon: '🔔', hint: '베르논의 진실을 알고, 칼 대신 말로.',
      text: () => `베르논은 딸의 관 앞에 무릎 꿇고 마지막 작별을 고했다. 그가 스스로 왕관의 불꽃을 거두자 묶여 있던 영혼들이 하나둘 하늘로 올라갔다. 다음 날 아침, 수도원의 종이 석 달 만에 맑게 울렸다. 피 한 방울 흘리지 않은 결말이었다.`,
    },
    sacrifice: {
      title: '성녀의 봉인', type: 'mid', icon: '🕊️', hint: '깊은 유대를 맺은 성직자가 있다면...',
      text: () => `빛이 걷혔을 때 리아는 사라지고, 왕관은 투명한 수정 속에 영원히 봉인되어 있었다. 마을은 구원받았고 예배당엔 그녀의 성상이 세워졌다. 종이 울릴 때마다 당신은 그녀의 마지막 미소를 떠올린다.`,
    },
    lonely: {
      title: '이름 없는 승리', type: 'mid', icon: '🌫️', hint: '왕관을 부쉈지만 평판이 낮다면?',
      text: () => `왕관은 부서졌고 저주는 끝났다. 하지만 마을 사람들은 당신을 반기지 않았다. "그 모험가? 유품이나 뒤지던 사람이잖아." 당신은 보수 주머니만 챙겨 아무도 배웅하지 않는 길을 떠났다. 구원은 했으되, 기억되지는 않았다.`,
    },
    merchant: {
      title: '왕관 상인', type: 'mid', icon: '💰', hint: '왕관을 부수지도, 쓰지도 않는다면.',
      text: () => `당신은 왕관을 이웃 왕국의 귀족에게 금화 산더미를 받고 팔았다. 회색여울은 평화를 되찾았고 당신은 부자가 되었다. 하지만 몇 해 뒤, 그 왕국에서 무덤이 갈라진다는 소문이 들려오기 시작했다...`,
    },
    ashking: {
      title: '재의 왕', type: 'bad', icon: '👑', hint: '왕관의 속삭임에 귀를 기울인다면.',
      text: s => `${s.name}은(는) 재의 옥좌에 앉았다. 죽은 자들이 일어나 새 왕에게 절했고, 회색여울은 첫 번째 제물이 되었다. 수백 년 뒤, 또 다른 모험가가 이 묘실의 계단을 내려올 것이다 — 당신을 쓰러뜨리기 위해.`,
    },
    betrayal: {
      title: '그림자 교단의 밤', type: 'bad', icon: '🌑', hint: '비밀을 품은 동료를 끝까지 믿지 못했다면.',
      text: () => `세라는 왕관을 그림자 교단에 바쳤다. 한 달 뒤, 왕국 곳곳에서 동시에 무덤이 열렸다. 당신은 살아남았지만, 그날 밤 그녀를 붙잡지 못한 것을 평생 후회하게 된다.`,
    },
    flee: {
      title: '겁쟁이의 도주', type: 'bad', icon: '🏃', hint: '모든 걸 등지고 떠난다면.',
      text: s => (s.flags.deep
        ? `코앞까지 갔던 승리를 버리고 당신은 달아났다. 등 뒤로 베르논의 웃음소리가 울려 퍼졌고, 그해 겨울 회색여울은 지도에서 사라졌다.`
        : `당신은 회색여울을 떠나 남쪽으로 향했다. 몇 주 뒤 여관에서 들은 소문 — '북쪽 변경의 마을 하나가 통째로 사라졌다더군.' 당신은 잔을 비우고 아무 말도 하지 않았다.`),
    },
    death: {
      title: '이름 없는 무덤', type: 'bad', icon: '⚰️', hint: '체력이 0이 되면...',
      text: s => `${s.name}의 여정은 '${SCENES[s.scene] ? SCENES[s.scene].title : '어딘가'}'에서 끝났다. 며칠 뒤, 당신의 무덤 역시 갈라지기 시작했다...`,
    },
  };
  const ENDING_TYPES = { good: '좋은 결말', mid: '중간 결말', bad: '나쁜 결말' };

  // 엔딩 화면에 덧붙일 동료들의 후일담
  function partyEpilogue(s) {
    return Object.keys(s.party).map(id => {
      const p = s.party[id], n = COMPANIONS[id].name;
      if (p.out === 'sacrificed') return `${n}: 봉인이 되어 영원히 마을을 지킨다.`;
      if (p.out === 'dead') return `${n}: 묘실에서 당신의 칼에 쓰러졌다.`;
      if (p.out === 'fled') return `${n}: 왕관을 들고 그림자 교단으로 돌아갔다.`;
      if (p.aff >= 3) return `${n}: 끝까지 당신의 곁에 남아 다음 모험을 약속했다. (호감 ${p.aff})`;
      if (p.aff >= 1) return `${n}: 몫을 챙겨 떠났지만 가끔 안부 편지를 보낸다. (호감 ${p.aff})`;
      return `${n}: 인사도 없이 떠났다. (호감 ${p.aff})`;
    });
  }

  // =====================================================
  // 4) 게임 진행 / 판정
  // =====================================================
  let s = null;            // 저장되는 게임 상태
  const ui = {             // 저장되지 않는 화면 상태
    screen: 'title', back: 'title', snapshot: null,
    pickClass: 'warrior',
    outcome: null, combat: null, ending: null,
  };

  function newState(cls, name) {
    const c = CLASSES[cls];
    return { cls, name, stats: { ...c.stats }, hp: c.hp, maxHp: c.hp, rep: 0, potions: 2, party: {}, flags: {}, log: [], scene: 'arrival', turns: 0 };
  }

  function visibleChoices() {
    return SCENES[s.scene].choices.filter(c => !c.when || c.when(s));
  }

  // 판정에 들어가는 보정치 계산 (선택지 힌트와 실제 굴림이 같은 계산을 쓴다)
  function checkInfo(c) {
    const stat = val(c.stat, s);
    const parts = [{ label: STAT_NAMES[stat], n: mod(s.stats[stat]) }];
    if (c.cls && c.cls[s.cls]) parts.push({ label: '직업', n: c.cls[s.cls] });
    if (c.aid) for (const id in c.aid) if (has(s, id)) parts.push({ label: COMPANIONS[id].name, n: c.aid[id] });
    if (c.extra) { const e = c.extra(s); if (e.n) parts.push(e); }
    const bonus = parts.reduce((a, p) => a + p.n, 0);
    const dc = val(c.dc, s);
    // 1은 항상 실패, 20은 항상 성공
    const chance = Math.max(5, Math.min(95, (21 - (dc - bonus)) * 5));
    return { stat, parts, bonus, dc, chance };
  }

  function rollCheck(c) {
    const info = checkInfo(c);
    const r = d20();
    const total = r + info.bonus;
    const success = r === 20 || (r !== 1 && total >= info.dc);
    return { ...info, r, total, success };
  }

  function enterScene(id) {
    if (s.hp <= 0) return showEnding('death');
    if (id.startsWith('end:')) return showEnding(id.slice(4));
    s.scene = id;
    const sc = SCENES[id];
    if (sc.enter) sc.enter(s);
    ui.outcome = null;
    ui.combat = null;
    ui.screen = 'game';
    ui.snapshot = JSON.stringify(s);   // 장면 시작 시점의 상태 (저장은 항상 이 시점 기준)
    saveGame(true);
    render();
    window.scrollTo(0, 0);
  }

  function pickChoice(i) {
    const ch = visibleChoices()[i];
    if (!ch) return;
    let res, dice = null;
    if (ch.check) {
      dice = rollCheck(ch.check);
      res = dice.success ? ch.success : ch.failure;
    } else {
      res = ch.result;
    }
    s.turns++;
    if (res.fx) res.fx(s);
    // 글이 없고 바로 넘어가는 선택지(장소 이동 등)는 결과 화면 생략
    if (!res.text && !dice) return continueOutcome(res);
    ui.outcome = { choice: ch.text, dice, text: val(res.text, s) || '', res };
    render();
    window.scrollTo(0, 0);
  }

  function continueOutcome(res) {
    if (s.hp <= 0) return showEnding('death');
    if (res.fight) return startCombat(res.fight);
    enterScene(val(res.next, s));
  }

  // =====================================================
  // 5) 간단한 턴제 전투
  //  내 행동 → 동료 자동 행동 → 적 행동 순서
  // =====================================================
  function startCombat(f) {
    const e = ENEMIES[f.enemy];
    ui.outcome = null;
    ui.combat = { f, e, hp: e.hp, cd: 0, round: 1, over: null, log: [`${e.icon} ${e.name}이(가) 덤벼든다!`] };
    render();
    window.scrollTo(0, 0);
  }

  function combatAct(act) {
    const c = ui.combat, e = c.e, cl = CLASSES[s.cls];
    if (!c || c.over) return;
    const lines = [];
    let defending = false;

    // --- 내 행동 ---
    if (act === 'attack' || act === 'skill') {
      const useSkill = act === 'skill';
      if (useSkill && c.cd > 0) return;
      const m = mod(s.stats[cl.atk]);
      const r = d20();
      const hitBonus = m + 2 + (useSkill ? cl.skill.hit : 0);
      const hit = (useSkill && cl.skill.auto) || r === 20 || (r !== 1 && r + hitBonus >= e.ac);
      const name = useSkill ? cl.skill.name : cl.basic.name;
      if (hit) {
        let dmg = rnd(cl.basic.dmg[0], cl.basic.dmg[1]) + m;
        if (useSkill) dmg = Math.round(dmg * cl.skill.mult);
        const crit = r >= cl.crit;
        if (crit) dmg *= 2;
        dmg = Math.max(1, dmg);
        c.hp -= dmg;
        lines.push(`${crit ? '💥 치명타! ' : ''}${name} 명중! (🎲${r}) ${e.name}에게 ${dmg} 피해`);
      } else {
        lines.push(`${name}이(가) 빗나갔다... (🎲${r}${sign(hitBonus)} vs 방어 ${e.ac})`);
      }
    } else if (act === 'potion') {
      if (s.potions <= 0) return;
      s.potions--;
      const before = s.hp;
      heal(s, 12);
      lines.push(`🧪 물약을 마셨다. 체력 +${s.hp - before}`);
    } else if (act === 'defend') {
      defending = true;
      lines.push('🛡️ 방어 자세를 취했다. (받는 피해 절반, 회피 +3)');
    }
    if (act === 'skill') c.cd = 3; else if (c.cd > 0) c.cd--;

    // --- 동료 행동 ---
    if (c.hp > 0) {
      for (const id of Object.keys(s.party)) {
        if (!has(s, id) || c.hp <= 0) continue;
        if (id === 'lia') {
          if (s.hp <= s.maxHp * 0.55) {
            const before = s.hp; heal(s, rnd(5, 8));
            lines.push(`✨ 리아의 치유 기도! 체력 +${s.hp - before}`);
          } else {
            const dmg = rnd(2, 4); c.hp -= dmg;
            lines.push(`✨ 리아의 성스러운 빛! ${dmg} 피해`);
          }
        } else {
          const stat = id === 'garen' ? { b: 4, dmg: [3, 6], name: '🛡️ 가렌의 도끼' } : { b: 5, dmg: [3, 5], name: '🏹 세라의 화살' };
          if (d20() + stat.b >= e.ac) {
            const dmg = rnd(stat.dmg[0], stat.dmg[1]); c.hp -= dmg;
            lines.push(`${stat.name} 명중! ${dmg} 피해`);
          } else lines.push(`${stat.name}이(가) 빗나갔다.`);
        }
      }
    }

    // --- 승리 확인, 아니면 적 행동 ---
    if (c.hp <= 0) {
      c.hp = 0;
      c.over = 'win';
      lines.push(`🏆 ${e.name}을(를) 쓰러뜨렸다!`);
    } else {
      const myAc = 10 + mod(s.stats.DEX) + (defending ? 3 : 0);
      const allies = Object.keys(s.party).filter(id => has(s, id));
      if (e.special && c.round % 3 === 0) {
        const dmg = defending ? Math.ceil(e.special.dmg / 2) : e.special.dmg;
        hurt(s, dmg);
        lines.push(`☠️ ${e.name}의 ${e.special.name}! 피할 수 없다. ${dmg} 피해`);
      } else if (allies.length && Math.random() < 0.3) {
        const id = allies[rnd(0, allies.length - 1)];
        lines.push(`${e.icon} ${e.name}이(가) ${COMPANIONS[id].name}을(를) 노렸지만, ${COMPANIONS[id].name}이(가) 버텨 냈다.`);
      } else {
        const r = d20();
        if (r === 20 || (r !== 1 && r + e.atk >= myAc)) {
          let dmg = rnd(e.dmg[0], e.dmg[1]);
          if (defending) dmg = Math.ceil(dmg / 2);
          hurt(s, dmg);
          lines.push(`${e.icon} ${e.name}의 공격! ${dmg} 피해를 입었다.`);
        } else {
          lines.push(`${e.icon} ${e.name}의 공격을 피했다! (🎲${r}${sign(e.atk)} vs 회피 ${myAc})`);
        }
      }
      if (s.hp <= 0) { c.over = 'lose'; lines.push('💀 쓰러졌다...'); }
      c.round++;
    }

    // 이번 턴 내용을 한 덩어리로 맨 위에 쌓는다
    c.log = [lines.join('<br>')].concat(c.log).slice(0, 8);
    render();
  }

  function endCombat() {
    const c = ui.combat;
    if (c.over === 'lose') return showEnding('death');
    if (c.f.winFx) c.f.winFx(s);
    ui.combat = null;
    enterScene(val(c.f.win, s));
  }

  // =====================================================
  // 6) 저장 · 불러오기 · 엔딩 도감 (localStorage)
  // =====================================================
  function saveGame(silent) {
    try {
      if (!ui.snapshot) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ s: JSON.parse(ui.snapshot), at: Date.now() }));
      if (!silent) toast('💾 저장했습니다 (현재 장면 시작 시점)');
    } catch (err) {
      if (!silent) toast('저장할 수 없습니다');
    }
  }

  function readSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      return data && data.s && SCENES[data.s.scene] ? data : null;
    } catch (err) { return null; }
  }

  function loadGame() {
    const data = readSave();
    if (!data) return toast('저장된 게임이 없습니다');
    s = data.s;
    ui.snapshot = JSON.stringify(s);
    ui.outcome = null; ui.combat = null; ui.screen = 'game';
    render();
    toast('📂 불러왔습니다');
  }

  function readCodex() {
    try { return JSON.parse(localStorage.getItem(CODEX_KEY)) || {}; } catch (err) { return {}; }
  }

  function showEnding(id) {
    const codex = readCodex();
    const isNew = !codex[id];
    codex[id] = { count: (codex[id] ? codex[id].count : 0) + 1, cls: s.cls, at: Date.now() };
    try { localStorage.setItem(CODEX_KEY, JSON.stringify(codex)); } catch (err) { /* 무시 */ }
    ui.ending = { id, isNew };
    ui.outcome = null; ui.combat = null; ui.screen = 'ending';
    render();
    window.scrollTo(0, 0);
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // =====================================================
  // 7) 화면 그리기
  // =====================================================
  function hpState() {
    const p = s.hp / s.maxHp;
    if (p >= 0.7) return { cls: 'good', label: '건강' };
    if (p >= 0.4) return { cls: 'warn', label: '부상' };
    return { cls: 'bad', label: '위험' };
  }

  function repState() {
    if (s.rep >= 3) return { cls: 'c-gold', label: '존경받음' };
    if (s.rep >= 1) return { cls: 'c-blue', label: '호의적' };
    if (s.rep === 0) return { cls: 'c-muted', label: '중립' };
    if (s.rep >= -2) return { cls: 'c-warn', label: '불신' };
    return { cls: 'c-bad', label: '악명 높음' };
  }

  function affLabel(a) {
    if (a >= 3) return { cls: 'c-good', label: '깊은 신뢰' };
    if (a >= 1) return { cls: 'c-blue', label: '우호' };
    return { cls: 'c-bad', label: '냉담' };
  }

  function statusHtml() {
    const c = CLASSES[s.cls], hp = hpState(), rp = repState();
    const members = Object.keys(s.party).filter(id => has(s, id));
    return `
      <section class="status">
        <div class="row">
          <span class="who">${c.icon} ${esc(s.name)} · ${c.name}</span>
          <span class="tag c-${hp.cls}">${hp.label}</span>
        </div>
        <div class="bar"><i class="bg-${hp.cls}" style="width:${(s.hp / s.maxHp) * 100}%"></i></div>
        <small>체력 ${s.hp} / ${s.maxHp} · 🧪 물약 ${s.potions}개</small>
        <div class="row" style="margin-top:8px">
          <span>평판 ${sign(s.rep)}</span><span class="tag ${rp.cls}">${rp.label}</span>
        </div>
        <div class="rep-track"><b style="left:${((s.rep + 5) / 10) * 100}%"></b></div>
        <div class="chips">
          ${Object.keys(STAT_NAMES).map(k => `<span class="chip">${STAT_NAMES[k]} ${s.stats[k]} (${sign(mod(s.stats[k]))})</span>`).join('')}
        </div>
        <div class="chips">
          ${members.length ? members.map(id => {
            const a = affLabel(s.party[id].aff);
            return `<span class="chip">${COMPANIONS[id].icon} ${COMPANIONS[id].name} <b class="${a.cls}">${a.label} ${s.party[id].aff}</b></span>`;
          }).join('') : '<span class="chip c-muted">동료 없음</span>'}
        </div>
      </section>`;
  }

  function topBar() {
    return `<div class="top-bar">
      <button data-act="save">💾 저장</button>
      <button data-act="load">📂 불러오기</button>
      <button data-act="codex">📖 도감</button>
      <button data-act="title">🏠 처음</button>
    </div>`;
  }

  const paras = t => t.split('\n\n').map(p => `<p>${p}</p>`).join('');

  function choiceHint(ch) {
    const hints = [];
    if (ch.check) {
      const info = checkInfo(ch.check);
      const lv = info.chance >= 65 ? 'high' : info.chance >= 40 ? 'mid' : 'low';
      const bonus = info.parts.map(p => `${p.label} ${sign(p.n)}`).join(', ');
      hints.push(`🎲 ${STAT_NAMES[info.stat]} 판정 · 난이도 ${info.dc} · ${bonus} · <b class="chance-${lv}">성공 확률 약 ${info.chance}%</b>`);
    }
    if (ch.hint) hints.push(ch.hint);
    return hints.length ? `<span class="hint">${hints.join('<br>')}</span>` : '';
  }

  function renderTitle() {
    const save = readSave();
    const seen = Object.keys(readCodex()).length;
    return `
      <section class="title-screen">
        <h1>재의 왕관</h1>
        <p class="sub">선택과 주사위가 운명을 가르는 텍스트 판타지 RPG<br>엔딩 ${Object.keys(ENDINGS).length}종 · 한 판 약 15분</p>
        <button class="btn primary" data-act="new">⚔️ 새 게임</button>
        <button class="btn" data-act="load" ${save ? '' : 'disabled'}>📂 이어하기${save ? ` <span class="hint">${esc(save.s.name)} · ${SCENES[save.s.scene].title}</span>` : ''}</button>
        <button class="btn" data-act="codex">📖 엔딩 도감 (${seen}/${Object.keys(ENDINGS).length})</button>
      </section>`;
  }

  function renderCreate() {
    return `
      <h2>캐릭터 만들기</h2>
      <p class="c-muted">직업에 따라 능력치와 전용 선택지, 전투 기술이 달라집니다.</p>
      ${Object.keys(CLASSES).map(k => {
        const c = CLASSES[k];
        return `<button class="class-card ${ui.pickClass === k ? 'selected' : ''}" data-act="class" data-id="${k}">
          <div class="name">${c.icon} ${c.name}</div>
          <div>${c.desc}</div>
          <div class="stats">체력 ${c.hp} · ${Object.keys(c.stats).map(st => `${STAT_NAMES[st]} ${c.stats[st]}`).join(' · ')}<br>기술: ${c.skill.name} (${c.skill.desc})</div>
        </button>`;
      }).join('')}
      <label for="hero-name">이름</label>
      <input id="hero-name" class="name-input" maxlength="10" placeholder="방랑자" value="">
      <button class="btn primary" data-act="start">모험 시작</button>
      <button class="btn center" data-act="title">뒤로</button>`;
  }

  function renderGame() {
    let body;
    if (ui.combat) body = renderCombat();
    else if (ui.outcome) body = renderOutcome();
    else {
      const sc = SCENES[s.scene];
      body = `
        ${artCanvas('scene', sc.title)}
        <article class="story"><h2>${sc.title}</h2>${paras(val(sc.text, s))}</article>
        ${visibleChoices().map((ch, i) => `<button class="btn" data-act="choice" data-i="${i}">${ch.text}${choiceHint(ch)}</button>`).join('')}`;
    }
    return topBar() + journeyHtml() + statusHtml() + body;
  }

  // 진행 지도 (마을 → ... → 재의 옥좌)
  function journeyHtml() {
    const cur = stageIndex(s.scene);
    return `<div class="journey">
      <canvas class="pixel map" data-art="map" width="128" height="18" role="img" aria-label="진행 지도"></canvas>
      <small>📍 ${cur + 1} / ${STAGES.length} · ${STAGES[cur].name}</small>
    </div>`;
  }

  function renderOutcome() {
    const o = ui.outcome, dice = o.dice;
    const diceHtml = dice ? `
      <div class="dice ${dice.success ? 'ok' : 'no'}">
        🎲 d20 <span class="num">${dice.r}</span>
        ${dice.parts.map(p => ` ${sign(p.n)} ${p.label}`).join('')} = <b>${dice.total}</b> / 난이도 ${dice.dc}
        → <b class="${dice.success ? 'c-good' : 'c-bad'}">${dice.r === 20 ? '대성공!' : dice.r === 1 ? '대실패!' : dice.success ? '성공!' : '실패...'}</b>
      </div>` : '';
    return `
      ${artCanvas('scene', SCENES[s.scene].title)}
      <article class="story">
        <p class="c-muted">▶ ${o.choice}</p>
        ${diceHtml}
        ${paras(o.text)}
      </article>
      <button class="btn primary" data-act="continue">${o.res.fight ? '⚔️ 전투 시작' : '계속 ▶'}</button>`;
  }

  function renderCombat() {
    const c = ui.combat, e = c.e, cl = CLASSES[s.cls];
    const pct = (c.hp / e.hp) * 100;
    let buttons;
    if (c.over === 'win') {
      buttons = `<p>${c.f.winText || ''}</p><button class="btn primary" data-act="endcombat">계속 ▶</button>`;
    } else if (c.over === 'lose') {
      buttons = `<button class="btn primary" data-act="endcombat">결말 보기</button>`;
    } else {
      buttons = `<div class="actions">
        <button class="btn" data-act="fight" data-a="attack">⚔️ ${cl.basic.name}<span class="hint">${STAT_NAMES[cl.atk]} 공격</span></button>
        <button class="btn" data-act="fight" data-a="skill" ${c.cd > 0 ? 'disabled' : ''}>🔥 ${cl.skill.name}<span class="hint">${c.cd > 0 ? `${c.cd}턴 후 사용 가능` : cl.skill.desc}</span></button>
        <button class="btn" data-act="fight" data-a="defend">🛡️ 방어<span class="hint">피해 절반</span></button>
        <button class="btn" data-act="fight" data-a="potion" ${s.potions > 0 ? '' : 'disabled'}>🧪 물약<span class="hint">체력 +12 (${s.potions}개)</span></button>
      </div>`;
    }
    return `
      ${artCanvas('combat', e.name + '와의 전투')}
      <section class="enemy">
        <div class="row" style="display:flex;justify-content:space-between">
          <span class="name">${e.icon} ${e.name}</span><span>${c.over ? '' : `${c.round}턴`}</span>
        </div>
        <div class="bar"><i class="bg-bad" style="width:${pct}%"></i></div>
        <small>체력 ${c.hp} / ${e.hp} · 방어 ${e.ac}${e.special ? ` · 3턴마다 ${e.special.name}` : ''}</small>
      </section>
      <div class="combat-log">${c.log.map(l => `<div>${l}</div>`).join('')}</div>
      ${buttons}`;
  }

  function renderEnding() {
    const en = ENDINGS[ui.ending.id];
    const rp = repState();
    const epi = partyEpilogue(s);
    const seen = Object.keys(readCodex()).length;
    return `
      <section class="ending-head">
        <div class="icon">${en.icon}</div>
        <p class="type-${en.type}"><b>${ENDING_TYPES[en.type]}</b>${ui.ending.isNew ? ' · ✨ 새 엔딩!' : ''}</p>
        <h1>${en.title}</h1>
      </section>
      ${artCanvas('ending', en.title)}
      <article class="story">${paras(en.text(s))}</article>
      <section class="summary">
        <h3>📜 여정 요약</h3>
        <div>${CLASSES[s.cls].icon} ${esc(s.name)} (${CLASSES[s.cls].name}) · 체력 ${s.hp}/${s.maxHp} · 평판 ${sign(s.rep)} <span class="${rp.cls}">${rp.label}</span> · 선택 ${s.turns}회</div>
        ${epi.length ? `<h3 style="margin-top:12px">👥 동료들</h3><ul>${epi.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="c-muted" style="margin-top:8px">홀로 걸은 여정이었다.</p>'}
        <h3 style="margin-top:12px">🧭 주요 선택</h3>
        <ul>${s.log.map(t => `<li>${t}</li>`).join('')}</ul>
      </section>
      <p class="c-muted" style="text-align:center">엔딩 도감 ${seen} / ${Object.keys(ENDINGS).length}</p>
      <button class="btn primary" data-act="new">🔄 다시하기</button>
      <button class="btn center" data-act="codex">📖 엔딩 도감</button>
      <button class="btn center" data-act="title">🏠 처음으로</button>`;
  }

  function renderCodex() {
    const codex = readCodex();
    const ids = Object.keys(ENDINGS);
    return `
      <h2>📖 엔딩 도감 (${ids.filter(id => codex[id]).length}/${ids.length})</h2>
      ${ids.map(id => {
        const en = ENDINGS[id], got = codex[id];
        return got
          ? `<div class="codex-item"><h3>${en.icon} ${en.title} <small class="type-${en.type}">${ENDING_TYPES[en.type]}</small></h3>
             <small>${got.count}회 달성 · 처음 본 직업: ${CLASSES[got.cls] ? CLASSES[got.cls].name : '?'}</small></div>`
          : `<div class="codex-item locked"><h3>🔒 ??? <small class="type-${en.type}">${ENDING_TYPES[en.type]}</small></h3>
             <small>힌트: ${en.hint}</small></div>`;
      }).join('')}
      <button class="btn center" data-act="back">돌아가기</button>`;
  }

  function render() {
    const screens = { title: renderTitle, create: renderCreate, game: renderGame, ending: renderEnding, codex: renderCodex };
    app.innerHTML = screens[ui.screen]();
    paintArt();
  }

  // =====================================================
  // 8) 도트 그림 (canvas에 픽셀을 한 칸씩 찍어서 그린다)
  //  - 그림 크기는 128x72 픽셀, CSS로 확대해서 보여 준다
  //  - 스프라이트: 글자 한 개 = 픽셀 한 칸, '.' 은 투명
  // =====================================================
  const PAL = {
    k: '#1b1622', s: '#e8b796', S: '#b98263', h: '#5a3a22', y: '#e8c34a', w: '#e8e8f0',
    g: '#9aa3ad', G: '#5d6670', r: '#b8383a', R: '#7a2028', b: '#3a64b8', B: '#253d78',
    p: '#7b4bb0', P: '#4a2a70', n: '#7a5230', N: '#4d321c', e: '#3f8a4a', E: '#25562d',
    c: '#8fe8ff', C: '#4fb0d0', o: '#ff9a2e', O: '#ffe066', z: '#d8d0b8', Z: '#9a9078',
    x: '#3a1a50', v: '#c070ff', a: '#2a2a35', m: '#7a9a4a', M: '#4a6a2a',
  };

  const SPR = {
    // 주인공 (직업별)
    warrior: ['..kkkk...', '.kGggGk..', '.kskskk.w', '.kssssk.w', 'kgrrrrgkw', 'kgrRRrgkw', 'ksrrrrsks', '.kgggGk.N', '.kgk.gk..', '.kGk.Gk..', '.kNk.Nk..', '.kk..kk..'],
    mage: ['....kk..O', '...kppk.k', '..kppppkn', 'kkkkkkkkn', '.kskskk.n', '.kssssk.n', '.kwwwwk.n', 'kppwwppsn', '.kppppk.n', '.kpPPPk.n', 'kppPPPpkn', '.kkkkkk.n'],
    rogue: ['..kkkkk..', '.kEEEEEk.', '.kEaaaEk.', '.kEskskk.', '.kEsssEk.', 'kEEnnnEEk', 'kEnNNNnEk', 'ksnnnnnsg', '.knnnnnkg', '.kak.kak.', '.kak.kak.', '.kk...kk.'],
    // 동료
    garen: ['..kkkk..g', '.khhhhkgG', '.kskskk.n', '.khsshk.n', 'kghhhhgkn', 'kgnnnngkn', 'ksnNNnssn', '.kgnngk.n', '.knnnnk..', '.kNk.kNk.', '.kNk.kNk.', '.kk...kk.'],
    lia: ['..kkkk..', '.kyyyyk.', 'kyskskyk', 'kyssssyk', '.kwwwwk.', 'kwwOwwwk', 'kwOOOwwk', 'kswOwwsk', '.kwwwwk.', '.kwwwwk.', 'kwwwwwwk', '.kkkkkk.'],
    sera: ['..kkkk.k.', '.kyyyyk.n', 'sksksks.n', '.kssssk.n', 'kEEEEEEkn', 'kEeeeeEkn', 'ksEeeEskn', '.kEeeEk.n', '.kEEEEk.k', '.knk.knk.', '.knk.knk.', '.kk...kk.'],
    // 등장인물과 적
    elder: ['..kkkk..O', '.kwwwwk.o', '.kskskk.n', '.kwsswk.n', 'kNwwwwNkn', 'kNnnnnNkn', 'ksnnnnnsn', '.knnnnk..', '.knnnnk..', '.knnnnk..', 'knnnnnnk.', '.kkkkkk..'],
    ghost: ['..cccc..c', '.cCccCc.c', '.ckcckc.c', '.cccccc.c', 'cCccccCcc', 'cccCCcccc', '.cccccc..', '.cCccCc..', '..cccc...', '..cCcc...', '...cc....', '....c....'],
    spirit: ['..ccc..', '.ccccc.', '.ckcck.', '.ccccc.', 'cccccCc', 'ccccccc', '.cCcccc', '.ccccC.', '..cc.c.', '...c...'],
    spiritKid: ['.ccc.', 'ckcck', 'ccccc', 'cCccc', '.ccc.', '..c..'],
    bandit: ['..RRRR..', '.RrrrrRr', '.kskskk.', '.kaaaak.', 'knnnnnnk', 'knNNNNnk', 'ksnnnnsg', '.kaaaak.', '.kak.ak.', '.kak.ak.', '.kNk.Nk.', '.kk..kk.'],
    ghoul: ['..kkkk....', '.kmmmmk...', 'kmrmmrmk..', '.kmMMmk...', 'kmmmmmmk..', 'kmMmmMmmk.', 'mk.mmm.km.', 'm..mMm..m.', '...mmm....', '..mk.km...', '..mk.km...', '.mm...mm..'],
    skeleton: ['..kGGGk...', '.kgggggk.w', '.kgkzkgk.w', '.kzzzzzk.w', '..kzkzk..w', 'kGgggggGkg', 'kgGRRRGgzn', 'kz.gRg.k..', '..kgggk...', '..kz.zk...', '..kz.zk...', '.kGk.kGk..'],
    vernon: ['..v.v.v...', '..gZgZg...', '.kPPPPPk..', '.kPvzvPk..', '.kPzzzPk..', 'kPxPPPxPk.', 'kxPwwwPxk.', 'zxPwPwPxz.', '.kPwPwPk..', '.kxPPPxk..', 'kxxPPPxxk.', 'kkkkkkkkk.'],
    crown: ['v.v.v', 'ZvZvZ', 'ZgZgZ', 'ZZZZZ'],
    // 진행 지도 아이콘 (7x7)
    iHouse: ['...r...', '..rrr..', '.rrrrr.', 'rrrrrrr', '.nnOnn.', '.nnOnn.', '.nnnnn.'],
    iTomb: ['.ggggg.', '.ggkgg.', '.gkkkg.', '.ggkgg.', '.ggggg.', '.ggggg.', 'eeeeeee'],
    iBridge: ['.......', '.......', 'ggggggg', 'gGgggGg', 'gg...gg', 'g.....g', 'bbbbbbb'],
    iSpirit: ['..ccc..', '.ccccc.', '.ckcck.', '.ccccc.', 'ccccccc', 'c.c.c.c', '.......'],
    iFire: ['...o...', '..oOo..', '.oOOOo.', '.oOOOo.', '..ooo..', '.n.n.n.', 'nnnnnnn'],
    iChurch: ['...O...', '..OOO..', '...g...', '..ggg..', '.ggggg.', '.gg.gg.', '.gg.gg.'],
    iSkull: ['.zzzzz.', 'zzzzzzz', 'zkzzzkz', 'zkzzzkz', 'zzzkzzz', '.zzzzz.', '.zkzkz.'],
    iCrown: ['v..v..v', 'Z.vZv.Z', 'ZZZZZZZ', 'ZvZvZvZ', 'ZZZZZZZ', '.......', '.......'],
  };

  const SKIES = {
    dusk: ['#2b1d3f', '#4a2a55', '#7a3b5a', '#b8524a', '#e8904a'],
    night: ['#0b0d1e', '#10142c', '#161c3c', '#1d244c', '#252e5c'],
    fog: ['#2e3240', '#3c4150', '#4c5262', '#5d6374', '#6e7586'],
    dawn: ['#34407a', '#5e5e98', '#b07090', '#e89a78', '#ffd27a'],
    violet: ['#0e0616', '#1a0a26', '#2a0e3a', '#3c124e', '#521866'],
    blood: ['#0a0608', '#1a0a10', '#2a0e16', '#3a121c', '#4a1822'],
  };

  // 진행 지도: 장면들을 8단계로 묶는다
  const STAGES = [
    { name: '회색여울 마을', icon: 'iHouse', scenes: ['arrival', 'hub', 'tavern', 'chapel', 'forest'] },
    { name: '북쪽 가도', icon: 'iTomb', scenes: ['road'] },
    { name: '망령의 다리', icon: 'iBridge', scenes: ['bridge'] },
    { name: '잿빛 폐촌', icon: 'iSpirit', scenes: ['ghosts'] },
    { name: '마지막 야영', icon: 'iFire', scenes: ['camp'] },
    { name: '폐수도원', icon: 'iChurch', scenes: ['gate', 'hall'] },
    { name: '지하 묘실', icon: 'iSkull', scenes: ['crypt'] },
    { name: '재의 옥좌', icon: 'iCrown', scenes: ['confront', 'betrayal', 'after_boss'] },
  ];
  const stageIndex = id => Math.max(0, STAGES.findIndex(st => st.scenes.includes(id)));

  // 그림 도구 묶음(g)을 만든다. seedText가 같으면 별·나무 위치가 항상 같다.
  function makeArt(canvas, frame, seedText) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let seed = 7;
    for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const g = { W, H, f: frame };
    g.rng = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    g.rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    g.px = (x, y, c) => g.rect(x, y, 1, 1, c);
    g.alpha = a => { ctx.globalAlpha = a; };
    g.circle = (cx, cy, r, c) => {
      for (let j = -r; j <= r; j++) { const w = Math.floor(Math.sqrt(r * r - j * j)); g.rect(cx - w, cy + j, w * 2 + 1, 1, c); }
    };

    // 스프라이트 그리기 (scale: 확대, flip: 좌우 반전, mono: 한 색으로 칠하기)
    g.sprite = (name, x, y, o = {}) => {
      const rows = SPR[name], sc = o.scale || 1, w = rows[0].length;
      ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          const ch = row[i];
          if (ch === '.') continue;
          ctx.fillStyle = o.mono ? (ch === 'k' ? o.monoDark : o.mono) : PAL[ch];
          ctx.fillRect(Math.round(x + (o.flip ? w - 1 - i : i) * sc), Math.round(y + j * sc), sc, sc);
        }
      });
      ctx.globalAlpha = 1;
    };
    // 발끝(gy)을 기준으로 세우기
    g.stand = (name, x, gy, o = {}) => g.sprite(name, x, gy - SPR[name].length * (o.scale || 1), o);

    // 주인공 + 동료들 (동료는 왼쪽 뒤에 선다)
    g.party = (s, x, gy, o = {}) => {
      const ids = Object.keys(s.party).filter(id => has(s, id) && !(o.skip || []).includes(id));
      ids.forEach((id, i) => g.stand(id, x - 11 * (i + 1), gy));
      g.stand(s.cls, x, gy);
    };

    // ---- 배경 재료 ----
    g.sky = (type, hy) => {
      const b = SKIES[type], bh = hy / b.length;
      b.forEach((c, i) => {
        const y0 = Math.floor(i * bh);
        g.rect(0, y0, W, Math.ceil(bh) + 1, c);
        if (i) for (let x = 0; x < W; x += 2) { g.px(x, y0, b[i - 1]); g.px(x + 1, y0 + 1, b[i - 1]); } // 경계 디더링
      });
    };
    g.stars = (n, maxY) => {
      for (let i = 0; i < n; i++) g.px(g.rng() * W, g.rng() * maxY, (i + g.f) % 5 === 0 ? '#6a7aa8' : '#f0f0ff');
    };
    g.hills = (c, base, amp) => {
      const p1 = g.rng() * 6, p2 = g.rng() * 6, f1 = 0.04 + g.rng() * 0.04;
      for (let x = 0; x < W; x++) {
        const y = base - amp * (0.6 + 0.4 * Math.sin(x * f1 + p1)) - amp * 0.3 * Math.sin(x * 0.17 + p2);
        g.rect(x, y, 1, H - y, c);
      }
    };
    g.ground = (y, c1, c2) => {
      g.rect(0, y, W, H - y, c1);
      for (let i = 0; i < 70; i++) g.px(g.rng() * W, y + 1 + g.rng() * (H - y), c2);
    };
    g.bricks = (x, y, w, h, c, c2) => {
      g.rect(x, y, w, h, c);
      for (let j = 0; j < h; j += 4) {
        g.rect(x, y + j, w, 1, c2);
        for (let i = ((j / 4) % 2) * 4; i < w; i += 8) g.rect(x + i, y + j, 1, 4, c2);
      }
    };
    g.fog = (y0, y1) => {
      g.alpha(0.35);
      for (let y = y0; y < y1; y += 3) for (let x = (y + g.f) % 6; x < W; x += 6) g.rect(x, y, 3, 1, '#b0b6c4');
      g.alpha(1);
    };
    g.ash = () => {
      for (let i = 0; i < 24; i++) g.px((g.rng() * W + g.f) % W, (g.rng() * H + g.f * 3) % H, '#a8a4b0');
    };
    g.fire = (x, gy) => {
      g.rect(x - 4, gy - 2, 9, 2, '#4d321c');
      const hts = [3, 5, 7, 5, 3];
      for (let i = 0; i < 5; i++) {
        const h = hts[i] + ((g.f + i) % 2) * 2 - 1;
        g.rect(x - 2 + i, gy - 2 - h, 1, h, '#ff6a1e');
        g.rect(x - 2 + i, gy - 2 - Math.floor(h / 2), 1, Math.floor(h / 2), '#ffd04a');
      }
      g.alpha(0.18); g.circle(x, gy - 5, 12, '#ff9a2e'); g.alpha(1);
    };
    g.pine = (x, gy, h, c, c2) => {
      g.rect(x, gy - 2, 1, 2, '#3a2a1a');
      for (let i = 0; i < h; i++) { const w = 1 + Math.floor(i * 0.45) * 2; g.rect(x - (w - 1) / 2, gy - 2 - h + i, w, 1, i % 4 === 3 ? c2 : c); }
    };
    g.deadTree = (x, gy, h, c = '#1e1a1a') => {
      g.rect(x, gy - h, 2, h, c);
      g.rect(x - 4, gy - h + 3, 4, 1, c); g.rect(x - 4, gy - h + 1, 1, 2, c);
      g.rect(x + 2, gy - h + 6, 4, 1, c); g.rect(x + 5, gy - h + 4, 1, 2, c);
    };
    g.tomb = (x, gy, c = '#6a6a78') => {
      g.rect(x, gy - 6, 5, 6, c); g.rect(x + 1, gy - 7, 3, 1, c);
      g.rect(x + 2, gy - 5, 1, 3, '#3a3a48'); g.rect(x + 1, gy - 4, 3, 1, '#3a3a48');
    };
    g.house = (x, gy, w, h, roof, lit = true, broken = false) => {
      g.rect(x, gy - h, w, h, broken ? '#4a4a52' : '#6b5a48');
      for (let i = 0; w + 2 - 2 * i > 0; i++) {
        const rw = w + 2 - 2 * i;
        g.rect(x - 1 + i, gy - h - 1 - i, broken ? rw / 2 : rw, 1, roof);
      }
      g.rect(x + 3, gy - h + 3, 3, 3, lit ? '#ffd66a' : '#1a1620');
      g.rect(x + w - 6, gy - 5, 3, 5, '#3a2618');
    };
    g.palisade = (x, gy, w) => {
      for (let i = 0; i < w; i += 3) { g.rect(x + i, gy - 7, 2, 7, '#5a3f28'); g.px(x + i, gy - 8, '#3a2818'); }
    };
    g.glass = (x, y, w, h) => {
      const cols = ['#b8383a', '#3a64b8', '#e8c34a', '#3f8a4a', '#7b4bb0'];
      for (let j = 0; j < h; j++) {
        const inset = j < 3 ? 3 - j : 0;
        for (let i = inset; i < w - inset; i++) {
          g.px(x + i, y + j, ((i >> 1) + (j >> 1)) % 3 === 0 ? '#1b1622' : cols[((i >> 1) * 3 + (j >> 1)) % cols.length]);
        }
      }
    };
    g.sconce = (x, y) => {
      g.rect(x - 1, y, 3, 2, '#5d6670');
      const h = 3 + (g.f % 2);
      g.rect(x, y - h, 1, h, '#4fb0d0'); g.px(x, y - h - 1, '#8fe8ff');
      g.alpha(0.15); g.circle(x, y - 2, 9, '#4fb0d0'); g.alpha(1);
    };
    g.throne = () => {
      g.rect(50, 20, 28, 38, '#3a3640'); g.rect(46, 40, 36, 18, '#4a4652');
      g.rect(52, 16, 4, 6, '#4a4652'); g.rect(72, 16, 4, 6, '#4a4652');
    };
    return g;
  }

  // 여러 장면에서 같이 쓰는 배경
  const BG = {
    village(g) {
      g.sky('dusk', 46); g.circle(66, 46, 9, '#ffb060'); g.hills('#3a2440', 48, 6);
      g.ground(48, '#2f3b2a', '#3d4b34');
      g.house(6, 50, 18, 10, '#7a2a2a'); g.house(104, 50, 18, 12, '#5a3a2a'); g.palisade(28, 51, 20);
    },
    inn(g) {
      g.rect(0, 0, g.W, 52, '#4a3322');
      for (let y = 4; y < 52; y += 6) g.rect(0, y, g.W, 1, '#3a2718');
      g.rect(0, 52, g.W, 20, '#2e2015');
      for (let x = 0; x < g.W; x += 10) g.rect(x, 52, 1, 20, '#24180f');
    },
    forest(g) {
      g.sky('night', 44); g.stars(25, 30); g.circle(104, 12, 5, '#f4ecc8');
      for (let i = 0; i < 14; i++) g.pine(4 + i * 9 + g.rng() * 4, 50, 14 + g.rng() * 10, '#14261c', '#0e1c14');
      g.ground(50, '#1e2a1c', '#2a3a26');
    },
    road(g) {
      g.sky('fog', 44); g.hills('#4a4f5c', 46, 6); g.ground(46, '#3a3a32', '#4a4a40');
      for (let y = 46; y < g.H; y++) { const w = (y - 46) * 1.6 + 4; g.rect(64 - w / 2, y, w, 1, '#58523f'); }
      g.deadTree(14, 54, 14); g.deadTree(112, 52, 12);
    },
    gate(g) {
      g.sky('night', 50); g.stars(20, 16); g.circle(14, 10, 5, '#f4ecc8');
      g.ground(60, '#24222a', '#33303a');
      g.bricks(18, 18, 92, 44, '#4a4652', '#36323e');
      g.rect(52, 2, 24, 18, '#4a4652'); g.rect(58, 6, 12, 10, '#120e18'); g.circle(64, 12, 3, '#8a7a50');
      [28, 92].forEach(x => { g.rect(x, 26, 8, 12, '#120e18'); g.rect(x + 1, 25, 6, 1, '#120e18'); });
      g.circle(64, 42, 11, '#2a1a14'); g.rect(53, 42, 22, 20, '#2a1a14'); g.rect(63, 32, 2, 30, '#1a0e0a');
    },
    crypt(g) {
      g.rect(0, 0, g.W, g.H, '#0c0a12');
      g.bricks(0, 0, g.W, g.H - 14, '#16121e', '#0c0a12');
      g.rect(0, g.H - 14, g.W, 14, '#1a1620');
      for (let x = 0; x < g.W; x += 8) g.rect(x, g.H - 14, 1, 14, '#120e18');
      g.sconce(14, 26); g.sconce(g.W - 16, 26);
    },
  };

  // 장면별 그림
  const SCENE_ART = {
    arrival(g, s) { BG.village(g); g.stand('elder', 86, 64); g.party(s, 56, 64); },
    hub(g, s) {
      BG.inn(g);
      g.rect(14, 10, 20, 16, '#3a2718'); g.rect(16, 12, 16, 12, '#161c3c'); g.circle(27, 16, 2, '#f4ecc8');
      g.rect(23, 12, 1, 12, '#3a2718'); g.rect(16, 17, 16, 1, '#3a2718');
      // 벽에 붙인 지도
      g.rect(70, 10, 30, 20, '#d8c08a'); g.rect(70, 10, 30, 1, '#b89a60');
      for (let i = 0; i < 8; i++) g.px(74 + i * 3, 26 - i * 1.5, '#b8383a');
      g.rect(95, 13, 1, 3, '#b8383a'); g.rect(94, 14, 3, 1, '#b8383a');
      // 탁자와 촛불
      g.rect(60, 52, 44, 3, '#6b4a2c'); g.rect(62, 55, 2, 10, '#4d321c'); g.rect(100, 55, 2, 10, '#4d321c');
      g.rect(80, 48, 2, 4, '#e8e8f0'); g.px(80 + (g.f % 2), 46, '#ffd04a'); g.px(80, 47, '#ff9a2e');
      g.party(s, 40, 68);
    },
    tavern(g, s) {
      BG.inn(g);
      g.bricks(96, 20, 26, 34, '#5a5560', '#45404a'); g.rect(102, 34, 14, 20, '#120e0c'); g.fire(109, 54);
      g.rect(10, 16, 40, 2, '#3a2718');
      [12, 18, 24, 30, 36, 42].forEach((x, i) => { g.rect(x, 10, 3, 6, ['#3f8a4a', '#b8383a', '#3a64b8'][i % 3]); g.px(x + 1, 9, '#d8d0b8'); });
      g.rect(0, 46, 46, 20, '#5a3a22'); g.rect(0, 44, 48, 3, '#7a5230');
      g.rect(8, 40, 3, 4, '#e8c34a'); g.rect(20, 41, 3, 3, '#e8c34a');
      if (!has(s, 'garen') && !s.flags.tavernDone) g.stand('garen', 66, 60);
      g.rect(58, 56, 28, 3, '#6b4a2c'); g.rect(60, 59, 2, 8, '#4d321c'); g.rect(82, 59, 2, 8, '#4d321c'); g.rect(70, 52, 3, 4, '#e8c34a');
      g.party(s, 44, 70);
    },
    chapel(g, s) {
      g.bricks(0, 0, g.W, 54, '#3a3640', '#2c2832'); g.rect(0, 54, g.W, 18, '#2a2630');
      g.glass(57, 4, 14, 22);
      g.rect(63, 30, 2, 12, '#e8c34a'); g.rect(59, 33, 10, 2, '#e8c34a');
      [6, 96].forEach(x => {
        g.rect(x, 56, 26, 5, '#d8d8e0'); g.rect(x, 61, 2, 4, '#4d321c'); g.rect(x + 24, 61, 2, 4, '#4d321c');
        g.rect(x + 1, 54, 6, 3, '#f0f0f8'); g.rect(x + 2, 53, 4, 3, '#e8b796'); g.rect(x + 8, 55, 16, 2, '#7a5230');
      });
      if (!has(s, 'lia') && !s.flags.chapelDone) g.stand('lia', 76, 68);
      g.party(s, 50, 70);
    },
    forest(g, s) {
      BG.forest(g); g.fire(80, 64);
      if (!s.flags.forestDone) {
        g.stand('bandit', 64, 66); g.stand('bandit', 90, 66, { flip: true });
        g.stand('sera', 106, 66); g.rect(104, 58, 12, 1, '#9aa3ad'); g.rect(104, 61, 12, 1, '#9aa3ad');
      }
      g.party(s, 38, 68);
    },
    road(g, s) {
      BG.road(g);
      [[84, 58], [98, 55], [110, 60]].forEach(([x, y], i) => {
        g.tomb(x - 6, y);
        g.stand('ghoul', x, y + 3 - ((g.f + i) % 2));
        g.rect(x - 1, y, 12, 3, '#4a4030');
      });
      g.party(s, 44, 68); g.fog(36, 62);
    },
    bridge(g, s) {
      g.sky('night', 50); g.stars(18, 26); g.circle(100, 14, 5, '#f4ecc8'); g.hills('#1a2030', 50, 6);
      g.rect(0, 50, g.W, 22, '#1d3550');
      for (let y = 52; y < g.H; y += 3) for (let x = (y * 3 + g.f * 2) % 9; x < g.W; x += 9) g.rect(x, y, 3, 1, '#3a6a90');
      g.rect(0, 40, g.W, 6, '#6a6670'); g.rect(0, 38, g.W, 2, '#7a7680');
      for (let x = 0; x < g.W; x += 8) g.rect(x, 35, 4, 3, '#7a7680');
      g.rect(14, 46, 10, 26, '#5a5660'); g.rect(104, 46, 10, 26, '#5a5660');
      for (let x = 24; x < 104; x++) { const d = Math.abs(x - 64) / 40; g.rect(x, 46, 1, Math.round(8 * d * d), '#5a5660'); }
      g.stand('ghost', 78, 38, { alpha: 0.6 + 0.2 * (g.f % 2), flip: true });
      g.party(s, 44, 38); g.fog(26, 50);
    },
    ghosts(g, s) {
      g.sky('night', 46); g.stars(20, 30); g.ground(46, '#23232a', '#30303a');
      g.house(8, 50, 22, 14, '#3a3a42', false, true); g.house(56, 54, 32, 20, '#3a3a42', false, true); g.house(104, 48, 18, 12, '#3a3a42', false, true);
      g.rect(64, 40, 16, 14, '#203040');
      g.alpha(0.25); g.circle(72, 47, 10, '#8fe8ff'); g.alpha(1);
      const a = 0.55 + 0.15 * (g.f % 2);
      g.stand('spirit', 64, 56, { alpha: a }); g.stand('spirit', 72, 56, { alpha: a }); g.stand('spiritKid', 80, 56, { alpha: a });
      g.party(s, 42, 68);
    },
    camp(g, s) {
      g.sky('night', 48); g.stars(35, 36); g.circle(22, 12, 6, '#f4ecc8');
      g.hills('#151a2c', 48, 8);
      g.rect(92, 30, 22, 12, '#0a0c16'); g.rect(100, 20, 6, 12, '#0a0c16'); g.rect(102, 16, 2, 4, '#0a0c16'); g.px(103, 25, '#c070ff');
      g.ground(48, '#1e241c', '#2a3326');
      for (let i = 0; i < 12; i++) g.rect(10 + i, 64 - i, 24 - 2 * i, 1, i % 3 ? '#7a6a4a' : '#6a5a3a');
      g.rect(21, 56, 2, 8, '#2a2018');
      g.fire(78, 66); g.party(s, 62, 68);
    },
    gate(g, s) { BG.gate(g); g.stand('skeleton', 84, 66, { flip: true }); g.party(s, 40, 68); g.ash(); },
    hall(g, s) {
      g.bricks(0, 0, g.W, 56, '#34303c', '#26222e'); g.rect(0, 56, g.W, 16, '#2a2632');
      for (let x = 0; x < g.W; x += 12) g.rect(x, 56, 1, 16, '#201c28');
      [[16, 8], [57, 4], [96, 8]].forEach(([x, y]) => g.glass(x, y, 14, 22));
      g.alpha(0.12);
      for (let y = 26; y < 56; y++) { const x0 = 57 - (y - 26) * 0.3, x1 = 71 + (y - 26) * 0.6; g.rect(x0, y, x1 - x0, 1, '#c8d0ff'); }
      g.alpha(1);
      g.rect(4, 0, 6, 56, '#4a4652'); g.rect(118, 0, 6, 56, '#4a4652');
      g.rect(50, 48, 28, 10, '#5a5462'); g.rect(50, 46, 28, 2, '#7a2028');
      [54, 72].forEach(x => { g.rect(x, 42, 2, 4, '#e8e8f0'); g.px(x + (g.f % 2), 40, '#ffd04a'); g.px(x, 41, '#ff9a2e'); });
      g.rect(98, 56, 26, 16, '#0c0a12');
      for (let i = 0; i < 5; i++) g.rect(98 + i * 3, 56 + i * 3, 26 - i * 3, 1, '#3a3640');
      g.party(s, 40, 68);
    },
    crypt(g, s) {
      BG.crypt(g);
      g.circle(64, 58, 26, '#06040a'); g.rect(0, 58, g.W, 14, '#1a1620');
      for (let a = 0; a <= 20; a++) {
        const t = Math.PI * a / 20, x = 64 - Math.cos(t) * 28, y = 58 - Math.sin(t) * 34;
        g.rect(x - 2, y - 2, 5, 5, '#d8d0b8'); g.px(x - 1, y - 1, '#1b1622'); g.px(x + 1, y - 1, '#1b1622');
      }
      for (let x = 46; x < 90; x += 4) { g.rect(x + 1, 63, 1, 2, '#9aa3ad'); g.px(x + 1, 62, '#d8d8e0'); }
      g.rect(46, 65, 44, 1, '#3a3640');
      g.party(s, 34, 70);
    },
    confront(g, s) {
      BG.crypt(g);
      g.alpha(0.2 + 0.08 * (g.f % 2)); g.circle(64, 34, 26, '#c070ff'); g.alpha(1);
      g.throne(); g.stand('vernon', 54, 58, { scale: 2 });
      g.rect(58, 60, 12, 6, '#d8d0c0'); g.rect(58, 60, 12, 1, '#e8c34a'); g.rect(63, 61, 2, 4, '#e8c34a');
      g.party(s, 32, 70);
    },
    betrayal(g, s) {
      BG.crypt(g); g.throne();
      for (let i = 0; i < 12; i++) { const h = Math.min(i, 11 - i); g.rect(58 + i, 57 - h, 1, h + 1, '#7a7680'); }
      g.alpha(0.3); g.circle(64, 28, 9, '#c070ff'); g.alpha(1);
      g.sprite('crown', 59, 24 + (g.f % 2), { scale: 2 });
      g.rect(50, 62, 1, 6, '#d8d0b8'); g.px(50, 61, '#e8e8f0');
      g.stand('sera', 96, 70, { flip: true });
      g.party(s, 36, 70, { skip: ['sera'] });
    },
    after_boss(g, s) {
      g.rect(0, 0, g.W, g.H, '#0a0610');
      const p = g.f % 2;
      g.alpha(0.2 + p * 0.08);
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6 + g.f * 0.05;
        for (let r = 10; r < 70; r++) g.px(64 + Math.cos(a) * r, 30 + Math.sin(a) * r * 0.8, '#c070ff');
      }
      g.alpha(1);
      g.circle(64, 30, 11 + p, '#2a0e3a');
      g.sprite('crown', 54, 23 + p, { scale: 4 });
      g.rect(0, 60, g.W, 12, '#1a1620');
      g.party(s, 32, 70);
    },
  };

  // 엔딩 그림
  const ENDING_ART = {
    hero(g, s) {
      g.sky('dawn', 46); g.alpha(0.3); g.circle(64, 46, 18, '#ffe080'); g.alpha(1); g.circle(64, 46, 10, '#fff0b0');
      g.hills('#4a5a6a', 48, 5); g.ground(48, '#3a5a30', '#4a6a3a');
      g.house(6, 54, 18, 12, '#7a2a2a'); g.house(104, 54, 18, 12, '#5a3a2a');
      [[30, 14], [40, 10], [92, 16]].forEach(([x, y]) => { const up = (g.f + x) % 2; g.px(x - 1, y - up, '#1b1622'); g.px(x, y, '#1b1622'); g.px(x + 1, y - up, '#1b1622'); });
      g.rect(84, 30, 1, 36, '#4d321c'); g.rect(85, 30 + (g.f % 2), 10, 7, '#e0b354'); g.px(89, 33 + (g.f % 2), '#b8383a');
      g.party(s, 70, 66);
    },
    peace(g, s) {
      g.sky('dawn', 50); g.hills('#4a4a6a', 50, 6); g.ground(50, '#3a4a3a', '#4a5a4a');
      g.bricks(80, 28, 36, 22, '#6a6672', '#5a5662'); g.rect(92, 12, 12, 18, '#6a6672'); g.circle(98, 21, 3, '#e0b354');
      g.rect(94, 38, 8, 12, '#3a2a20');
      for (let i = 0; i < 6; i++) g.sprite('spiritKid', 14 + i * 11, 46 - ((g.f * 2 + i * 11) % 44), { alpha: 0.5 });
      g.party(s, 56, 68);
    },
    sacrifice(g, s) {
      g.sky('dawn', 52); g.bricks(0, 52, g.W, 20, '#4a4652', '#3a3642');
      g.alpha(0.3); g.circle(56, 30, 20, '#fff0b0'); g.alpha(1);
      g.sprite('crown', 51, 26, { scale: 2 });
      g.alpha(0.55);
      for (let j = 0; j < 32; j++) { const w = (j < 16 ? j : 32 - j) * 0.9; g.rect(56 - w, 14 + j, w * 2, 1, '#8fe8ff'); }
      g.alpha(1);
      g.rect(82, 62, 24, 4, '#6a6672');
      g.stand('lia', 86, 62, { scale: 2, mono: '#c8c8d4', monoDark: '#6a6a78' });
      g.party(s, 30, 68);
    },
    lonely(g, s) { BG.road(g); g.stand(s.cls, 60, 62); g.fog(30, 66); },
    merchant(g, s) {
      g.rect(0, 0, g.W, g.H, '#2a1e10'); g.rect(0, 52, g.W, 20, '#1e150a');
      for (let j = 0; j < 16; j++) { const w = (16 - j) * 1.8; g.rect(90 - w, 66 - j, w * 2, 1, j % 2 ? '#e8c34a' : '#c89a2a'); }
      for (let i = 0; i < 5; i++) if ((i + g.f) % 3 === 0) g.px(78 + i * 6, 56 + (i % 3) * 3, '#ffffff');
      g.rect(14, 52, 22, 14, '#6b4a2c'); g.rect(14, 48, 22, 5, '#7a5230'); g.rect(24, 48, 2, 18, '#e8c34a');
      g.sprite('crown', 85, 42, { scale: 2 });
      g.stand(s.cls, 50, 68);
    },
    ashking(g, s) {
      g.sky('violet', 72); g.alpha(0.25); g.circle(64, 34, 24, '#c070ff'); g.alpha(1);
      g.rect(50, 14, 28, 46, '#2a2632'); g.rect(44, 40, 40, 20, '#3a3640'); g.rect(0, 60, g.W, 12, '#1a1620');
      g.stand(s.cls, 55, 60, { scale: 2 });
      g.sprite('crown', 59, 29 + (g.f % 2), { scale: 2 });
      g.stand('skeleton', 12, 70); g.stand('ghoul', 28, 70); g.stand('skeleton', 96, 70, { flip: true }); g.stand('ghoul', 110, 70, { flip: true });
    },
    betrayal(g, s) {
      g.sky('blood', 50); g.circle(96, 14, 7, '#c83a3a');
      g.hills('#0e0a0c', 52, 10); g.ground(56, '#1a1418', '#2a2028');
      [6, 26, 46, 80, 100, 118].forEach(x => { g.tomb(x, 64); g.rect(x - 1, 65, 7, 3, '#0a0608'); });
      g.stand('sera', 58, 46, { mono: '#06040a', monoDark: '#06040a' });
      g.alpha(0.4 + 0.15 * (g.f % 2)); g.circle(70, 34, 4, '#c070ff'); g.alpha(1);
    },
    flee(g, s) {
      g.sky('night', 46); g.stars(20, 30);
      g.alpha(0.25 + 0.1 * (g.f % 2)); g.circle(100, 42, 16, '#ff6a1e'); g.alpha(1);
      [[86, 8], [96, 12], [110, 9]].forEach(([x, h]) => { g.rect(x, 46 - h, 10, h, '#0a0a12'); g.px(x + 4, 45 - h - (g.f % 2), '#ff9a2e'); });
      g.ground(46, '#1a1c18', '#262a22');
      for (let y = 46; y < g.H; y++) { const w = (y - 46) * 1.4 + 3; g.rect(96 - (y - 46) * 2.6 - w / 2, y, w, 1, '#2e2a22'); }
      g.stand(s.cls, 26, 68, { flip: true });
    },
    death(g, s) {
      g.sky('night', 50); g.stars(20, 30); g.ground(50, '#1a1a1e', '#26262c');
      g.deadTree(18, 58, 20); g.deadTree(108, 56, 16);
      g.rect(46, 56, 36, 6, '#2e2620');
      g.rect(52, 26, 24, 32, '#5a5a66'); g.rect(56, 22, 16, 4, '#5a5a66'); g.rect(60, 20, 8, 2, '#5a5a66');
      g.rect(63, 28, 2, 14, '#3a3a48'); g.rect(58, 32, 12, 2, '#3a3a48');
      g.alpha(0.6 + 0.3 * (g.f % 2));
      [[60, 56], [61, 53], [59, 50], [61, 47], [60, 44]].forEach(([x, y]) => g.rect(x, y, 1, 3, '#c070ff'));
      g.alpha(1);
    },
  };

  // 전투 그림: 적에 맞는 배경 + 우리 편(왼쪽) + 적(오른쪽, 2배 크기)
  function drawCombat(g, s, c) {
    const bg = { bandit: 'forest', ghoul: 'road', skeleton: 'gate', vernon: 'crypt', sera: 'crypt' }[c.f.enemy];
    BG[bg](g);
    g.party(s, 44, g.H - 4);
    g.stand(c.f.enemy, 80, g.H - 4, { scale: 2, flip: true, alpha: c.hp <= 0 ? 0.25 : 1 });
  }

  function drawMap(g, s) {
    const cur = stageIndex(s.scene);
    g.rect(0, 0, g.W, g.H, '#1a1622');
    for (let x = 8; x < 120; x += 2) g.px(x, 11, x < 8 + cur * 16 ? '#e0b354' : '#4a4058');
    STAGES.forEach((st, i) => g.sprite(st.icon, 5 + i * 16, 8, { alpha: i <= cur ? 1 : 0.3 }));
    const bob = g.f % 2, mx = 8 + cur * 16;
    g.rect(mx - 2, 1 + bob, 5, 1, '#ffe066'); g.rect(mx - 1, 2 + bob, 3, 1, '#ffe066'); g.px(mx, 3 + bob, '#ffe066');
  }

  let artFrame = 0;
  function paintArt() {
    if (!s) return;
    document.querySelectorAll('canvas[data-art]').forEach(cv => {
      const kind = cv.dataset.art;
      cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      if (kind === 'map') return drawMap(makeArt(cv, artFrame, 'map'), s);
      if (kind === 'combat' && ui.combat) return drawCombat(makeArt(cv, artFrame, 'c' + ui.combat.f.enemy), s, ui.combat);
      if (kind === 'ending' && ui.ending) return ENDING_ART[ui.ending.id](makeArt(cv, artFrame, 'e' + ui.ending.id), s);
      if (kind === 'scene') (SCENE_ART[s.scene] || BG.crypt)(makeArt(cv, artFrame, s.scene), s);
    });
  }
  // 불꽃·별·안개가 살짝 움직이도록 주기적으로 다시 그린다
  setInterval(() => { artFrame++; paintArt(); }, 450);

  const artCanvas = (kind, label) => `<canvas class="pixel" data-art="${kind}" width="128" height="72" role="img" aria-label="${label}"></canvas>`;

  // ---------- 버튼 클릭 처리 (이벤트 위임) ----------
  app.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'new': ui.screen = 'create'; render(); break;
      case 'class': ui.pickClass = b.dataset.id; render(); break;
      case 'start': {
        const name = document.getElementById('hero-name').value.trim() || '방랑자';
        s = newState(ui.pickClass, name);
        enterScene('arrival');
        break;
      }
      case 'choice': pickChoice(Number(b.dataset.i)); break;
      case 'continue': continueOutcome(ui.outcome.res); break;
      case 'fight': combatAct(b.dataset.a); break;
      case 'endcombat': endCombat(); break;
      case 'save':
        if (ui.combat) toast('전투 중에는 전투 시작 전 장면으로 저장됩니다');
        else saveGame(false);
        break;
      case 'load':
        if (ui.screen === 'game' && !confirm('마지막 저장 지점으로 되돌아갈까요?')) break;
        loadGame();
        break;
      case 'codex': ui.back = ui.screen; ui.screen = 'codex'; render(); window.scrollTo(0, 0); break;
      case 'back': ui.screen = ui.back === 'codex' ? 'title' : ui.back; render(); break;
      case 'title':
        if (ui.screen === 'game' && !confirm('처음 화면으로 갈까요? (자동 저장된 장면에서 이어할 수 있어요)')) break;
        ui.screen = 'title'; render(); break;
    }
  });

  render();
})();
