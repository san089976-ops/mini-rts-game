"use strict";
/* ============ ui.js: 面板 ============ */
function hpBarHTML(hp,max){
  const pct=Math.max(0,Math.min(100,hp/max*100));
  let cls='';
  if(pct<=25) cls=' danger'; else if(pct<=50) cls=' warn';
  return '<div class="hpbar"><i'+cls+' style="width:'+pct+'%"></i></div>'+
         '<div class="statrow"><span>生命</span><b>'+Math.ceil(hp)+' / '+max+'</b></div>';
}
function statRow(label,val){ return '<div class="statrow"><span>'+label+'</span><b>'+val+'</b></div>'; }
function selImgHTML(key){
  return imgs[key] ? '<img class="selimg" src="'+IMAGES[key]+'">' : '';
}
function buildIconHTML(key, fallback){
  return imgs[key]
    ? '<div class="icon"><img class="iconImg" src="'+IMAGES[key]+'" alt=""></div>'
    : '<div class="icon">'+fallback+'</div>';
}
// 面板/介绍栏图标键:坦克按阵营(M60/T54),艾布拉姆用面板专属图,工厂用面板专属图(战场贴图不受影响)
const PANEL_KEYS = { abramsx:'abramsx_panel', leopard:'leopard_panel', bradley:'bradley_panel', marder:'marder_panel', leclerc:'leclerc_panel', mi17:'mi17_panel', su35:'su35_panel', challenger:'challenger_panel', littlebird:'littlebird_panel', b11:'b11_panel', f16:'f16_panel', f15:'f15_panel', puma:'puma_panel', t14:'t14_panel', t62:'t62_panel', t72:'t72_panel', t80:'t80_panel', t84bm:'t84bm_panel', uh60:'uh60_panel', mcv:'mcv_panel', merkava:'merkava_panel', airfield_car:'airfield_car_panel', ford:'ford_panel', kuznetsov:'kuznetsov_panel' };
function unitPanelKey(type, faction){
  if(type==='tank') return faction==='soviet' ? 'tank_soviet' : 'tank_allies';
  if(type==='abrams') return 'abrams_panel';
  if(type==='t90') return 't90_panel';
  return PANEL_KEYS[type] || type;
}
function bldPanelKey(defName){
  if(defName==='factory') return 'factory_panel';
  return defName;
}
function unitStatsHTML(u, multi){
  const d=u.def;
  let h=selImgHTML(unitPanelKey(u.type, unitFactionOf(u.team)));
  h+=hpBarHTML(u.hp,u.maxHp);
  if(multi) h+=statRow('编队生命', selected.reduce((s,x)=>s+x.hp,0)+' / '+selected.reduce((s,x)=>s+x.maxHp,0));
  if(!u.fly){
    // 飞机不显示伤害/射程/攻速:它靠安装武器包(测试炸弹包)实现伤害,面板另行显示弹舱
    h+=statRow('伤害', d.damage>0? d.damage+' · '+PROJ_NAME[d.proj] : '—');
    h+=statRow('射程', d.range>0? d.range : '—');
    h+=statRow('攻速', d.rof>0? d.rof.toFixed(2)+' 秒/发' : '—');
  }
  h+=statRow('移速', d.speed);
  h+=statRow('造价', '$'+(d.cost+(u.invested||0)));
  h+=statRow('护甲', ARMOR_NAME[u.armor]||'—');
  if(u.shield>0){
    let regen = 0;
    if(u.type==='t62') regen = t62Level(u).shieldRegen;
    else if(u.type==='t80') regen = t80Level(u).shieldRegen;
    else if(u.type==='t90') regen = t90Level(u).shieldRegen;
    else if(u.type==='t72') regen = t72Level(u).shieldRegen;
    else if(u.type==='t14') regen = T14_SHIELD_REGEN;
    else if(u.type==='tank' && unitFactionOf(u.team)==='soviet' && u.t54Branch) regen = t54Branch(u).shieldRegen;
    else if(u.rarm) regen = rarmShieldRegenFor(u);
    else if(u.tusk) regen = TUSK_SHIELD_REGEN;
    h+=statRow('护盾', Math.ceil(u.shield)+'/'+unitShieldMax(u)+' (回'+(regen>0?regen+'/秒':' —')+')');
  }
  if(u.fly && !u.chopper){
    h+=statRow('盘旋', '半径 '+PLANE_PATROL_R+' px 绕点绕圈');
    if(u.hardpoints){
      const aaCap=f15AmmoCap(u,'aa'), agCap=f15AmmoCap(u,'ag'), gbuCap=f15AmmoCap(u,'gbu');
      if(aaCap>0) h+=statRow(airAAName(u), u.aaAmmo+' / '+aaCap+' 发 · 空对空');
      if(agCap>0) h+=statRow(airAGName(u), u.agAmmo+' / '+agCap+' 发 · 空对地');
      if(gbuCap>0) h+=statRow(airBombName(u), u.gbuAmmo+' / '+gbuCap+' 颗 · 垂直炸弹'+(u.bombing?' · 投弹中':''));
    } else {
      if(u.aa) h+=statRow(airAAName(u), u.aaAmmo+' / '+AA_AMMO+' 发 · 空对空'+(u.aaCd>0?(' · 冷却 '+u.aaCd.toFixed(1)+'s'):''));
      if(u.ag) h+=statRow(airAGName(u), u.agAmmo+' / '+AG_AMMO+' 发 · 空对地'+(u.agCd>0?(' · 冷却 '+u.agCd.toFixed(1)+'s'):''));
    }
    if(u.radar) h+=statRow('雷达火控', '射程+'+RADAR_RANGE_BONUS+' · 1号:'+AIR_MODE_NAME[u.modeAA]+' / 2号:'+AIR_MODE_NAME[u.modeAG]);
    if(u.coat) h+=statRow('涂层更新', '敌方探测 -'+COAT_RANGE_PENALTY+'px');
    if(u.growler) h+=statRow('咆哮者干扰仓', '区域干扰 '+GROWLER_JAM_RADIUS+'px:敌导弹/无人机自爆·敌APS失效');
  }
  if(u.chopper){
    let st='飞行中';
    if(u.landing) st='正在降落...';
    else if(u.landed && u.rising) st='正在升起...';
    else if(u.landed) st='已降落 (可装载步兵)';
    h+=statRow('状态', st);
    h+=statRow('攻击', '升空只被空对空 · 落地可被地面/空对地攻击');
  }
  if(u.type==='harvester') h+=statRow('内含矿', Math.floor(u.cargo)+' / '+d.capacity);
  if(isCarrierShip(u)){
    let parked=0, flying=0;
    for(const a of units) if(a.hp>0 && a.fly && isAircraft(a) && a.homeBase===u){ if(a.parked) parked++; else flying++; }
    h+=statRow('停机位', parked+' / '+airBaseCapacity(u)+(flying?(' · 出击 '+flying):'')+(u.queue&&u.queue.length?(' · 生产中 '+u.queue.length):''));
  }
  if(isCarrier(u)) h+=statRow('运载', usedCapacity(u)+' / '+u.capacity+' 点'+(u.def.carrier?'(可装步兵)':''));
  if(u.type==='abramsx') h+=statRow('弹簧刀无人机', u.droneAmmo>0 ? '1 / 1 (可释放)' : ('0 / 1 (填装中 '+Math.ceil(u.droneReload)+'s)'));
  if(!isCarrier(u) && !u.naval && transportCost(u)>0) h+=statRow('占点', transportCost(u)+' 点');
  if(u.type==='challenger') h+=statRow('等级', u.upgrading ? ('升级中 '+Math.floor(u.upgradeProg/CHALL_UPGRADE_TIME*100)+'%') : ('Lv'+(u.upgradeLvl+1)+' · '+CHALL_NAMES[u.upgradeLvl]));
  if(u.type==='t72') h+=statRow('等级', u.upgrading ? (t72Level(u).name+' 升级中 '+Math.floor(u.upgradeProg/T72_UPGRADE_TIME*100)+'%') : ('Lv'+(u.upgradeLvl+1)+' · '+t72Level(u).name));
  if(u.type==='t62') h+=statRow('等级', u.upgrading ? (t62Level(u).name+' 升级中 '+Math.floor(u.upgradeProg/T62_UPGRADE_TIME*100)+'%') : ('Lv'+(u.upgradeLvl+1)+' · '+t62Level(u).name));
  if(u.type==='t80') h+=statRow('等级', u.upgrading ? (t80Level(u).name+' 升级中 '+Math.floor(u.upgradeProg/T80_UPGRADE_TIME*100)+'%') : ('Lv'+(u.upgradeLvl+1)+' · '+t80Level(u).name));
  if(u.type==='t90') h+=statRow('等级', u.upgrading ? (t90Level(u).name+' 升级中 '+Math.floor(u.upgradeProg/T90_UPGRADE_TIME*100)+'%') : ('Lv'+(u.upgradeLvl+1)+' · '+t90Level(u).name));
  if(u.type==='tank' && unitFactionOf(u.team)==='soviet') h+=statRow('型号', u.upgrading ? ('升级中 '+Math.floor(u.upgradeProg/T54_UPGRADE_TIME*100)+'%') : t54Branch(u).name);
  if(u.type==='tank' && unitFactionOf(u.team)!=='soviet') h+=statRow('型号', u.m60a3Upgrading ? ('M60A3 升级中 '+Math.floor(u.m60a3Prog/M60A3_UPGRADE_TIME*100)+'%') : (u.m60a3 ? 'M60A3' : 'M60'));
  if(u.atgm || u.atgmUpgrading){
    h+=statRow(atgmTypeName(u), u.atgmUpgrading ? ('安装中 '+Math.floor(u.atgmProg/ATGM_UPGRADE_TIME*100)+'%') :
      (u.atgm ? ('射程'+ATGM_RANGE+' · 伤害'+ATGM_DAMAGE+(u.atgmReload>0?(' · 装填 '+Math.ceil(u.atgmReload)+'s'):' · 已就绪')) : ''));
  }
  if(u.aps || u.apsUpgrading){
    h+=statRow('自主防御', u.apsUpgrading ? ('安装中 '+Math.floor(u.apsProg/apsUpgradeTimeFor(u)*100)+'%') :
      (u.aps ? (u.apsOn?'开启':'关闭')+' · 反导弹 '+u.apsAmmo+'/'+apsMaxAmmoFor(u)+(u.apsAmmo<apsMaxAmmoFor(u)?(' · 填充 '+Math.ceil(u.apsReload)+'s'):'')+' · 只反TOW' : ''));
  }
  if(u.tusk || u.tuskUpgrading){
    h+=statRow('TUSK', u.tuskUpgrading ? ('安装中 '+Math.floor(u.tuskProg/TUSK_UPGRADE_TIME*100)+'%') : ('300盾 · 回'+TUSK_SHIELD_REGEN+'/秒 · M1A2外观'));
  }
  if(u.gunUp || u.gunUpgrading){
    h+=statRow('火炮升级', u.gunUpgrading ? ('安装中 '+Math.floor(u.gunUpProg/GUN_UPGRADE_TIME*100)+'%') : ('伤害+'+GUN_DMG+' · 射程+'+GUN_RANGE));
  }
  h+='<div class="udesc">'+(d.desc||UNIT_DESC[u.type]||'')+'</div>';
  return h;
}
function buildingStatsHTML(b){
  const d=b.def;
  // 中立建筑:只显示属性详情(贴图仅用于战场,不在介绍栏显示)
  if(b.def.neutral){
    let h=hpBarHTML(b.hp,b.maxHp);
    h+=statRow('护甲', ARMOR_NAME[b.armor]||'—');
    h+=statRow('占地', b.w+'x'+b.h+' 格');
    if(b.def.dmgMod && b.def.dmgMod.cannon===0.5) h+=statRow('火炮抗性','50%(受火炮伤害减半)');
    if(b.def.garrisonCap) h+=statRow('进驻', b.def.garrisonCap+' 名步兵'+(b.def.tankSlot?' + 专属坦克位':''));
    h+='<div class="udesc">'+(b.def.desc||'中立建筑,可被摧毁但不影响胜负')+'</div>';
    return h;
  }
  let h=selImgHTML(bldPanelKey(b.defName));
  h+=hpBarHTML(b.hp,b.maxHp);
  h+=statRow('造价', '$'+(d.cost+(b.invested||0)));
  h+=statRow('护甲', ARMOR_NAME[b.armor]||'—');
  h+=statRow('电力', d.power>0? '+'+d.power : (b.powerUse>0? '-'+b.powerUse : '0'));
  h+=statRow('建造时间', d.buildTime.toFixed(1)+' 秒');
  if(b.constructing) h+=statRow('状态', '建造中 '+Math.floor(b.progress/d.buildTime*100)+'%');
  if(b.defName==='power') h+=statRow('等级','Lv'+(b.powerLevel+1)+' (电力 +'+b.powerLevel*POWER_UPGRADE_GAIN+', 收入 +'+b.powerLevel*POWER_UPGRADE_INCOME+'/秒)');
  if(b.defName==='power' && b.pwrUpgrading) h+=statRow('升级', Math.floor(b.pwrUpgradeProg/POWER_UPGRADE_TIME*100)+'%');
  if(b.defName==='factory') h+=statRow('工厂等级','Lv'+(b.upgradeLvl+1)+(b.upgradeLvl>=2?' (Lv3 可生产三级坦克)':(b.upgradeLvl>=1?' (Lv2 可生产高级坦克)':'')));
  if(b.defName==='command' || b.defName==='barracks' || b.defName==='dock') h+=statRow('建筑等级', b.upgraded ? (b.defName==='dock' ? 'Lv2 (可生产航母)' : 'Lv2') : 'Lv1');
  if(b.upgraded) h+=statRow('升级','已升级');
  if(b.upgrading){
    const uTime = b.defName==='command' ? COMMAND_UPGRADE_TIME : (b.defName==='barracks' ? BARRAX_UPGRADE_TIME : (b.defName==='factory' ? (b.upgradeLvl===0?FACTORY_UPGRADE_TIME:FACTORY_UPGRADE_TIME2) : (b.defName==='dock' ? DOCK_UPGRADE_TIME : FACTORY_UPGRADE_TIME)));
    h+=statRow('升级', Math.floor(b.upgradeProg/uTime*100)+'%');
  }
  if(b.queue.length) h+=statRow('生产', b.queue.map(q=>getUnitDefs(unitFactionOf(b.team))[q.type].name).join('、'));
  if(b.defName==='airfield'){
    let parked=0, flying=0;
    for(const u of units) if(u.hp>0 && u.fly && isAircraft(u) && u.homeBase===b){ if(u.parked) parked++; else flying++; }
    h+=statRow('停机位', parked+' / '+AIRFIELD_CAPACITY+' (出击 '+flying+(b.queue.length?(' · 生产中 '+b.queue.length):'')+')');
  }
  if(b.garrison && (b.garrison.length || b.garrisonTank)) h+=statRow('进驻', garrisonUnitCount(b)+' 个单位 · 总射程=半对角线+单位射程');
  if(b.def.incomePerSec || b.def.incomePerUnit){
    if(b.team>=0){
      let inc = b.def.incomePerSec || 0;
      if(b.def.incomePerUnit) inc += b.def.incomePerUnit * (b.garrison.length + (b.garrisonTank?1:0));
      h+=statRow('经济', '已占领 · 每秒 +'+inc+' 资金');
    } else {
      h+=statRow('经济', '进驻后每秒 +'+(b.def.incomePerSec||0)+(b.def.incomePerUnit?(' ×'+b.def.incomePerUnit+'×进驻人数'):'')+' 资金');
    }
  }
  h+='<div class="udesc">'+(UNIT_DESC['b_'+b.defName]||'')+'</div>';
  return h;
}
function updateStats(teamPower){
  const moneyEl=document.getElementById('money');
  moneyEl.textContent=Math.floor(credits[TEAM_A]);
  const p = teamPower || powerOf(TEAM_A);
  document.getElementById('power').textContent=p.give;
  document.getElementById('powerUse').textContent=p.use;
  document.getElementById('powerBadge').style.display = (p.give>0 && p.use>p.give) ? 'block' : 'none';
  powerInfo=p;
}
// 右侧机场飞机面板:仅选中己方机场时显示,列出该机场绑定的战斗机(停驻/出击都列),
// 可在不释放的情况下远程升级(测试炸弹包)
// 当前"航空基地":选中机场建筑,或选中的航母单位(移动机场)。右侧飞机面板与出击规划都针对它。
function currentAirBase(){
  if(selBuilding && selBuilding.alive && selBuilding.defName==='airfield' && selBuilding.team===TEAM_A) return selBuilding;
  const c = selected.find(u=>isCarrierShip(u) && u.team===TEAM_A && u.hp>0);
  return c || null;
}
function updateAirPanel(){
  const p=document.getElementById('airPanel');
  if(!p) return;
  const b = currentAirBase();
  if(!b){ p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  let parked=0, flying=0;
  const bound=[];
  for(const u of units){
    if(u.hp<=0 || !u.fly || !isAircraft(u) || u.homeBase!==b) continue;
    if(u.parked) parked++; else flying++;
    bound.push(u);
  }
  const cap = airBaseCapacity(b);
  document.getElementById('airPanelTitle').textContent = (isCarrierShip(b)?'航母部队':'机场部队')+' · 停驻 '+parked+'/'+cap+' (出击 '+flying+')';
  const list=document.getElementById('airPanelList');
  list.innerHTML='';
  // ---- 批量横幅:「选择全部同类」已启用时提示(含航母/机场全部同类) ----
  if(airBatchSel.size){
    const banner=document.createElement('div');
    banner.className='airPlanState batchBanner';
    banner.innerHTML='同类批量已启用: '+Array.from(airBatchSel).map(t=>airTypeShort({type:t})+' ×'+planesOfType(t).length).join(' · ')+' (升级/挂载将应用到全图同类)';
    list.appendChild(banner);
  }
  // ---- 出击规划区:号位按建造顺序(uid)排,阵亡自动重排;本阶段仅 停驻+雷达 的 F16 可选 ----
  const slots = bound.slice().sort((a,b)=>a.uid-b.uid);
  for(const uid of Array.from(airSortieSel)){
    const u = slots.find(x=>x.uid===uid);
    if(!u || u.hp<=0 || !u.parked || !u.radar || !isPlannablePlane(u)) airSortieSel.delete(uid);
  }
  const plan=document.createElement('div');
  plan.className='airPlan';
  let sh='<div class="airPlanTitle">出击规划</div><div class="airSlots">';
  const slotN = Math.max(cap||4, slots.length);
  for(let i=0;i<slotN;i++){
    const u=slots[i];
    let cls='airSlot';
    let tip='';
    if(!u){ sh+='<div class="airSlot disabled">'+(i+1)+':—</div>'; continue; }
    const sel=airSortieSel.has(u.uid);
    if(sel) cls+=' sel';
    if(planeMission) cls+=' disabled';
    else if(!u.parked){ cls+=' disabled'; tip='出击中'; }
    else if(!u.radar){ cls+=' disabled'; tip='无雷达'; }
    else if(!u.aa && !u.ag && !u.gbu){ cls+=' disabled'; tip='未安装武器'; }
    else if(!isPlannablePlane(u)){ cls+=' disabled'; tip='待移植'; }
    const onClick = (cls.indexOf('disabled')===-1) ? (' onclick="airSlotToggle('+u.uid+')"') : '';
    sh+='<div class="'+cls+'"'+onClick+'>'+(i+1)+':'+airTypeShort(u)+(tip?('<span class="slotTip">'+tip+'</span>'):'')+'</div>';
  }
  sh+='</div>';
  const selCnt=airSortieSel.size;
  if(!planeMission){
    const ok = selCnt>0;
    sh+='<div class="airPlanBtns">'+
        '<button class="airbtn'+(ok?'':' disabled')+'"'+(ok?' onclick="airStartPrecision()"':'')+'>精确打击</button>'+
        '<button class="airbtn'+(ok?'':' disabled')+'"'+(ok?' onclick="airStartDistributed()"':'')+'>分布式攻击</button></div>'+
        '<div class="airPlanState">勾选停驻且已装雷达的战斗机号位 ('+(selCnt?('已选 '+selCnt+' 架'):'未选')+')</div>';
  } else if(planeMission.mode==='precision'){
    sh+='<div class="airPlanState">精确打击待命:右键敌方目标锁定 ('+selCnt+' 架,全部倾泻后返场)</div>'+
        '<div class="airPlanBtns"><button class="airbtn" onclick="airCancelMission()">取消</button></div>';
  } else {
    sh+='<div class="airPlanState">剩余 对空:'+planeMission.remaining.aa+' / 对地:'+planeMission.remaining.ag+' / 炸弹:'+(planeMission.remaining.gbu||0)+' · 已分配 '+planeMission.assignments.length+' 发</div>'+
        '<div class="airPlanBtns">'+
        '<button class="airbtn" onclick="airConfirmDistributed()">确定</button>'+
        '<button class="airbtn" onclick="airCancelMission()">取消</button></div>';
  }
  plan.innerHTML=sh;
  list.appendChild(plan);
  if(!bound.length){
    const empty=document.createElement('div');
    empty.className='airRow';
    empty.innerHTML='<div class="airTag">暂无战斗机,先生产几架</div>';
    list.appendChild(empty);
    return;
  }
  for(const u of bound){
    const row=document.createElement('div');
    row.className='airRow';
    const hpPct=Math.max(0,Math.min(100,u.hp/u.maxHp*100));
    const mkBtn=(label,upgrading,progTime,installed,uid)=>{
      if(upgrading) return '<div class="airbtn disabled">'+label+' 安装中 '+Math.floor(u[installed+'Prog']/progTime*100)+'%</div>';
      if(u[installed]) return '<div class="airbtn disabled">'+label+' 已装</div>';
      const cost = installed==='aa'?AA_COST:installed==='ag'?AG_COST:installed==='radar'?RADAR_COST:installed==='coat'?COAT_COST:GROWLER_COST;
      return '<button class="airbtn" onclick="airPlaneUpgrade('+uid+',\''+installed+'\')">'+label+' $'+cost+'</button>';
    };
    let btnHTML = '';
    if(u.hardpoints){
      // F-15:两步选择挂载点——先点挂载点,再点武器类型
      if(u.hpSel===null || u.hpSel===undefined){
        for(let i=0;i<F15_HP_COUNT;i++){
          const hp = u.hardpoints[i];
          if(hp && hp.upgrading){
            btnHTML += '<div class="airbtn disabled">挂点'+(i+1)+' 安装中 '+Math.floor(hp.prog/(hp.kind==='growler'?GROWLER_UPGRADE_TIME:(hp.kind==='gbu'?GBU31_UPGRADE_TIME:(hp.kind==='aa'?AA_UPGRADE_TIME:AG_UPGRADE_TIME)))*100)+'%</div>';
          } else if(hp){
            const hpN = hp.kind==='growler' ? 1 : (hp.kind==='gbu' ? GBU31_AMMO_PER_HP : (hp.kind==='aa'?AA_AMMO:AG_AMMO));
            btnHTML += '<div class="airbtn disabled">挂点'+(i+1)+' '+(hp.kind==='growler'?'咆哮者干扰仓':(hp.kind==='gbu'?airBombName(u):(hp.kind==='aa'?airAAName(u):airAGName(u))))+(hp.kind==='growler'?'':' ×'+hpN)+'</div>';
          } else {
            btnHTML += '<button class="airbtn" onclick="airHpSel('+u.uid+','+i+')">挂点'+(i+1)+' (空)</button>';
          }
        }
      } else {
        const i = u.hpSel;
        btnHTML += '<div class="airbtn disabled">挂点'+(i+1)+' 选择武器:</div>';
        btnHTML += '<button class="airbtn" onclick="airHpUpgrade('+u.uid+','+i+',\'aa\')">'+airAAName(u)+' $'+AA_COST+'</button>'
                 + '<button class="airbtn" onclick="airHpUpgrade('+u.uid+','+i+',\'ag\')">'+airAGName(u)+' $'+AG_COST+'</button>'
                 + '<button class="airbtn" onclick="airHpUpgrade('+u.uid+','+i+',\'gbu\')">'+airBombName(u)+' $'+GBU31_COST+'</button>'
                 + (isGrowlerUnit(u) ? '<button class="airbtn" onclick="airHpUpgrade('+u.uid+','+i+',\'growler\')">咆哮者干扰仓 $'+GROWLER_COST+'</button>' : '')
                 + '<button class="airbtn" onclick="airHpSelCancel('+u.uid+')">取消</button>';
      }
      if(u.gbu && u.gbuAmmo>0){
        btnHTML += '<button class="airbtn" onclick="airGbuRelease('+u.uid+')">'+(u.bombing?'投弹中...':'释放 '+airBombName(u)+' ('+u.gbuAmmo+')')+'</button>'
                 + '<button class="airbtn" onclick="airGbuCount('+u.uid+')">每次 '+u.bombReleaseCount+' 颗</button>';
      }
    } else {
      btnHTML = mkBtn(airAAName(u), u.aaUpgrading, AA_UPGRADE_TIME, 'aa', u.uid)
        + mkBtn(airAGName(u), u.agUpgrading, AG_UPGRADE_TIME, 'ag', u.uid);
    }
    btnHTML += mkBtn('雷达', u.radarUpgrading, RADAR_UPGRADE_TIME, 'radar', u.uid)
      + mkBtn('涂层', u.coatUpgrading, COAT_UPGRADE_TIME, 'coat', u.uid);
    // 攻击模式按钮(需已装雷达 + 对应导弹包):点击循环 手动→自动分配→倾泻
    if(u.radar){
      if(u.aa) btnHTML += '<button class="airbtn" onclick="airPlaneMode('+u.uid+',\'aa\')">1号 '+airAAName(u)+': '+AIR_MODE_NAME[u.modeAA]+'</button>';
      if(u.ag) btnHTML += '<button class="airbtn" onclick="airPlaneMode('+u.uid+',\'ag\')">2号 '+airAGName(u)+': '+AIR_MODE_NAME[u.modeAG]+'</button>';
    }
    // 「选择全部同类」按钮(在每架飞机 UI 下方):只要全图同型中还有一个升级包/挂点没升级就显示;
    // 已选中时高亮。点击后对全图同型(航母+机场、停驻+出击)统一升级/挂载。
    if(airBatchVisible(u.type)){
      const batchOn = airBatchSel.has(u.type);
      btnHTML += '<button class="airbtn'+(batchOn?' batchOn':'')+'" onclick="airBatchToggle(\''+u.type+'\')">'+
        (batchOn?'✓ 已选全部同类':'选择全部同类')+' (×'+planesOfType(u.type).length+')</button>';
    }
    row.innerHTML =
      '<div class="airName">'+u.def.name+' <span class="airTag">'+(u.parked?'[停驻]':'[出击中]')+'</span></div>'+
      '<div class="airStat">生命 '+Math.ceil(u.hp)+'/'+u.maxHp+' · 移速 '+u.speed+
        (u.hardpoints
          ? ((u.aa?(' · '+airAAName(u)+' '+u.aaAmmo+'/'+f15AmmoCap(u,'aa')):'')+
             (u.ag?(' · '+airAGName(u)+' '+u.agAmmo+'/'+f15AmmoCap(u,'ag')):'')+
             (u.gbu?(' · '+airBombName(u)+' '+u.gbuAmmo+'/'+f15AmmoCap(u,'gbu')):''))
          : ((u.aa?(' · '+airAAName(u)+' '+u.aaAmmo+'/'+AA_AMMO):'')+
             (u.ag?(' · '+airAGName(u)+' '+u.agAmmo+'/'+AG_AMMO):'')))+
        (u.radar && !u.aa && !u.ag ? ' · 未安装导弹包' : '')+'</div>'+
      '<div class="airhp"><i style="width:'+hpPct+'%"></i></div>'+
      btnHTML;
    list.appendChild(row);
  }
}
// ============ 右侧飞机栏「选择全部同类」批量升级/挂载 ============
// 全图本方所有存活同型飞机(跨航母+机场,停驻+出击都算)
function planesOfType(type){
  return units.filter(u=>u.hp>0 && u.fly && isAircraft(u) && u.type===type && u.team===TEAM_A);
}
// 该机是否还有"没升级完"的升级包/挂载点(用于批量按钮的显示条件)
function planeHasPending(u){
  if(!u || u.hp<=0) return false;
  if(u.hardpoints){            // F-15/F18/苏35:任一挂点为空 或缺雷达/涂层/咆哮者
    if(u.hardpoints.some(hp=>!hp)) return true;
    if(!u.radar || !u.coat) return true;
    if(isGrowlerUnit(u) && !u.growler) return true;
    return false;
  }
  return !u.aa || !u.ag || !u.radar || !u.coat;   // F16/苏27
}
// 「选择全部同类」按钮的显示条件:已批量选中 或 全图同型中还有未升级项
function airBatchVisible(type){
  if(airBatchSel.has(type)) return true;
  return planesOfType(type).some(planeHasPending);
}
// 切换某机型的批量选择
function airBatchToggle(type){
  if(airBatchSel.has(type)){
    airBatchSel.delete(type);
  } else {
    airBatchSel.add(type);
  }
  const anchor = currentAirBase();
  if(anchor) textPopup(anchor.x, anchor.y-24,
    airBatchSel.has(type)
      ? ('已批量选择 '+airTypeShort({type:type})+' ×'+planesOfType(type).length+' (含航母/机场全部同类)')
      : '已取消 全部同类',
    airBatchSel.has(type) ? '#8aff8a' : '#ffd0d0');
  updatePanel();
}
// 批量升级:逐架扣费,已升级/安装中的自动跳过(钱不够就只升得起多少架)
function airBatchApply(list, fn, label){
  let n=0;
  for(const p of list){ if(fn(p)) n++; }
  if(n){
    const anchor = (list[0] && list[0].x!==undefined) ? list[0] : currentAirBase();
    if(anchor) textPopup(anchor.x, anchor.y-24, (label||'升级')+' ×'+n+' 架', '#8aff8a');
  }
  updatePanel();
}
// 右侧机场/航母面板:给指定 uid 的飞机安装对应模块(无需释放即可升级);
// 若该机型处于「选择全部同类」状态,则应用到全图同型飞机(逐架扣费,已装/安装中跳过)
function airPlaneUpgrade(uid, which){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.homeBase || u.homeBase!==currentAirBase()) return;
  if(airBatchSel.has(u.type)){
    airBatchApply(planesOfType(u.type), p=>{
      if(which==='aa') return startAAUpgrade(p);
      else if(which==='ag') return startAGUpgrade(p);
      else if(which==='radar') return startRadarUpgrade(p);
      else if(which==='coat') return startCoatUpgrade(p);
      return false;
    }, (which==='aa'?airAAName(u):which==='ag'?airAGName(u):which==='radar'?'雷达火控':'涂层更新')+'批量安装');
    return;
  }
  if(which==='aa' && !u.aaUpgrading && !u.aa) startAAUpgrade(u);
  else if(which==='ag' && !u.agUpgrading && !u.ag) startAGUpgrade(u);
  else if(which==='radar' && !u.radarUpgrading && !u.radar) startRadarUpgrade(u);
  else if(which==='coat' && !u.coatUpgrading && !u.coat) startCoatUpgrade(u);
}
// 右侧机场/航母面板:F-15 给指定挂载点安装武器;批量状态下对全图同型 F-15 同一挂点一起挂载
// (该挂点已有武器/安装中的飞机自动跳过)
function airHpUpgrade(uid, slotIdx, kind){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.homeBase || u.homeBase!==currentAirBase() || !u.hardpoints) return;
  if(airBatchSel.has(u.type)){
    airBatchApply(planesOfType(u.type), p=>{ return (p.hardpoints && startHardpointUpgrade(p, slotIdx, kind)); },
      (kind==='growler'?'咆哮者干扰仓':(kind==='gbu'?airBombName(u):(kind==='aa'?airAAName(u):airAGName(u))))+' 挂点'+(slotIdx+1)+' 批量挂载');
    return;
  }
  startHardpointUpgrade(u, slotIdx, kind);
}
// 右侧机场面板:F-15 选择挂载点(进入武器类型选择)
function airHpSel(uid, slotIdx){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.hardpoints) return;
  u.hpSel = slotIdx;
  updatePanel();
}
// 右侧机场面板:F-15 取消挂载点选择
function airHpSelCancel(uid){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.hardpoints) return;
  u.hpSel = null;
  updatePanel();
}
// 右侧机场面板:F-15 开始/停止连续投弹
function airGbuRelease(uid){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.hardpoints) return;
  if(u.bombing){ u.bombing = false; textPopup(u.x,u.y-20,'停止投弹','#ffd0d0'); }
  else if(u.gbu && u.gbuAmmo>0){
    u.bombing = true; u.bombCd = 0;
    textPopup(u.x,u.y-20,'开始投弹 (剩 '+u.gbuAmmo+')','#8aff8a');
  }
  updatePanel();
}
// 右侧机场面板:F-15 切换每次投弹颗数(1↔2)
function airGbuCount(uid){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.hardpoints) return;
  u.bombReleaseCount = (u.bombReleaseCount||1) === 1 ? 2 : 1;
  textPopup(u.x,u.y-20,'每次释放 '+u.bombReleaseCount+' 颗','#ffe27a');
  updatePanel();
}
// 右侧机场面板:循环切换指定飞机的攻击模式(需已装雷达 + 对应导弹包)
function airPlaneMode(uid, which){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.radar) return;
  if(which==='aa' && u.aa){
    u.modeAA=(u.modeAA+1)%3;
    textPopup(u.x, u.y-20, '1号 '+airAAName(u)+': '+AIR_MODE_NAME[u.modeAA], '#8aff8a');
    updatePanel();
  } else if(which==='ag' && u.ag){
    u.modeAG=(u.modeAG+1)%3;
    textPopup(u.x, u.y-20, '2号 '+airAGName(u)+': '+AIR_MODE_NAME[u.modeAG], '#8aff8a');
    updatePanel();
  }
}
/* ============ 出击规划(精确打击 / 分布式攻击,F16) ============ */
function airSlotToggle(uid){
  if(planeMission) return;
  if(airSortieSel.has(uid)) airSortieSel.delete(uid);
  else airSortieSel.add(uid);
  updatePanel();
}
function airStartPrecision(){
  if(planeMission || !airSortieSel.size) return;
  planeMission = { mode:'precision', uids:Array.from(airSortieSel) };
  updatePanel();
}
function airStartDistributed(){
  if(planeMission || !airSortieSel.size) return;
  const uids = Array.from(airSortieSel);
  let remaining = { aa:0, ag:0, gbu:0 };
  for(const u of units){
    if(uids.includes(u.uid) && u.fly && u.parked && u.hp>0 && u.radar){
      remaining.aa += u.aa ? (u.aaAmmo||0) : 0;
      remaining.ag += u.ag ? (u.agAmmo||0) : 0;
      remaining.gbu += u.gbu ? (u.gbuAmmo||0) : 0;
    }
  }
  planeMission = { mode:'distributed', uids, remaining, assignments:[] };
  updatePanel();
}
function airConfirmDistributed(){
  if(!planeMission || planeMission.mode!=='distributed') return;
  if(!planeMission.assignments.length){
    const base = currentAirBase();
    if(base) textPopup(base.x, base.y-24, '未分配任何导弹,无法出动','#ff8080');
    return;
  }
  launchDistributed(planeMission.uids, planeMission.assignments);
  planeMission = null; airSortieSel.clear();
  updatePanel();
}
function airCancelMission(){
  planeMission = null;
  updatePanel();
}
function updatePanel(){
  updateStats();
  updateAirPanel();   // 右侧机场飞机面板(仅选中机场时显示)
  const panel=document.getElementById('panel');
  panel.innerHTML='';
  const title=document.getElementById('selTitle');
  const desc=document.getElementById('selDesc');
  let btnIdx=0;
  const mk=(name,defName,extra)=>{
    btnIdx++;
    const d=BLD_DEFS[defName];
    const b=document.createElement('div');
    b.className='btn';
    b.dataset.action='build'; b.dataset.def=defName;
    const k=bldPanelKey(defName);
    b.innerHTML=buildIconHTML(k,d.name[0])+'<div class="bname">'+d.name+'</div><div class="cost">$'+d.cost+'</div>'+(extra||'')+'<span class="num">'+btnIdx+'</span>';
    panel.appendChild(b);
  };
  const unitCounts = new Map();
  for(const u of units){ if(u.team===TEAM_A) unitCounts.set(u.type, (unitCounts.get(u.type)||0)+1); }
  const mkUnit=(defName, disabled)=>{
    btnIdx++;
    const d=getUnitDefs(playerFaction)[defName];
    const cnt=unitCounts.get(defName)||0;
    const b=document.createElement('div');
    b.className='btn';
    b.dataset.action=disabled?'none':'train'; b.dataset.def=defName;
    if(disabled) b.classList.add('disabled');
    const k=unitPanelKey(defName, playerFaction);
    b.innerHTML=buildIconHTML(k,d.name[0])+'<div class="bname">'+d.name+'</div><div class="cost">$'+d.cost+'</div><span class="cnt">x'+cnt+'</span><span class="num">'+btnIdx+'</span>';
    panel.appendChild(b);
  };
  const mkAction=(label,action,enabled,data)=>{
    const b=document.createElement('div'); b.className='btn';
    b.dataset.action=enabled?action:'none';
    if(data) b.dataset.def=data;
    b.innerHTML='<div style="font-size:13px">'+label+'</div>';
    if(!enabled) b.classList.add('disabled');
    panel.appendChild(b);
  };
  // 批量升级计数:返回列表里仍需要该升级包(未安装/未安装中)的单位数
  const countNeeding=(pred)=>{
    let n=0;
    for(const u of selected){ if(u.hp>0 && pred(u)) n++; }
    return n;
  };
  // 批量升级动作:只要还有单位未升级就显示,点击后只作用于未升级的单位
  const pkgAction=(pred,label,act)=>{
    const n=countNeeding(pred);
    if(n) mkAction(label+(n>1?('  ×'+n+' 待装'):''),act,true);
  };

  if(placing){
    title.textContent='放置: '+placing.def.name+' (Esc 取消)';
    desc.textContent='移动到绿色区域后左键放置';
    mkAction('取消','cancel',true);
    return;
  }
  if(selBuilding && selBuilding.alive){
    title.textContent = selBuilding.def.name + (selBuilding.team===TEAM_A?' (我方)':(selBuilding.team<0?' (中立)':' (敌方)'));
    desc.innerHTML = buildingStatsHTML(selBuilding);
    if(selBuilding.team===TEAM_A){
      // 进驻建筑:只有释放操作
      if(selBuilding.garrison && (selBuilding.garrison.length || selBuilding.garrisonTank)){
        mkAction('释放部队 ('+garrisonUnitCount(selBuilding)+')','release',true);
        return;
      }
      if(selBuilding.constructing){ mkAction('建造中...','none',false); }
      else if(selBuilding.def.build && selBuilding.def.build.length){
        for(const dn of selBuilding.def.build) mk('',dn);
        // 建造厂:升级后解锁机场建筑车生产
        if(selBuilding.defName==='command'){
          if(selBuilding.upgraded){
            if(selBuilding.queue.length) mkAction('生产中...','none',false);
            mkUnit('airfield_car');
            if(selBuilding.queue.length){
              const fac=unitFactionOf(selBuilding.team);
              const last=selBuilding.queue[selBuilding.queue.length-1];
              const d=getUnitDefs(fac)[last.type];
              mkAction('取消「'+(d?d.name:last.type)+'」 退款 $'+(d?d.cost:0),'cancelprod',true);
            }
          } else if(selBuilding.upgrading){
            mkAction('升级中...','none',false);
          } else {
            const cn = buildings.filter(b=>b.team===TEAM_A&&b.alive&&b.defName==='command').length;
            if(cn>1) mkAction(selectedBlds.length>1 ? '已选择全体 ('+selectedBlds.length+' 座)' : '选择全体同类 ('+cn+' 座)', selectedBlds.length>1?'none':'selAllSameBld', true);
            mkAction('升级 建造厂 $'+COMMAND_UPGRADE_COST+(selectedBlds.length>1?' ×'+selectedBlds.length:''),'cmdUp',true);
          }
        }
      } else if(selBuilding.def.train && selBuilding.def.train.length){
        if(selBuilding.queue.length) mkAction('生产中...','none',false);
        // 阵营专属单位(如战斗机)只显示本阵营可生产的;航母只在船坞升级后由下方 dock 块单独显示
        const afFull = airfieldUsedSlots(selBuilding) >= AIRFIELD_CAPACITY;
        for(const t of selBuilding.def.train){
          if(!getUnitDefs(playerFaction)[t] || isCarrierShipType(t)) continue;
          mkUnit(t, afFull && isAircraftType(t));   // 停机位满:战斗机按钮置灰,直升机不受影响
        }
        if(afFull) mkAction('停机位已满,无法再生产战斗机','none',false);
        // 取消制造:只取消队列末尾的一个单位,全额退款
        if(selBuilding.queue.length){
          const fac=unitFactionOf(selBuilding.team);
          const last=selBuilding.queue[selBuilding.queue.length-1];
          const d=getUnitDefs(fac)[last.type];
          mkAction('取消「'+(d?d.name:last.type)+'」 退款 $'+(d?d.cost:0),'cancelprod',true);
        }
        // 战车工厂:两次升级 + 高级坦克(Lv2) + 三级坦克(Lv3)
        if(selBuilding.defName==='factory'){
          if(selBuilding.upgrading){
            mkAction('升级中...','none',false);
            // Lv2升Lv3期间仍可生产高级单位;Lv1升Lv2期间不开放高级单位
            if(selBuilding.upgradeLvl>=1){
              for(const t of factoryUnitsFor(unitFactionOf(TEAM_A))) mkUnit(t);
            }
          }
          else if(selBuilding.upgradeLvl===0){
            const fn = buildings.filter(b=>b.team===TEAM_A&&b.alive&&b.defName==='factory').length;
            if(fn>1) mkAction(selectedBlds.length>1 ? '已选择全体 ('+selectedBlds.length+' 座)' : '选择全体同类 ('+fn+' 座)', selectedBlds.length>1?'none':'selAllSameBld', true);
            mkAction('升级 战车工厂 $'+FACTORY_UPGRADE_COST+(selectedBlds.length>1?' ×'+selectedBlds.length:''),'upgrade',true);
          } else {
            // 已升 Lv2:高级坦克列表
            for(const t of factoryUnitsFor(unitFactionOf(TEAM_A))) mkUnit(t);
            if(selBuilding.upgradeLvl===1){
              // 第二次升级 → Lv3 工厂(解锁三级坦克)
              mkAction('再次升级 战车工厂 $'+FACTORY_UPGRADE_COST2+' (升级至Lv3,解锁三级坦克)'+(selectedBlds.length>1?' ×'+selectedBlds.length:''),'upgrade',true);
            } else {
              // Lv3 工厂专属坦克(usa=艾布拉姆X / soviet=T14;欧洲/以色列无三级)
              for(const t of tier3UnitsFor(unitFactionOf(TEAM_A))) mkUnit(t);
            }
          }
        }
        // 兵营:升级 / 高级步兵
        if(selBuilding.defName==='barracks'){
          if(selBuilding.upgraded){ mkUnit(advancedInfantryType(TEAM_A)); }
          else if(selBuilding.upgrading){ mkAction('升级中...','none',false); }
          else {
            const bn = buildings.filter(b=>b.team===TEAM_A&&b.alive&&b.defName==='barracks').length;
            if(bn>1) mkAction(selectedBlds.length>1 ? '已选择全体 ('+selectedBlds.length+' 座)' : '选择全体同类 ('+bn+' 座)', selectedBlds.length>1?'none':'selAllSameBld', true);
            mkAction('升级 兵营 $'+BARRAX_UPGRADE_COST+(selectedBlds.length>1?' ×'+selectedBlds.length:''),'barrackUp',true);
          }
        }
        // 机场:释放停驻的战斗机
        if(selBuilding.defName==='airfield'){
          let parked=0;
          for(const u of units) if(u.hp>0 && u.fly && u.parked && u.homeBase===selBuilding) parked++;
          if(parked) mkAction('释放战斗机 ('+parked+' 架)','releaseAir',true);
        }
        // 船坞:升级(2级) + 解锁航母生产
        if(selBuilding.defName==='dock'){
          if(selBuilding.upgrading){
            mkAction('升级中...','none',false);
          } else if(!selBuilding.upgraded){
            const dn = buildings.filter(b=>b.team===TEAM_A&&b.alive&&b.defName==='dock').length;
            if(dn>1) mkAction(selectedBlds.length>1 ? '已选择全体 ('+selectedBlds.length+' 座)' : '选择全体同类 ('+dn+' 座)', selectedBlds.length>1?'none':'selAllSameBld', true);
            mkAction('升级 船坞 $'+DOCK_UPGRADE_COST+(selectedBlds.length>1?' ×'+selectedBlds.length:''),'dockUp',true);
          } else {
            const car = carrierFor(unitFactionOf(TEAM_A));
            if(car) for(const t of [car]) mkUnit(t);   // 欧洲/以色列无航母
          }
        }
      } else {
        if(selBuilding.defName==='power'){
          const pn = buildings.filter(b=>b.team===TEAM_A&&b.alive&&b.defName==='power').length;
          if(pn>1) mkAction(selectedBlds.length>1 ? '已选择全体 ('+selectedBlds.length+' 座)' : '选择全体同类 ('+pn+' 座)', selectedBlds.length>1?'none':'selAllSameBld', true);
        }
        if(selBuilding.defName==='power' && selBuilding.pwrUpgrading){
          mkAction('升级中...','none',false);
        } else if(selBuilding.defName==='power' && selBuilding.powerLevel<POWER_MAX_LEVEL){
          mkAction('升级发电厂 $'+POWER_UPGRADE_COST+(selectedBlds.length>1?' ×'+selectedBlds.length:''),'pwrUp',true);
        } else if(selBuilding.defName==='power'){
          mkAction('已满级','none',false);
        } else if(selBuilding.defName==='lab'){
          // 实验室:选择可研发的科技
          if(selBuilding.researching){
            const rd=RESEARCH_DEFS[selBuilding.researching.id];
            mkAction('研究中: '+rd.name+' '+Math.floor(selBuilding.researching.progress/rd.time*100)+'%','none',false);
          } else {
            for(const id in RESEARCH_DEFS){
              const rd=RESEARCH_DEFS[id];
              if(rd.faction && rd.faction!==unitFactionOf(TEAM_A)) continue;   // 阵营专属过滤
              if(hasResearch(TEAM_A, id)){ mkAction('✓ 已完成 · '+rd.name,'none',false); continue; }
              mkAction(rd.name+' $'+rd.cost,'research',true,id);
            }
          }
        } else {
          mkAction('无功能','none',false);
        }
      }
    } else if(selBuilding.team<0){
      mkAction('中立建筑','none',false);
    } else {
      mkAction('敌方建筑','none',false);
    }
    return;
  }
  if(selected.length){
    const first=selected[0];
    title.textContent = selected.length>1 ? (first.def.name+' 等 '+selected.length+' 个单位') : first.def.name;
    desc.innerHTML = unitStatsHTML(first, selected.length>1);
    if(first.type==='mcv') mkAction('展开基地车 (E)','deploy',true);
    if(first.type==='airfield_car') mkAction('展开机场 (E)','deploy',true);
    if(isCarrierShip(first)){
      // 航母(移动机场):生产其 train 中的战斗机 + 释放停驻战斗机
      const carUnit = first.def.train || [];
      const carFull = airfieldUsedSlots(first) >= airBaseCapacity(first);
      for(const t of carUnit){ if(getUnitDefs(playerFaction)[t]) mkUnit(t, carFull); }
      if(carFull) mkAction('停机位已满,无法再生产','none',false);
      if(first.queue && first.queue.length){
        const fac=unitFactionOf(first.team);
        const last=first.queue[first.queue.length-1];
        const d=getUnitDefs(fac)[last.type];
        mkAction('取消「'+(d?d.name:last.type)+'」 退款 $'+(d?d.cost:0),'cancelprodCar',true);
      }
      let parked=0;
      for(const u of units) if(u.hp>0 && u.fly && u.parked && u.homeBase===first) parked++;
      if(parked) mkAction('释放战斗机 ('+parked+' 架)','releaseCarAir',true);
    }
    if(first.type==='f16' || first.type==='su35'){
      // 空对空/空对地导弹包:任何一架没装就显示,点击只给未装的装
      pkgAction(u=>!u.aaUpgrading && !u.aa, airAAName(first)+' 空对空导弹包 $'+AA_COST, 'aaUp');
      pkgAction(u=>!u.agUpgrading && !u.ag, airAGName(first)+' 空对地导弹包 $'+AG_COST, 'agUp');
    }
    if(first.type==='f15' || first.type==='f18' || first.type==='su35h'){
      // 重型多用途战斗机(F-15 / F/A-18 / 苏-35)4 个武器挂载点:两步选择——先点挂载点,再点武器类型
      if(first.hpSel===null || first.hpSel===undefined){
        for(let i=0;i<F15_HP_COUNT;i++){
          const hp = first.hardpoints[i];
          const emptyN = countNeeding(u=>u.hardpoints && !u.hardpoints[i]);
          if(emptyN){
            mkAction('挂载点'+(i+1)+(hp?' (已装,可补其它机)':' (空) 点击选择武器')+(emptyN>1?('  ×'+emptyN):''),'hpSel',true,i);
          } else if(hp && hp.upgrading){
            mkAction('挂载点'+(i+1)+' 安装中 '+Math.floor(hp.prog/(hp.kind==='growler'?GROWLER_UPGRADE_TIME:(hp.kind==='gbu'?GBU31_UPGRADE_TIME:(hp.kind==='aa'?AA_UPGRADE_TIME:AG_UPGRADE_TIME)))*100)+'%','none',false);
          } else if(hp){
            const hpN = hp.kind==='growler' ? 1 : (hp.kind==='gbu' ? GBU31_AMMO_PER_HP : (hp.kind==='aa'?AA_AMMO:AG_AMMO));
            mkAction('挂载点'+(i+1)+': '+(hp.kind==='growler'?'咆哮者干扰仓':(hp.kind==='gbu'?airBombName(first):(hp.kind==='aa'?airAAName(first):airAGName(first))))+(hp.kind==='growler'?'':' ×'+hpN),'none',false);
          }
        }
      } else {
        // 已选定挂载点:显示武器类型选择,点击后给所有该挂点为空的本型飞机挂载
        const i = first.hpSel;
        const emptyN = countNeeding(u=>u.hardpoints && !u.hardpoints[i]);
        if(emptyN){
          mkAction('挂载点'+(i+1)+': 选择武器类型'+(emptyN>1?(' ×'+emptyN+' 待装'):''),'none',false);
          mkAction('  '+airAAName(first)+' 空对空 $'+AA_COST,'hpUp',true,i+':'+'aa');
          mkAction('  '+airAGName(first)+' 空对地 $'+AG_COST,'hpUp',true,i+':'+'ag');
          mkAction('  '+airBombName(first)+' 垂直炸弹 $'+GBU31_COST,'hpUp',true,i+':'+'gbu');
          if(isGrowlerUnit(first)) mkAction('  咆哮者干扰仓 $'+GROWLER_COST,'hpUp',true,i+':'+'growler');
        } else {
          mkAction('挂载点'+(i+1)+' 已全部装满','none',false);
        }
        mkAction('取消','hpSelCancel',true);
      }
      // 垂直炸弹投弹:有弹时显示释放按钮 + 每次投弹颗数切换
      if(first.gbu && first.gbuAmmo>0){
        mkAction(first.bombing ? airBombName(first)+' 投弹中... (剩 '+first.gbuAmmo+')' : '释放 '+airBombName(first)+' ('+first.gbuAmmo+' 颗)','gbuRelease',!first.bombing);
        mkAction('每次释放: '+first.bombReleaseCount+' 颗','gbuCount',true);
      }
    }
    if(first.type==='f16' || first.type==='su35' || first.type==='f15' || first.type==='f18' || first.type==='su35h'){
      // 雷达火控(射程+30,解锁攻击模式按键)
      pkgAction(u=>!u.radarUpgrading && !u.radar, '雷达火控 $'+RADAR_COST, 'radarUp');
      const withRadarAA = selected.filter(u=>u.hp>0 && u.radar && u.aa);
      if(withRadarAA.length) mkAction('1号位 '+airAAName(first)+': '+AIR_MODE_NAME[first.modeAA],'modeAA',true);
      const withRadarAG = selected.filter(u=>u.hp>0 && u.radar && u.ag);
      if(withRadarAG.length) mkAction('2号位 '+airAGName(first)+': '+AIR_MODE_NAME[first.modeAG],'modeAG',true);
      // 涂层更新(敌方雷达式探测-50px)
      pkgAction(u=>!u.coatUpgrading && !u.coat, '涂层更新 $'+COAT_COST, 'coatUp');
    }
      if(first.chopper){
        // 运输直升机:升起/降落切换(只有落地才能装载士兵)
      if(first.landing) mkAction('正在降落...','none',false);
      else if(first.rising) mkAction('正在升起 ('+ROTOR_SPIN_UP+'s)...','none',false);
      else if(first.landed) mkAction('升起 (起飞 '+ROTOR_SPIN_UP+'s)','chopperRise',true);
      else mkAction('降落','chopperLand',true);
    }
    if(isCarrier(first) && first.cargoUnits && first.cargoUnits.length && !(first.chopper && !first.landed)) mkAction('释放部队 ('+first.cargoUnits.length+')','unload',true);
    if(first.type==='challenger'){
      const upN = countNeeding(u=>!u.upgrading && u.upgradeLvl<2);
      const ugN = countNeeding(u=>u.upgrading);
      if(ugN) mkAction('升级中 ×'+ugN,'none',false);
      if(upN) mkAction('升级 → 下一阶段 $'+CHALL_UPGRADE_COST+(upN>1?(' ×'+upN):''),'challUpgrade',true);
      else if(!ugN) mkAction('已满级 '+CHALL_NAMES[2],'none',false);
    }
    if(first.type==='t72'){
      // T72 → T72B → T72BVM 三阶升级
      const upN = countNeeding(u=>!u.upgrading && u.upgradeLvl<2);
      const ugN = countNeeding(u=>u.upgrading);
      if(ugN) mkAction('升级中 ×'+ugN,'none',false);
      if(upN) mkAction('升级 → 下一阶段 $'+T72_UPGRADE_COST[selected.find(u=>u.hp>0 && u.upgradeLvl<2 && !u.upgrading).upgradeLvl+1]+(upN>1?(' ×'+upN):''),'t72Upgrade',true);
      else if(!ugN) mkAction('已满级 '+T72_LEVELS[2].name,'none',false);
    }
    if(first.type==='t62'){
      // T62 → T64 → T64B → T64BM 四阶升级
      const upN = countNeeding(u=>!u.upgrading && u.upgradeLvl<3);
      const ugN = countNeeding(u=>u.upgrading);
      if(ugN) mkAction('升级中 ×'+ugN,'none',false);
      if(upN) mkAction('升级 → 下一阶段 $'+T62_UPGRADE_COST[selected.find(u=>u.hp>0 && u.upgradeLvl<3 && !u.upgrading).upgradeLvl+1]+(upN>1?(' ×'+upN):''),'t62Upgrade',true);
      else if(!ugN) mkAction('已满级 '+T62_LEVELS[3].name,'none',false);
    }
    if(first.type==='t80'){
      // T80 → T80B → T80U → T80BVM 四阶升级
      const upN = countNeeding(u=>!u.upgrading && u.upgradeLvl<3);
      const ugN = countNeeding(u=>u.upgrading);
      if(ugN) mkAction('升级中 ×'+ugN,'none',false);
      if(upN) mkAction('升级 → 下一阶段 $'+T80_UPGRADE_COST[selected.find(u=>u.hp>0 && u.upgradeLvl<3 && !u.upgrading).upgradeLvl+1]+(upN>1?(' ×'+upN):''),'t80Upgrade',true);
      else if(!ugN) mkAction('已满级 '+T80_LEVELS[3].name,'none',false);
    }
    if(first.type==='t90'){
      // T90 → T90M 单次升级
      const upN = countNeeding(u=>!u.upgrading && u.upgradeLvl<1);
      const ugN = countNeeding(u=>u.upgrading);
      if(ugN) mkAction('升级中 ×'+ugN,'none',false);
      if(upN) mkAction('升级 → T90M $'+T90_UPGRADE_COST[1]+(upN>1?(' ×'+upN):''),'t90Upgrade',true);
      else if(!ugN) mkAction('已升级 T90M','none',false);
    }
    if(first.type==='tank' && unitFactionOf(first.team)==='soviet'){
      // T54 双分支升级:二选一,互斥一次
      const upN = countNeeding(u=>!u.upgrading && !u.t54Branch);
      const ugN = countNeeding(u=>u.upgrading);
      if(ugN) mkAction('升级中 ×'+ugN,'none',false);
      if(upN){
        mkAction('升级 → T54B $'+T54_BRANCHES[1].cost+(upN>1?(' ×'+upN):''),'t54bUp',true);
        mkAction('升级 → T55AM $'+T54_BRANCHES[2].cost+(upN>1?(' ×'+upN):''),'t55amUp',true);
      } else if(!ugN) mkAction('已升级 '+t54Branch(first).name,'none',false);
    }
    if(first.type==='tank' && unitFactionOf(first.team)!=='soviet'){
      // M60A3 升级包:血量+270(至600) 射程+22 伤害+27 + 换 M60A3 外观
      const ugN = countNeeding(u=>u.m60a3Upgrading);
      if(ugN) mkAction('M60A3 升级包 安装中 ×'+ugN,'none',false);
      pkgAction(u=>!u.m60a3Upgrading && !u.m60a3, 'M60A3 升级包 $'+M60A3_COST, 'm60a3Up');
    }
    if(ATGM_TYPES.indexOf(first.type)!==-1){
      const ugN = countNeeding(u=>ATGM_TYPES.indexOf(u.type)!==-1 && u.atgmUpgrading);
      if(ugN) mkAction(atgmModuleName(first)+' 安装中 ×'+ugN,'none',false);
      pkgAction(u=>ATGM_TYPES.indexOf(u.type)!==-1 && !u.atgmUpgrading && !u.atgm, atgmModuleName(first)+' $'+ATGM_COST, 'atgmUp');
    }
    const apsReady = selected.some(u=>u.hp>0 && (u.type==='abrams' || (u.type==='t72' && u.upgradeLvl===2) || u.type==='merkava' || u.type==='abramsx' || u.type==='t14' || u.type==='bradley'));
    if(apsReady){
      const ugN = countNeeding(u=>isAPSUnit(u) && u.apsUpgrading && (u.type!=='t72' || u.upgradeLvl===2));
      if(ugN) mkAction('自主防御系统 安装中 ×'+ugN,'none',false);
      pkgAction(u=>isAPSUnit(u) && !u.apsUpgrading && !u.aps && (u.type!=='t72' || u.upgradeLvl===2), '自主防御系统 $'+apsCostFor(first), 'apsUp');
    }
    if(first.type==='abramsx'){
      // 弹簧刀无人机:1 发,释放后每 DRONE_RELOAD 秒填装
      if(countNeeding(u=>u.type==='abramsx' && u.droneAmmo>0)) mkAction('释放 弹簧刀无人机 (1/1)','releaseDrone',true);
      else mkAction('无人机 填装中 '+Math.ceil(first.droneReload)+'s','none',false);
    }
    // T80BVM / T90M:升级自带自主防御系统(无需安装,仅开关)
    const apsTarget = selected.find(u=>u.hp>0 && u.aps && ((u.type==='t80' && u.upgradeLvl===3) || (u.type==='t90' && u.upgradeLvl===1)));
    if(apsTarget){
      const hasAps = countNeeding(u=>u.aps && ((u.type==='t80' && u.upgradeLvl===3) || (u.type==='t90' && u.upgradeLvl===1)));
      if(hasAps) mkAction('自主防御系统:'+(apsTarget.apsOn?'开启':'关闭')+' (反导弹 '+apsTarget.apsAmmo+'/'+APS_MAX_AMMO+')','apsToggle',true);
    }
    if(first.type==='abrams'){
      // TUSK 升级包:300盾回15 + 换 M1A2TUSK 外观
      const ugN = countNeeding(u=>u.tuskUpgrading);
      if(ugN) mkAction('TUSK 升级包 安装中 ×'+ugN,'none',false);
      pkgAction(u=>!u.tuskUpgrading && !u.tusk, 'TUSK 升级包 $'+TUSK_COST, 'tuskUp');
      // 火炮升级包:+15 伤害 +15 射程
      const ug2 = countNeeding(u=>u.gunUpgrading);
      if(ug2) mkAction('火炮升级 安装中 ×'+ug2,'none',false);
      pkgAction(u=>!u.gunUpgrading && !u.gunUp, '火炮升级 $'+GUN_COST, 'gunUp');
    }
    if(isRarmUnit(first)){
      // 反应装甲模块(T84BM 300盾回10 / 布拉德利 150盾回5)
      const ugN = countNeeding(u=>isRarmUnit(u) && u.rarmUpgrading);
      if(ugN) mkAction('反应装甲 安装中 ×'+ugN,'none',false);
      pkgAction(u=>isRarmUnit(u) && !u.rarmUpgrading && !u.rarm, '反应装甲 $'+rarmCostFor(first), 'rarmUp');
    }
    if(first.type==='t84bm'){
      // 红外干扰装置(前方120°扇形干扰敌TOW),可开关
      const ugN = countNeeding(u=>u.irUpgrading);
      if(ugN) mkAction('红外干扰装置 安装中 ×'+ugN,'none',false);
      pkgAction(u=>!u.irUpgrading && !u.ir, '红外干扰装置 $'+IR_COST, 'irUp');
    }
    mkAction('选择全体同类','selectSameType',true);
    mkAction('全选作战单位','selectall',true);
    return;
  }
  // 无选择 -> 显示建造厂菜单
  title.textContent='— 无选择 —';
  desc.textContent='选择一个单位或建造厂查看菜单';
  const cmd=buildings.find(b=>b.team===TEAM_A&&b.defName==='command'&&b.alive);
  if(cmd){
    // 使用建造厂的实际可建列表(含实验室等新建筑),而非写死数组
    for(const dn of cmd.def.build) mk('',dn);
  }
}
function setSelling(on){
  selling=on;
  const btn=document.getElementById('sellBtn');
  if(btn){ btn.classList.toggle('active', on); btn.textContent = on ? '出售中 (Esc 取消)' : '出售'; }
  if(on && placing){ placing=null; }
  updatePanel();
}
