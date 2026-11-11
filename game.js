(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const towerState = { hp: 100, max: 100, dead: false };
  const hero = { t: .13, side: 0, destT: null, destSide: 0, moving: false, facing: 1, hp: 100, maxHp: 100, mana: 100, maxMana: 100, respawn: 0 };
  const abilityInfo = { q: { cost: 18, cooldown: 4, damage: 22 }, w: { cost: 20, cooldown: 6 }, e: { cost: 28, cooldown: 7, damage: 32 }, r: { cost: 50, cooldown: 18, damage: 58 } };
  const cooldowns = { q: 0, w: 0, e: 0, r: 0 };
  let W = 0, H = 0, dpr = 1, last = performance.now(), elapsed = 0;
  let attackMode = false, attackTimer = 0, hitFlash = 0, projectile = null, spellShots = [], towerShot = null, towerAttackTimer = 0, soundOn = false, fountainActive = false;
  let joystick = { active: false, dx: 0, dy: 0 }, joyPointer = null, toastTimer = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  function lanePoint(t, side = 0) {
    const bx = W * .16, by = H * .75, rx = W * .84, ry = H * .24;
    const dx = rx - bx, dy = ry - by, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    return { x: bx + dx * t + nx * side, y: by + dy * t + ny * side, nx, ny, dx: dx / len, dy: dy / len };
  }
  function towerPoint() { return lanePoint(.54, 0); }
  function heroPoint() { return lanePoint(hero.t, hero.side); }
  function fountainPoint() { return lanePoint(.035, 0); }
  function nearFountain() { const p = heroPoint(), f = fountainPoint(); return Math.hypot(p.x - f.x, p.y - f.y) < 70; }
  function damageTower(amount) {
    if (towerState.dead) return;
    towerState.hp = Math.max(0, towerState.hp - amount); hitFlash = 1; maybeSound(300 + Math.random() * 100);
    if (towerState.hp === 0) {
      towerState.dead = true; attackMode = false; projectile = null; spellShots = []; towerShot = null; maybeSound(180);
      $('#victory').classList.add('visible'); $('#objectiveTitle').textContent = 'Lane secured'; $('#objectiveStatus').textContent = 'Destroyed • 0% integrity';
      $('#attackLabel').textContent = 'VICTORY'; $('#attackSub').textContent = 'Objective complete'; $('#attackButton').classList.remove('engaged');
      $('#hintText').innerHTML = 'Tower destroyed<br /><b>Objective complete</b>'; showToast('Red Sentinel destroyed');
    }
  }
  function castAbility(key) {
    const id = key.toLowerCase(), info = abilityInfo[id];
    if (!info || hero.respawn > 0) return;
    if (cooldowns[id] > 0) { showToast(`${id.toUpperCase()} is recharging`); return; }
    if (hero.mana < info.cost) { showToast('Not enough mana'); return; }
    hero.mana -= info.cost; cooldowns[id] = info.cooldown;
    const p = heroPoint(), tp = towerPoint();
    if (id === 'q') {
      const lane = lanePoint(1), origin = lanePoint(0), dx = lane.dx, dy = lane.dy;
      spellShots.push({ x: p.x, y: p.y - 14, vx: dx * 470, vy: dy * 470, age: 0, range: 450, traveled: 0, damage: info.damage, color: '#b7f1dc' });
      maybeSound(540);
    } else if (id === 'w') {
      const old = heroPoint(); hero.t = clamp(hero.t + .115, .04, .94); hero.side = clamp(hero.side, -35, 35); hero.destT = null; hero.moving = true;
      const next = heroPoint(); addBurst(old.x, old.y - 3, '#7fd8ef'); addBurst(next.x, next.y - 3, '#7fd8ef'); maybeSound(720);
    } else if (id === 'e') {
      addBurst(p.x, p.y - 6, '#a98bff'); if (!towerState.dead && Math.hypot(p.x - tp.x, p.y - tp.y) < 132) damageTower(info.damage); maybeSound(390);
    } else if (id === 'r') {
      if (!towerState.dead && Math.hypot(p.x - tp.x, p.y - tp.y) < 475) { damageTower(info.damage); addBurst(tp.x, tp.y - 18, '#ffd37f'); }
      else addBurst(p.x, p.y - 8, '#ffd37f');
      maybeSound(230);
    }
    updateAbilityHud();
  }
  let bursts = [];
  function addBurst(x, y, color) { bursts.push({ x, y, color, age: 0, duration: .48 }); }
  function updateAbilityHud() {
    for (const id of ['q', 'w', 'e', 'r']) {
      const btn = document.querySelector(`[data-ability="${id}"]`), info = abilityInfo[id], cd = cooldowns[id];
      btn.disabled = hero.respawn > 0 || cd > 0 || hero.mana < info.cost;
      btn.classList.toggle('cooling', cd > 0); btn.classList.toggle('unaffordable', hero.mana < info.cost && cd <= 0);
      btn.querySelector('.cooldown-mask').style.transform = `scaleY(${cd > 0 ? cd / info.cooldown : 0})`;
      btn.querySelector('.cooldown-text').textContent = cd > 0 ? Math.ceil(cd) : '';
    }
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();
  function path(points) { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
  function ellipse(x, y, rx, ry, fill, stroke, line = 1) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); } }
  function line(x1, y1, x2, y2, color, width = 1) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  function drawGround() {
    const grad = ctx.createLinearGradient(0, 0, W, H); grad.addColorStop(0, '#42543c'); grad.addColorStop(.52, '#354a35'); grad.addColorStop(1, '#283d32'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Soft terrain patches and tiny vegetation flecks give the field depth without external assets.
    for (let i = 0; i < 38; i++) {
      const x = ((i * 193 + 31) % 997) / 997 * W, y = ((i * 317 + 73) % 991) / 991 * H;
      ellipse(x, y, 35 + (i % 5) * 9, 14 + (i % 4) * 5, i % 2 ? 'rgba(147,171,105,.045)' : 'rgba(10,26,19,.07)');
    }
    let seed = 49;
    for (let i = 0; i < Math.min(140, W * H / 6500); i++) {
      seed = (seed * 16807) % 2147483647; const x = seed / 2147483647 * W; seed = (seed * 16807) % 2147483647; const y = seed / 2147483647 * H;
      line(x, y, x + (seed % 5) - 2, y - 3 - seed % 4, 'rgba(200,218,156,.16)', 1);
    }
    // Distant pools and low-contrast lane-side stones
    for (let i = 0; i < 9; i++) { const p = lanePoint(i / 8, i % 2 ? 84 : -84); ellipse(p.x, p.y, 13, 7, 'rgba(184,183,137,.12)', 'rgba(220,213,167,.09)'); }
    const a = lanePoint(-.06), b = lanePoint(1.07);
    line(a.x, a.y, b.x, b.y, 'rgba(12,21,16,.22)', 112);
    line(a.x, a.y, b.x, b.y, 'rgba(204,195,150,.22)', 92);
    line(a.x, a.y, b.x, b.y, 'rgba(160,153,119,.53)', 82);
    line(a.x, a.y, b.x, b.y, 'rgba(202,194,158,.54)', 74);
    line(a.x, a.y, b.x, b.y, 'rgba(145,150,119,.48)', 67);
    // Worn path seams
    const laneA = lanePoint(.02, -28), laneB = lanePoint(.98, -28), laneC = lanePoint(.02, 28), laneD = lanePoint(.98, 28);
    line(laneA.x, laneA.y, laneB.x, laneB.y, 'rgba(235,223,174,.22)', 1.5); line(laneC.x, laneC.y, laneD.x, laneD.y, 'rgba(235,223,174,.22)', 1.5);
    for (let i = .07; i < .94; i += .1) { const p = lanePoint(i, Math.sin(i * 42) * 17); ellipse(p.x, p.y, 2.4, 1.4, 'rgba(89,91,72,.25)'); }
  }
  function drawBase(t, color, name, blue) {
    const p = lanePoint(t), r = blue ? 38 : 34;
    ellipse(p.x, p.y + 13, r * 1.45, r * .8, 'rgba(7,14,12,.3)');
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-.16);
    ellipse(0, 0, r * 1.28, r * .82, blue ? 'rgba(75,150,199,.25)' : 'rgba(201,83,73,.21)', blue ? 'rgba(129,195,230,.65)' : 'rgba(233,139,112,.58)', 2);
    ellipse(0, 0, r * .82, r * .53, blue ? '#3d6170' : '#714743', blue ? '#8bbdd1' : '#cb8870', 2);
    // Keep / crystal
    ctx.fillStyle = blue ? '#567d83' : '#85544b'; path([{x:-r*.49,y:3},{x:-r*.37,y:-r*.43},{x:0,y:-r*.67},{x:r*.37,y:-r*.43},{x:r*.49,y:3},{x:0,y:r*.3}]); ctx.fill();
    line(-r*.36,-r*.42,0,-r*.67,blue?'#a1d9e8':'#ffc1a0',2); line(r*.36,-r*.42,0,-r*.67,blue?'#a1d9e8':'#ffc1a0',2);
    ellipse(0, -r * .16, 5, 6, blue ? '#a4e7ef' : '#ffb08f'); ellipse(0,-r*.16,10,11,blue?'rgba(130,226,240,.15)':'rgba(255,154,123,.17)');
    ctx.restore();
    label(name, p.x, p.y + r + 21, blue ? '#bce6ed' : '#ffbca8');
  }
  function label(text, x, y, color) { ctx.save(); ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(9,17,14,.68)'; ctx.fillText(text, x + 1, y + 1); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore(); }
  function drawFountain() {
    const p = fountainPoint(), pulse = .5 + .5 * Math.sin(elapsed * 4);
    ellipse(p.x, p.y + 5, 37, 20, `rgba(94,198,219,${.09 + pulse * .06})`, 'rgba(144,225,236,.36)', 1.5);
    ellipse(p.x, p.y + 2, 24, 13, 'rgba(76,174,207,.24)', 'rgba(172,236,241,.62)', 1);
    for (let i = 0; i < 3; i++) { const a = elapsed * 1.6 + i * Math.PI * 2 / 3; ellipse(p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 6, 2.2, 2.2, 'rgba(193,248,255,.82)'); }
    label('FOUNTAIN', p.x, p.y + 30, '#b8edf2');
  }
  function drawTower(p) {
    const pulse = .5 + .5 * Math.sin(elapsed * 2.1);
    ellipse(p.x, p.y + 17, 35, 18, 'rgba(8,13,12,.37)');
    // Tower platform
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-.16);
    ellipse(0, 8, 36, 22, '#514f3c', '#d2ad83', 1.5); ellipse(0, 3, 30, 18, '#786647', '#c4aa78', 1.5); ellipse(0, -1, 24, 14, '#907650', '#e3c28a', 1.2);
    // Stone body
    path([{x:-17,y:0},{x:-14,y:-36},{x:-9,y:-45},{x:9,y:-45},{x:14,y:-36},{x:17,y:0},{x:0,y:8}]); ctx.fillStyle='#885f51'; ctx.fill(); ctx.strokeStyle='#c48c70'; ctx.lineWidth=1.4; ctx.stroke();
    path([{x:-14,y:-36},{x:-9,y:-45},{x:0,y:-40},{x:0,y:-5},{x:-16,y:0}]); ctx.fillStyle='#a5755e'; ctx.fill();
    path([{x:0,y:-40},{x:9,y:-45},{x:14,y:-36},{x:17,y:0},{x:0,y:-5}]); ctx.fillStyle='#704c45'; ctx.fill();
    // crown and glowing core
    path([{x:-15,y:-36},{x:-19,y:-47},{x:-11,y:-45},{x:-6,y:-53},{x:0,y:-47},{x:7,y:-54},{x:11,y:-44},{x:18,y:-48},{x:14,y:-34}]); ctx.fillStyle='#a87261'; ctx.fill(); ctx.strokeStyle='#e2aa89'; ctx.stroke();
    ellipse(0,-30,5,8,`rgba(255,131,105,${.6 + pulse * .3})`); ellipse(0,-30,11,13,`rgba(238,107,81,${.08 + pulse * .08})`);
    ctx.restore();
    // selection / range ring
    if (attackMode && !towerState.dead) { ctx.save(); ctx.setLineDash([5,6]); ctx.lineWidth=1; ctx.strokeStyle='rgba(255,171,145,.47)'; ctx.beginPath(); ctx.ellipse(p.x,p.y+5,91,47,-.37,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    const barW = 76, bx = p.x - barW / 2, by = p.y - 78;
    roundedRect(bx, by, barW, 8, 4, 'rgba(14,15,14,.78)');
    roundedRect(bx + 1, by + 1, Math.max(0, (barW - 2) * towerState.hp / towerState.max), 6, 3, towerState.hp > 35 ? '#dd7163' : '#f1a05c');
    label(towerState.dead ? 'SENTINEL • FALLEN' : 'RED SENTINEL', p.x, by - 8, '#ffd0bd');
  }
  function roundedRect(x,y,w,h,r,fill) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill(); }
  function drawHero(p) {
    const bob = Math.sin(elapsed * 8) * (hero.moving ? 2 : .8);
    ellipse(p.x, p.y + 10, 17, 8, 'rgba(7,13,12,.35)');
    // selection halo
    ellipse(p.x, p.y + 6, 23, 12, 'rgba(124,198,219,.13)', 'rgba(170,225,230,.54)', 1.2);
    // cape and body
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(Math.atan2(lanePoint(1).y-lanePoint(0).y,lanePoint(1).x-lanePoint(0).x));
    path([{x:-8,y:-3},{x:-12,y:9},{x:-4,y:7},{x:0,y:12},{x:6,y:6},{x:9,y:-4},{x:0,y:-9}]); ctx.fillStyle='#3d7680'; ctx.fill(); ctx.strokeStyle='#a6d4d0'; ctx.lineWidth=1; ctx.stroke();
    ellipse(0,-3,7,9,'#b8c5b6','#eff0d9',1); ellipse(0,-9,5,5,'#e1ddc2','#f8edc9',1);
    // shoulder / blade
    line(5,-3,12,-11,'#e1d3a6',2.2); line(12,-11,15,-14,'#f2e7c9',1.2);
    ctx.restore();
    // Floating HP and mana markers
    roundedRect(p.x-19,p.y-29,38,5,2,'rgba(8,13,12,.82)'); roundedRect(p.x-18,p.y-28,36*hero.hp/hero.maxHp,3,1,'#93d79b');
    roundedRect(p.x-15,p.y-22,30,3,1,'rgba(8,13,12,.82)'); roundedRect(p.x-14,p.y-21,28*hero.mana/hero.maxMana,1,1,'#75c9e8');
  }
  function drawProjectile() {
    if (projectile) {
      const t = clamp(projectile.age / projectile.duration, 0, 1), sx = mix(projectile.sx, projectile.tx, t), sy = mix(projectile.sy, projectile.ty, t) - Math.sin(t*Math.PI)*28;
      line(sx,sy,sx-10,sy+9,'rgba(202,232,175,.42)',2); ellipse(sx,sy,4,4,'#e8e9b5'); ellipse(sx,sy,8,8,'rgba(220,227,156,.25)');
    }
    if (towerShot) { const t = clamp(towerShot.age / towerShot.duration, 0, 1), x = mix(towerShot.sx, towerShot.tx, t), y = mix(towerShot.sy, towerShot.ty, t); line(towerShot.sx,towerShot.sy,x,y,'rgba(255,111,92,.5)',3); ellipse(x,y,5,5,'#ff8870'); ellipse(x,y,10,10,'rgba(242,102,83,.26)'); }
    for (const shot of spellShots) { line(shot.x-shot.vx*.025,shot.y-shot.vy*.025,shot.x,shot.y,'rgba(183,241,220,.55)',3); ellipse(shot.x,shot.y,5,5,shot.color); ellipse(shot.x,shot.y,10,10,'rgba(183,241,220,.19)'); }
    for (const b of bursts) { const t = b.age / b.duration; ctx.save(); ctx.globalAlpha = 1 - t; ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(b.x,b.y,10+t*52,5+t*29,-.38,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
  }
  function drawEffects() {
    if (hitFlash > 0) { const p=towerPoint(); ellipse(p.x,p.y-28,18+hitFlash*12,18+hitFlash*12,`rgba(255,188,128,${hitFlash*.2})`); }
    if (hero.destT !== null && !attackMode) { const p=lanePoint(hero.destT,hero.destSide); ctx.save(); ctx.strokeStyle='rgba(222,239,188,.7)'; ctx.lineWidth=1.4; ctx.beginPath();ctx.ellipse(p.x,p.y,11,6,-.38,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(p.x,p.y,5,2,-.38,0,Math.PI*2);ctx.stroke();ctx.restore(); }
  }
  function render() {
    ctx.clearRect(0,0,W,H); drawGround();
    // subtle screen edge vignette
    const v=ctx.createRadialGradient(W*.5,H*.48,Math.min(W,H)*.18,W*.5,H*.48,Math.max(W,H)*.78);v.addColorStop(0,'rgba(4,10,8,0)');v.addColorStop(1,'rgba(5,12,10,.38)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
    drawBase(.035,'#8bd3e3','BLUE KEEP',true); drawFountain(); drawBase(.965,'#f39b7e','RED KEEP',false);
    if (!towerState.dead) drawTower(towerPoint()); else { const p=towerPoint(); ellipse(p.x,p.y+5,27,15,'rgba(94,71,55,.7)'); label('RUINS',p.x,p.y-14,'#d7b6a1'); }
    drawEffects(); drawProjectile(); drawHero(heroPoint());
    updateMini();
  }
  function updateMini() {
    const x = 14 + hero.t * 116, y = 45 - hero.t * 37;
    $('#miniHero').style.left = `${x}px`; $('#miniHero').style.top = `${y}px`;
    if (towerState.dead) $('#miniTower').style.opacity = '.25';
  }
  function maybeSound(freq=440) { if (!soundOn) return; try { const ac = maybeSound.ac || (maybeSound.ac = new AudioContext()); const o=ac.createOscillator(), g=ac.createGain(); o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.12);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.12); } catch(_) {} }
  function showToast(text) { const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1900); }
  function engage() {
    if (towerState.dead) { showToast('The lane is already secured.'); return; }
    attackMode=true; hero.destT=null; $('#attackButton').classList.add('engaged'); $('#attackLabel').textContent='ENGAGING'; $('#attackSub').textContent='Auto-attacking target'; $('#hintText').innerHTML='Target locked • advancing<br /><b>Wayfarer attacks on arrival</b>';
    showToast('Target locked — moving into attack range');
  }
  function cancelAttack() { attackMode=false; $('#attackButton').classList.remove('engaged'); $('#attackLabel').textContent='ATTACK'; $('#attackSub').textContent='Select a target'; $('#hintText').innerHTML='Right-click anywhere to move<br /><b>Click the tower to engage</b>'; }
  function issueMove(x,y) {
    const bx=W*.16,by=H*.75,dx=W*.68,dy=-H*.51,den=dx*dx+dy*dy,t=clamp(((x-bx)*dx+(y-by)*dy)/den,.06,.91);
    const cp=lanePoint(t), side=clamp((x-cp.x)*cp.nx+(y-cp.y)*cp.ny,-34,34);
    cancelAttack();hero.destT=t;hero.destSide=side;showToast('Moving to position');
  }
  function onPointer(e) {
    const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,p=towerPoint();
    if (e.button===2) { issueMove(x,y); return; }
    if (e.button!==0) return;
    if (!towerState.dead && Math.hypot(x-p.x,y-p.y)<52) { engage(); return; }
    if (e.pointerType==='touch') issueMove(x,y);
    else issueMove(x,y);
  }
  canvas.addEventListener('contextmenu',e=>e.preventDefault()); canvas.addEventListener('pointerdown',onPointer);
  $('#attackButton').addEventListener('click',engage);
  document.querySelectorAll('.ability').forEach(button => button.addEventListener('click', () => castAbility(button.dataset.ability)));
  addEventListener('keydown',e=>{ const key=e.key.toLowerCase(); if(key==='a') engage(); if(key==='escape')cancelAttack(); if(['q','w','e','r'].includes(key) && !e.repeat && !(e.target instanceof HTMLElement && e.target.closest('button'))) castAbility(key); });
  $('#soundToggle').addEventListener('click',()=>{soundOn=!soundOn;$('#soundToggle').classList.toggle('muted',!soundOn);$('#soundToggle').textContent=soundOn?'♫':'♩';$('#soundToast').textContent=soundOn?'Sound effects are on':'Sound effects are off';$('#soundToast').classList.add('show');setTimeout(()=>$('#soundToast').classList.remove('show'),1300);maybeSound(660);});
  $('#restartButton').addEventListener('click',()=>{towerState.hp=100;towerState.dead=false;hero.t=.13;hero.side=0;hero.destT=null;hero.hp=hero.maxHp;hero.mana=hero.maxMana;hero.respawn=0;Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);spellShots=[];bursts=[];towerShot=null;fountainActive=false;cancelAttack();attackTimer=0;towerAttackTimer=0;$('#victory').classList.remove('visible');$('#objectiveTitle').textContent='Red sentinel';$('#objectiveStatus').textContent='Standing • 100% integrity';$('#attackButton').disabled=false;$('#miniTower').style.opacity='1';updateAbilityHud();});
  const joy=$('#joystick'),knob=$('#joyKnob');
  function joyMove(e) { const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=29,len=Math.hypot(dx,dy),f=len>max?max/len:1;joystick.dx=dx*f/max;joystick.dy=dy*f/max;knob.style.transform=`translate(${dx*f}px,${dy*f}px)`; }
  joy.addEventListener('pointerdown',e=>{e.preventDefault();joy.setPointerCapture(e.pointerId);joyPointer=e.pointerId;joystick.active=true;cancelAttack();joyMove(e);});
  joy.addEventListener('pointermove',e=>{if(joystick.active&&e.pointerId===joyPointer)joyMove(e);});
  function joyEnd(e){if(e.pointerId!==joyPointer)return;joystick.active=false;joyPointer=null;joystick.dx=joystick.dy=0;knob.style.transform='';}
  joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
  function update(dt) {
    elapsed += dt; hitFlash = Math.max(0, hitFlash - dt * 2.7);
    for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id] - dt);
    bursts = bursts.filter(b => (b.age += dt) < b.duration);
    if (hero.respawn > 0) {
      hero.respawn = Math.max(0, hero.respawn - dt); hero.t = .035; hero.side = 0; hero.destT = null; hero.moving = false;
      if (hero.respawn === 0) { hero.hp = 65; hero.mana = Math.max(hero.mana, 55); showToast('Wayfarer has returned'); }
    } else {
      if (joystick.active) { hero.t = clamp(hero.t + joystick.dx * dt * .36, .04, .94); hero.side = clamp(hero.side - joystick.dy * dt * 100, -35, 35); hero.moving = Math.hypot(joystick.dx, joystick.dy) > .12; }
      else if (hero.destT !== null) { const p = heroPoint(), q = lanePoint(hero.destT, hero.destSide), dist = Math.hypot(q.x - p.x, q.y - p.y); if (dist < 3) { hero.t = hero.destT; hero.side = hero.destSide; hero.destT = null; hero.moving = false; } else { const step = 145 * dt / dist; hero.t += (hero.destT - hero.t) * Math.min(step, 1); hero.side += (hero.destSide - hero.side) * Math.min(step, 1); hero.moving = true; } }
      else hero.moving = false;
      if (attackMode && !towerState.dead) { const tp = towerPoint(), hp = heroPoint(), dist = Math.hypot(tp.x - hp.x, tp.y - hp.y); if (dist > 90) { const laneLength = Math.hypot(W * .68, H * .51), targetT = .54 - (60 / laneLength), approachDist = Math.hypot((targetT - hero.t) * laneLength, hero.side), step = Math.min(1, 145 * dt / Math.max(approachDist, 1)); hero.t += (targetT - hero.t) * step; hero.side *= 1 - step; hero.moving = true; } else { hero.moving = false; attackTimer -= dt; if (attackTimer <= 0) { attackTimer = .72; const a = heroPoint(), b = towerPoint(); projectile = { sx: a.x, sy: a.y - 10, tx: b.x, ty: b.y - 27, age: 0, duration: .19 }; damageTower(10); } } }
      if (!towerState.dead) {
        const tp = towerPoint(), hp = heroPoint(), distance = Math.hypot(tp.x - hp.x, tp.y - hp.y);
        if (distance < 285) { towerAttackTimer -= dt; if (towerAttackTimer <= 0 && !towerShot) { towerAttackTimer = 1.1; towerShot = { sx: tp.x, sy: tp.y - 30, tx: hp.x, ty: hp.y - 6, age: 0, duration: .32, damage: 13 }; maybeSound(170); } }
        else towerAttackTimer = Math.min(towerAttackTimer, .25);
      }
      fountainActive = nearFountain();
      hero.hp = Math.min(hero.maxHp, hero.hp + dt * (fountainActive ? 48 : .7));
      hero.mana = Math.min(hero.maxMana, hero.mana + dt * (fountainActive ? 40 : 2.4));
    }
    if (projectile) { projectile.age += dt; if (projectile.age >= projectile.duration) projectile = null; }
    if (towerShot) { towerShot.age += dt; if (towerShot.age >= towerShot.duration) { hero.hp = Math.max(0, hero.hp - towerShot.damage); addBurst(towerShot.tx, towerShot.ty, '#ff8170'); towerShot = null; if (hero.hp <= 0) { hero.respawn = 2.2; hero.mana = Math.max(0, hero.mana - 12); cancelAttack(); showToast('Wayfarer down — respawning at the Blue Fountain'); } } }
    const tp = towerPoint();
    for (const shot of spellShots) {
      const stepX = shot.vx * dt, stepY = shot.vy * dt; shot.x += stepX; shot.y += stepY; shot.age += dt; shot.traveled += Math.hypot(stepX, stepY);
      if (!towerState.dead && shot.traveled <= shot.range && Math.hypot(shot.x - tp.x, shot.y - (tp.y - 25)) < 24) { damageTower(shot.damage); addBurst(tp.x, tp.y - 22, shot.color); shot.hit = true; }
      if (shot.traveled >= shot.range || shot.hit) shot.remove = true;
    }
    spellShots = spellShots.filter(shot => !shot.remove);
    $('#heroHealthBar').style.width = `${100 * hero.hp / hero.maxHp}%`; $('#heroHealthValue').textContent = Math.ceil(hero.hp);
    $('#heroManaBar').style.width = `${100 * hero.mana / hero.maxMana}%`; $('#heroManaValue').textContent = Math.ceil(hero.mana);
    $('#objectiveStatus').textContent = towerState.dead ? 'Destroyed • 0% integrity' : `Standing • ${Math.ceil(towerState.hp)}% integrity`;
    $('#miniHero').style.filter = hero.moving ? 'brightness(1.5)' : 'none';
    if (fountainActive) $('#hintText').innerHTML = 'Fountain active<br /><b>Rapidly restoring HP + Mana</b>';
    else if (hero.respawn > 0) $('#hintText').innerHTML = `Respawning • ${Math.ceil(hero.respawn)}s<br /><b>Returning to Blue Base</b>`;
    else if (!towerState.dead) $('#hintText').innerHTML = attackMode ? 'Target locked • advancing<br /><b>Wayfarer attacks on arrival</b>' : 'Right-click anywhere to move<br /><b>Click the tower to engage</b>';
    updateAbilityHud();
  }
  function frame(now){const dt=Math.min(.04,(now-last)/1000);last=now;update(dt);render();requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
