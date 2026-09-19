const initialPlayers = [
  ['Mia','GK',true],['Jack','DEF',true],['Liam','DEF',true],['Ava','DEF',true],['Noah','MID',true],['Harry','MID',true],['Ella','MID',true],['Ben','FWD',true],['Ruby','FWD',true],
  ['Sam','DEF',false],['Olivia','MID',false],['Leo','FWD',false]
].map(([name,position,onPitch], index) => ({id:index+1,name,position,onPitch,seconds:0,available:true}));

let state = {
  players: structuredClone(initialPlayers), elapsed: 0, running: false, half: 1, lastTick: null,
  settings: { teamName:'Your Team', opponentName:'Opposition', length:60, halves:2, pitch:9, rotation:10, formation:'3-3-2', coverage:true, sound:true, vibration:true }, history: [], goals: [], matchHistory: [], completed:false
};
let audioContext, lastSoundWindow = 0;
const $ = id => document.getElementById(id);
const time = seconds => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const minutes = seconds => `${Math.floor(seconds/60)}m`;
const matchSeconds = () => state.settings.length * 60;
const target = () => Math.round((state.settings.pitch * matchSeconds()) / state.players.filter(p=>p.available).length);
const pitchPlayers = () => state.players.filter(p=>p.onPitch && p.available);
const benchPlayers = () => state.players.filter(p=>!p.onPitch && p.available);
const player = id => state.players.find(p=>p.id === Number(id));

function save(){ localStorage.setItem('smartSubMvp', JSON.stringify(state)); }
function load(){ try { const saved=JSON.parse(localStorage.getItem('smartSubMvp')); if(saved?.players) state=saved; } catch {} state.goals ||= []; state.history ||= []; state.matchHistory ||= []; state.completed ||= false; state.settings.teamName ||= 'Your Team'; state.settings.opponentName ||= 'Opposition'; state.settings.sound ??= true; state.settings.vibration ??= true; }
function currentWindow(){ const interval=state.settings.rotation*60; return Math.ceil(Math.max(1,state.elapsed)/interval)*interval; }
function formatPlayer(p, bench=false){ return `<button class="player ${bench?'bench':''}" data-player="${p.id}"><span class="name">${p.name}</span><span class="meta"><span class="tag">${p.position}</span><span>${minutes(p.seconds)}</span></span></button>`; }

function positionWarning(off,on){
  if(!state.settings.coverage) return '';
  const after=pitchPlayers().filter(p=>p.id!==off.id).concat(on);
  if(!after.some(p=>p.position==='GK')) return 'Warning: this would leave no goalkeeper on the pitch.';
  const defenders=after.filter(p=>p.position==='DEF').length;
  if(defenders<2) return 'Warning: this would leave fewer than two defenders on the pitch.';
  return 'Position coverage looks good.';
}
function suggestion(){
  if(!state.running) return null;
  const targetSeconds=target();
  const eligibleOff=pitchPlayers().filter(p=>!state.settings.coverage || p.position!=='GK' || pitchPlayers().filter(x=>x.position==='GK').length>1);
  const off=[...eligibleOff].sort((a,b)=>(b.seconds-targetSeconds)-(a.seconds-targetSeconds))[0];
  const on=[...benchPlayers()].sort((a,b)=>(a.seconds-targetSeconds)-(b.seconds-targetSeconds))[0];
  if(!off || !on) return null;
  return {off,on,warning:positionWarning(off,on)};
}
function updateSuggestion(){
  const s=suggestion(), isDue=state.running && state.elapsed>=currentWindow()-2;
  $('acceptSuggestion').disabled=!s;
  if(!s){ $('suggestionStatus').textContent=state.running?'NO SUBSTITUTE AVAILABLE':'NEXT ROTATION'; $('suggestionTitle').textContent=state.running?'Everyone available is on the pitch':'Start the match to get a suggestion'; $('suggestionReason').textContent='Set up the squad and press Start match when you are ready.'; return; }
  $('suggestionStatus').textContent=isDue?'ROTATION DUE':'NEXT ROTATION';
  $('suggestionTitle').textContent=`${s.off.name} off → ${s.on.name} on`;
  const delta=Math.max(0,Math.round((s.off.seconds-s.on.seconds)/60));
  $('suggestionReason').textContent=`${s.on.name} has played ${delta} fewer minute${delta===1?'':'s'}. ${s.warning || 'This helps balance playing time.'}`;
}
function render(){
  const on=pitchPlayers(), bench=benchPlayers(), targetSeconds=target();
  const ours=state.goals.filter(g=>g.team==='ours').length, theirs=state.goals.filter(g=>g.team==='opponent').length;
  $('ourScore').textContent=ours; $('opponentScore').textContent=theirs; $('scoreLine').textContent=`${ours} — ${theirs}`;
  $('ourTeamLabel').textContent=state.settings.teamName.toUpperCase(); $('opponentTeamLabel').textContent=state.settings.opponentName.toUpperCase();
  const latest=state.goals.at(-1); $('goalLog').hidden=!latest; if(latest){const who=latest.team==='ours' ? player(latest.scorer)?.name : latest.scorer; $('latestGoal').textContent=`${time(latest.elapsed)} · ${who || (latest.team==='ours'?state.settings.teamName:state.settings.opponentName)}`;}
  $('timer').textContent=time(state.elapsed); $('halfLabel').textContent=state.settings.halves===1?'Match':'Half '+state.half;
  $('nextWindow').textContent=time(currentWindow()); $('startPause').textContent=state.running?'Pause match':state.elapsed?'Resume match':'Start match';
  $('halfButton').textContent=state.settings.halves===1?'Reset timer':state.half===1?'Half-time':'End match';
  $('pitchCount').textContent=on.length; $('benchCount').textContent=bench.length;
  $('pitchList').innerHTML=on.map(p=>formatPlayer(p)).join(''); $('benchList').innerHTML=bench.map(p=>formatPlayer(p,true)).join('');
  $('formationTitle').textContent=`${state.settings.formation} formation`;
  const formationOrder=['FWD','MID','DEF','GK'];
  $('formationView').innerHTML=formationOrder.map(position=>{const group=on.filter(p=>p.position===position);return group.length?`<div class="formation-line">${group.map(p=>`<button class="formation-player" data-player="${p.id}">${safe(p.name)}<span>${p.position}</span></button>`).join('')}</div>`:'';}).join('');
  $('targetText').textContent=`Fair target: ${minutes(targetSeconds)} per available player`;
  $('minutesList').innerHTML=[...state.players].sort((a,b)=>a.seconds-b.seconds).map(p=>{
    const ratio=Math.min(100,Math.round(p.seconds/Math.max(1,targetSeconds)*100));
    const status=p.seconds<targetSeconds*.7?'low':p.seconds>targetSeconds*1.2?'high':'';
    return `<div class="minute-row ${status}"><strong>${p.name}</strong><span class="bar"><i style="width:${ratio}%"></i></span><small>${minutes(p.seconds)}</small></div>`;
  }).join('');
  $('matchHistory').innerHTML=state.matchHistory.length ? [...state.matchHistory].reverse().map(game=>`<div class="minute-row"><strong>${safe(game.teamName)}<br><small>v ${safe(game.opponentName)}</small></strong><span><b>${game.ours} — ${game.theirs}</b><br><small>${safe(game.date)} · ${time(game.elapsed)}</small></span><small>${game.ours>game.theirs?'Won':game.ours<game.theirs?'Lost':'Draw'}</small></div>`).join('') : '<p>No completed matches yet.</p>';
  const warning=state.running && state.elapsed>currentWindow();
  $('alertStrip').hidden=!warning; $('alertStrip').textContent=warning?'Rotation window has passed — make a change when play allows.':'';
  updateSuggestion(); save();
}
function playRotationSound(){ if(state.settings.vibration&&navigator.vibrate)navigator.vibrate([130,80,130]); if(!state.settings.sound)return; const Audio=window.AudioContext||window.webkitAudioContext; if(!Audio) return; audioContext ||= new Audio(); audioContext.resume(); [0,.22].forEach(delay=>setTimeout(()=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.frequency.value=880;gain.gain.setValueAtTime(.12,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.16);oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+.17);},delay*1000)); }
function tick(){ if(!state.running) return; const now=Date.now(); const passed=Math.floor((now-state.lastTick)/1000); if(passed<1) return; state.lastTick+=passed*1000; state.elapsed=Math.min(matchSeconds(),state.elapsed+passed); pitchPlayers().forEach(p=>p.seconds+=passed); const windowNow=Math.floor(state.elapsed/(state.settings.rotation*60)); if(windowNow>lastSoundWindow && state.elapsed<matchSeconds()){lastSoundWindow=windowNow;playRotationSound();} if(state.elapsed>=matchSeconds()){ state.running=false; showSummary(); } render(); }
function startPause(){ state.running=!state.running; state.lastTick=Date.now(); if(state.running){lastSoundWindow=Math.floor(state.elapsed/(state.settings.rotation*60)); const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioContext ||= new Audio();audioContext.resume();}} render(); }
function makeSub(offId,onId){ const off=player(offId), on=player(onId); if(!off?.onPitch || on?.onPitch) return; const warning=positionWarning(off,on); if(warning.startsWith('Warning') && !confirm(`${warning}\n\nMake this substitution anyway?`)) return; state.history.push({off:off.id,on:on.id,elapsed:state.elapsed}); off.onPitch=false; on.onPitch=true; render(); }
function openSub(prefill={}){ const off=$('offSelect'),on=$('onSelect'); off.innerHTML=pitchPlayers().map(p=>`<option value="${p.id}">${p.name} · ${p.position}</option>`).join(''); on.innerHTML=benchPlayers().map(p=>`<option value="${p.id}">${p.name} · ${p.position}</option>`).join(''); if(prefill.off)off.value=prefill.off.id;if(prefill.on)on.value=prefill.on.id; coverageNote(); $('subDialog').showModal(); }
function coverageNote(){ const off=player($('offSelect').value),on=player($('onSelect').value); $('coverageNote').textContent=off&&on?positionWarning(off,on):''; }
function safe(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function archiveMatch(){if(state.completed)return;const ours=state.goals.filter(g=>g.team==='ours').length,theirs=state.goals.filter(g=>g.team==='opponent').length;state.matchHistory.push({teamName:state.settings.teamName,opponentName:state.settings.opponentName,ours,theirs,elapsed:state.elapsed,date:new Date().toLocaleDateString(),goals:structuredClone(state.goals),players:state.players.map(p=>({name:p.name,seconds:p.seconds}))});state.completed=true;save();}
function showSummary(){ archiveMatch(); const ours=state.goals.filter(g=>g.team==='ours').length,theirs=state.goals.filter(g=>g.team==='opponent').length; $('summaryIntro').textContent=`${state.settings.teamName} ${ours} — ${theirs} ${state.settings.opponentName}. Final match time: ${time(state.elapsed)}.`; $('summaryList').innerHTML=[...state.players].sort((a,b)=>b.seconds-a.seconds).map(p=>`<div class="minute-row"><strong>${p.name}</strong><span class="bar"><i style="width:${Math.min(100,Math.round(p.seconds/target()*100))}%"></i></span><small>${minutes(p.seconds)}</small></div>`).join(''); $('summaryDialog').showModal(); }
function openGoal(){ $('goalTime').textContent=time(state.elapsed); $('scorerSelect').innerHTML=state.players.map(p=>`<option value="${p.id}">${p.name}</option>`).join(''); $('goalTeam').value='ours'; goalTeamChanged(); $('goalDialog').showModal(); }
function goalTeamChanged(){ const ours=$('goalTeam').value==='ours'; $('scorerLabel').hidden=!ours; $('oppositionScorerLabel').hidden=ours; }
function recordGoal(){ const team=$('goalTeam').value; state.goals.push({team,scorer:team==='ours'?Number($('scorerSelect').value):$('oppositionScorer').value.trim(),elapsed:state.elapsed}); $('oppositionScorer').value=''; $('goalDialog').close(); render(); }
function rosterFields(){ $('rosterFields').innerHTML=state.players.map(p=>`<div class="roster-row" data-roster="${p.id}"><input aria-label="Player name" value="${p.name.replace(/"/g,'&quot;')}" /><select aria-label="Position"><option ${p.position==='GK'?'selected':''}>GK</option><option ${p.position==='DEF'?'selected':''}>DEF</option><option ${p.position==='MID'?'selected':''}>MID</option><option ${p.position==='FWD'?'selected':''}>FWD</option></select><label>Start<input type="checkbox" ${p.onPitch?'checked':''} /></label></div>`).join(''); }
function saveRosterEdits(){ document.querySelectorAll('[data-roster]').forEach(row=>{const p=player(row.dataset.roster), fields=row.querySelectorAll('input,select'); if(!p)return; p.name=fields[0].value.trim()||p.name;p.position=fields[1].value;p.onPitch=fields[2].checked;}); }
function saveSettingsDraft(){ saveRosterEdits(); state.settings.teamName=$('teamName').value.trim()||state.settings.teamName; state.settings.opponentName=$('opponentName').value.trim()||state.settings.opponentName; state.settings.formation=$('formation').value; state.settings.coverage=$('coverageRequired').checked; state.settings.sound=$('soundEnabled').checked; state.settings.vibration=$('vibrationEnabled').checked; save(); }
function saveSettings(){ state.settings={teamName:$('teamName').value.trim()||'Your Team',opponentName:$('opponentName').value.trim()||'Opposition',length:Number($('matchLength').value),halves:Number($('halves').value),pitch:Number($('playersOnPitch').value),rotation:Number($('rotationInterval').value),formation:$('formation').value,coverage:$('coverageRequired').checked,sound:$('soundEnabled').checked,vibration:$('vibrationEnabled').checked}; saveRosterEdits(); const on=pitchPlayers(); if(on.length!==state.settings.pitch){alert(`Choose exactly ${state.settings.pitch} starters. You currently have ${on.length}.`);return;} $('settingsDialog').close(); render(); }
function fillSettings(){ const s=state.settings; $('teamName').value=s.teamName;$('opponentName').value=s.opponentName;$('matchLength').value=s.length;$('halves').value=s.halves;$('playersOnPitch').value=s.pitch;$('rotationInterval').value=s.rotation;$('formation').value=s.formation;$('coverageRequired').checked=s.coverage;$('soundEnabled').checked=s.sound;$('vibrationEnabled').checked=s.vibration;rosterFields(); }

load(); render(); setInterval(tick,300);
document.querySelectorAll('.tabs button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tabs button,.tab-panel').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$(`${btn.dataset.tab}Panel`).classList.add('active');}));
$('startPause').onclick=startPause; $('acceptSuggestion').onclick=()=>{const s=suggestion();if(s)openSub(s)}; $('manualButton').onclick=()=>openSub();
['pitchList','benchList'].forEach(id=>$(id).onclick=e=>{const card=e.target.closest('[data-player]');if(!card)return; const p=player(card.dataset.player); openSub(p.onPitch?{off:p}:{on:p});});
$('formationView').onclick=e=>{const card=e.target.closest('[data-player]');if(card)openSub({off:player(card.dataset.player)});}; $('formationSubButton').onclick=()=>openSub();
$('offSelect').onchange=coverageNote; $('onSelect').onchange=coverageNote; $('confirmSub').onclick=e=>{e.preventDefault();makeSub($('offSelect').value,$('onSelect').value);$('subDialog').close();};
$('settingsButton').onclick=()=>{fillSettings();$('settingsDialog').showModal();}; $('saveSettings').onclick=e=>{e.preventDefault();saveSettings();};
$('settingsDialog').addEventListener('input', saveSettingsDraft); $('settingsDialog').addEventListener('change', saveSettingsDraft);
$('addPlayer').onclick=()=>{saveRosterEdits();const id=Math.max(0,...state.players.map(p=>p.id))+1;state.players.push({id,name:`Player ${id}`,position:'MID',onPitch:false,seconds:0,available:true});rosterFields();};
$('goalButton').onclick=openGoal; $('goalTeam').onchange=goalTeamChanged; $('confirmGoal').onclick=e=>{e.preventDefault();recordGoal();};
$('undoGoalButton').onclick=()=>{if(state.goals.length&&confirm('Remove the latest goal?')){state.goals.pop();render();}};
function startNewMatch(){if(!confirm('Start a new match? Your team and match history will be kept.'))return;state.players.forEach(p=>p.seconds=0);state.elapsed=0;state.running=false;state.half=1;state.lastTick=null;state.history=[];state.goals=[];state.completed=false;render();}
$('newMatchButton').onclick=startNewMatch;
$('resetDemo').onclick=e=>{e.preventDefault();if(confirm('Start a new match with the demo squad? Your past-game history will stay saved.')){const oldMatches=state.matchHistory;state={players:structuredClone(initialPlayers),elapsed:0,running:false,half:1,lastTick:null,settings:{teamName:'Your Team',opponentName:'Opposition',length:60,halves:2,pitch:9,rotation:10,formation:'3-3-2',coverage:true,sound:true,vibration:true},history:[],goals:[],matchHistory:oldMatches,completed:false};$('settingsDialog').close();render();}};
$('halfButton').onclick=()=>{if(state.settings.halves===1){state.running=false;state.elapsed=0;state.players.forEach(p=>p.seconds=0);render();return;} if(state.half===1){state.running=false;state.half=2;render();}else{state.running=false;showSummary();render();}};
$('undoButton').onclick=()=>{const last=state.history.pop();if(!last)return;player(last.off).onPitch=true;player(last.on).onPitch=false;render();}; $('endButton').onclick=()=>{state.running=false;showSummary();render();};
