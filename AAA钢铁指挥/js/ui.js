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
// 面板/介绍栏图标键:坦克按阵营(M60/T54),艾布拉姆用面板专属图,工厂用面板专属图(战场贴图不受影响)
function unitPanelKey(type, faction){
  if(type==='tank') return faction==='soviet' ? 'tank_soviet' : 'tank_allies';
  if(type==='abrams') return 'abrams_panel';
  if(type==='t90') return 't90_panel';
  return type;
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
  h+=statRow('造价', '$'+d.cost);
  h+=statRow('护甲', ARMOR_NAME[u.armor]||'—');
  if(u.shield>0){
    const regen = u.type==='t90' ? REACTIVE_REGEN : (u.rarm ? T84BM_SHIELD_REGEN : 0);
    h+=statRow('护盾', Math.ceil(u.shield)+' (回'+(regen>0?regen+'/秒':' —')+')');
  }
  if(u.fly){
    h+=statRow('盘旋', '半径 '+PLANE_PATROL_R+' px 绕点绕圈');
    if(u.aa) h+=statRow(airAAName(u), u.aaAmmo+' / '+AA_AMMO+' 发 · 空对空'+(u.aaCd>0?(' · 冷却 '+u.aaCd.toFixed(1)+'s'):''));
    if(u.ag) h+=statRow(airAGName(u), u.agAmmo+' / '+AG_AMMO+' 发 · 空对地'+(u.agCd>0?(' · 冷却 '+u.agCd.toFixed(1)+'s'):''));
    if(u.radar) h+=statRow('雷达火控', '射程+'+RADAR_RANGE_BONUS+' · 1号:'+AIR_MODE_NAME[u.modeAA]+' / 2号:'+AIR_MODE_NAME[u.modeAG]);
    if(u.coat) h+=statRow('涂层更新', '敌方探测 -'+COAT_RANGE_PENALTY+'px');
  }
  if(u.type==='harvester') h+=statRow('内含矿', Math.floor(u.cargo)+' / '+d.capacity);
  if(isCarrier(u)) h+=statRow('运载', usedCapacity(u)+' / '+u.capacity+' 点'+(u.def.carrier?'(可装步兵)':''));
  if(!isCarrier(u) && !u.naval && transportCost(u)>0) h+=statRow('占点', transportCost(u)+' 点');
  if(u.type==='challenger') h+=statRow('等级', u.upgrading ? ('升级中 '+Math.floor(u.upgradeProg/CHALL_UPGRADE_TIME*100)+'%') : (u.upgradeLvl>0 ? (u.upgradeLvl+' 级 · '+CHALL_NAMES[u.upgradeLvl]) : '未升级(可升级)'));
  if(u.atgm || u.atgmUpgrading){
    h+=statRow(atgmTypeName(u), u.atgmUpgrading ? ('安装中 '+Math.floor(u.atgmProg/ATGM_UPGRADE_TIME*100)+'%') :
      (u.atgm ? ('射程'+ATGM_RANGE+' · 伤害'+ATGM_DAMAGE+(u.atgmReload>0?(' · 装填 '+Math.ceil(u.atgmReload)+'s'):' · 已就绪')) : ''));
  }
  if(u.aps || u.apsUpgrading){
    h+=statRow('自主防御', u.apsUpgrading ? ('安装中 '+Math.floor(u.apsProg/APS_UPGRADE_TIME*100)+'%') :
      (u.aps ? (u.apsOn?'开启':'关闭')+' · 反导弹 '+u.apsAmmo+'/'+APS_MAX_AMMO+(u.apsAmmo<APS_MAX_AMMO?(' · 填充 '+Math.ceil(u.apsReload)+'s'):'')+' · 只反TOW' : ''));
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
  h+=statRow('造价', '$'+d.cost);
  h+=statRow('护甲', ARMOR_NAME[b.armor]||'—');
  h+=statRow('电力', d.power>0? '+'+d.power : (b.powerUse>0? '-'+b.powerUse : '0'));
  h+=statRow('建造时间', d.buildTime.toFixed(1)+' 秒');
  if(b.constructing) h+=statRow('状态', '建造中 '+Math.floor(b.progress/d.buildTime*100)+'%');
  if(b.defName==='power' && b.powerLevel>0) h+=statRow('等级','Lv'+b.powerLevel+' (电力 +'+b.powerLevel*POWER_UPGRADE_GAIN+', 收入 +'+b.powerLevel*POWER_UPGRADE_INCOME+'/秒)');
  if(b.defName==='power' && b.pwrUpgrading) h+=statRow('升级', Math.floor(b.pwrUpgradeProg/POWER_UPGRADE_TIME*100)+'%');
  if(b.upgraded) h+=statRow('升级','已升级');
  if(b.upgrading){
    const uTime = b.defName==='command' ? COMMAND_UPGRADE_TIME : (b.defName==='barracks' ? BARRAX_UPGRADE_TIME : FACTORY_UPGRADE_TIME);
    h+=statRow('升级', Math.floor(b.upgradeProg/uTime*100)+'%');
  }
  if(b.queue.length) h+=statRow('生产', b.queue.map(q=>getUnitDefs(unitFactionOf(b.team))[q.type].name).join('、'));
  if(b.defName==='airfield'){
    let parked=0, flying=0;
    for(const u of units) if(u.hp>0 && u.fly && u.homeBase===b){ if(u.parked) parked++; else flying++; }
    h+=statRow('停机位', parked+' / '+AIRFIELD_CAPACITY+' (出击 '+flying+(b.queue.length?(' · 生产中 '+b.queue.length):'')+')');
  }
  if(b.garrison && (b.garrison.length || b.garrisonTank)) h+=statRow('进驻', garrisonUnitCount(b)+' 个单位 · 射程+20');
  h+='<div class="udesc">'+(UNIT_DESC['b_'+b.defName]||'')+'</div>';
  return h;
}
function updateStats(){
  const moneyEl=document.getElementById('money');
  moneyEl.textContent=Math.floor(credits[TEAM_A]);
  const p=powerOf(TEAM_A);
  document.getElementById('power').textContent=p.give;
  document.getElementById('powerUse').textContent=p.use;
  document.getElementById('powerBadge').style.display = (p.give>0 && p.use>p.give) ? 'block' : 'none';
  powerInfo=p;
}
// 右侧机场飞机面板:仅选中己方机场时显示,列出该机场绑定的战斗机(停驻/出击都列),
// 可在不释放的情况下远程升级(测试炸弹包)
function updateAirPanel(){
  const p=document.getElementById('airPanel');
  if(!p) return;
  const show = selBuilding && selBuilding.alive && selBuilding.team===TEAM_A && selBuilding.defName==='airfield';
  if(!show){ p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  const b=selBuilding;
  let parked=0, flying=0;
  const bound=[];
  for(const u of units){
    if(u.hp<=0 || !u.fly || u.homeBase!==b) continue;
    if(u.parked) parked++; else flying++;
    bound.push(u);
  }
  document.getElementById('airPanelTitle').textContent = '机场部队 · 停驻 '+parked+'/'+AIRFIELD_CAPACITY+' (出击 '+flying+')';
  const list=document.getElementById('airPanelList');
  list.innerHTML='';
  // ---- 出击规划区:号位按建造顺序(uid)排,阵亡自动重排;本阶段仅 停驻+雷达 的 F16 可选 ----
  const slots = bound.slice().sort((a,b)=>a.uid-b.uid);
  for(const uid of Array.from(airSortieSel)){
    const u = slots.find(x=>x.uid===uid);
    if(!u || u.hp<=0 || !u.parked || !u.radar || !isPlannablePlane(u)) airSortieSel.delete(uid);
  }
  const plan=document.createElement('div');
  plan.className='airPlan';
  let sh='<div class="airPlanTitle">出击规划</div><div class="airSlots">';
  const slotN = Math.max(4, slots.length);
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
        '<div class="airPlanState">勾选停驻且已装雷达的 F16/苏35 号位 ('+(selCnt?('已选 '+selCnt+' 架'):'未选')+')</div>';
  } else if(planeMission.mode==='precision'){
    sh+='<div class="airPlanState">精确打击待命:右键敌方目标锁定 ('+selCnt+' 架,全部倾泻后返场)</div>'+
        '<div class="airPlanBtns"><button class="airbtn" onclick="airCancelMission()">取消</button></div>';
  } else {
    sh+='<div class="airPlanState">剩余 对空:'+planeMission.remaining.aa+' / 对地:'+planeMission.remaining.ag+' · 已分配 '+planeMission.assignments.length+' 发</div>'+
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
      if(upgrading) return '<div class="airbtn disabled">'+label+' 安装中 '+Math.floor(u[installed==='aa'?'aaProg':installed==='ag'?'agProg':installed==='radar'?'radarProg':'coatProg']/progTime*100)+'%</div>';
      if(u[installed]) return '<div class="airbtn disabled">'+label+' 已装</div>';
      return '<button class="airbtn" onclick="airPlaneUpgrade('+uid+',\''+installed+'\')">'+label+' $'+(installed==='aa'?AA_COST:installed==='ag'?AG_COST:installed==='radar'?RADAR_COST:COAT_COST)+'</button>';
    };
    let btnHTML = mkBtn(airAAName(u), u.aaUpgrading, AA_UPGRADE_TIME, 'aa', u.uid)
      + mkBtn(airAGName(u), u.agUpgrading, AG_UPGRADE_TIME, 'ag', u.uid)
      + mkBtn('雷达', u.radarUpgrading, RADAR_UPGRADE_TIME, 'radar', u.uid)
      + mkBtn('涂层', u.coatUpgrading, COAT_UPGRADE_TIME, 'coat', u.uid);
    // 攻击模式按钮(需已装雷达 + 对应导弹包):点击循环 手动→自动分配→倾泻
    if(u.radar){
      if(u.aa) btnHTML += '<button class="airbtn" onclick="airPlaneMode('+u.uid+',\'aa\')">1号 '+airAAName(u)+': '+AIR_MODE_NAME[u.modeAA]+'</button>';
      if(u.ag) btnHTML += '<button class="airbtn" onclick="airPlaneMode('+u.uid+',\'ag\')">2号 '+airAGName(u)+': '+AIR_MODE_NAME[u.modeAG]+'</button>';
    }
    row.innerHTML =
      '<div class="airName">'+u.def.name+' <span class="airTag">'+(u.parked?'[停驻]':'[出击中]')+'</span></div>'+
      '<div class="airStat">生命 '+Math.ceil(u.hp)+'/'+u.maxHp+' · 移速 '+u.speed+
        (u.aa?(' · '+airAAName(u)+' '+u.aaAmmo+'/'+AA_AMMO):'')+
        (u.ag?(' · '+airAGName(u)+' '+u.agAmmo+'/'+AG_AMMO):'')+'</div>'+
      '<div class="airhp"><i style="width:'+hpPct+'%"></i></div>'+
      btnHTML;
    list.appendChild(row);
  }
}
// 右侧机场面板:给指定 uid 的飞机安装对应模块(无需释放即可升级)
function airPlaneUpgrade(uid, which){
  const u = units.find(x=>x.uid===uid);
  if(!u || !u.fly || !u.homeBase || u.homeBase!==selBuilding) return;
  if(which==='aa' && !u.aaUpgrading && !u.aa) startAAUpgrade(u);
  else if(which==='ag' && !u.agUpgrading && !u.ag) startAGUpgrade(u);
  else if(which==='radar' && !u.radarUpgrading && !u.radar) startRadarUpgrade(u);
  else if(which==='coat' && !u.coatUpgrading && !u.coat) startCoatUpgrade(u);
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
  let remaining = { aa:0, ag:0 };
  for(const u of units){
    if(uids.includes(u.uid) && u.fly && u.parked && u.hp>0 && u.radar){
      remaining.aa += u.aaAmmo; remaining.ag += u.agAmmo;
    }
  }
  planeMission = { mode:'distributed', uids, remaining, assignments:[] };
  updatePanel();
}
function airConfirmDistributed(){
  if(!planeMission || planeMission.mode!=='distributed') return;
  if(!planeMission.assignments.length){
    if(selBuilding) textPopup(selBuilding.x, selBuilding.y-24, '未分配任何导弹,无法出动','#ff8080');
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
    const ic = imgs[k] ? ('style="background-image:url(\''+IMAGES[k]+'\')"') : '';
    b.innerHTML='<div class="icon" '+ic+'>'+(imgs[k]?'':d.name[0])+'</div><div class="bname">'+d.name+'</div><div class="cost">$'+d.cost+'</div>'+(extra||'')+'<span class="num">'+btnIdx+'</span>';
    panel.appendChild(b);
  };
  const mkUnit=(defName)=>{
    btnIdx++;
    const d=getUnitDefs(playerFaction)[defName];
    const cnt=units.filter(u=>u.team===TEAM_A&&u.type===defName).length;
    const b=document.createElement('div');
    b.className='btn';
    b.dataset.action='train'; b.dataset.def=defName;
    const k=unitPanelKey(defName, playerFaction);
    const ic = imgs[k] ? ('style="background-image:url(\''+IMAGES[k]+'\')"') : '';
    b.innerHTML='<div class="icon" '+ic+'>'+(imgs[k]?'':d.name[0])+'</div><div class="bname">'+d.name+'</div><div class="cost">$'+d.cost+'</div><span class="cnt">x'+cnt+'</span><span class="num">'+btnIdx+'</span>';
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
            mkAction('升级 建造厂 $'+COMMAND_UPGRADE_COST,'cmdUp',true);
          }
        }
      } else if(selBuilding.def.train && selBuilding.def.train.length){
        if(selBuilding.queue.length) mkAction('生产中...','none',false);
        // 阵营专属单位(如战斗机)只显示本阵营可生产的
        for(const t of selBuilding.def.train){ if(getUnitDefs(playerFaction)[t]) mkUnit(t); }
        // 取消制造:只取消队列末尾的一个单位,全额退款
        if(selBuilding.queue.length){
          const fac=unitFactionOf(selBuilding.team);
          const last=selBuilding.queue[selBuilding.queue.length-1];
          const d=getUnitDefs(fac)[last.type];
          mkAction('取消「'+(d?d.name:last.type)+'」 退款 $'+(d?d.cost:0),'cancelprod',true);
        }
        // 战车工厂:升级 / 高级坦克
        if(selBuilding.defName==='factory'){
          if(selBuilding.upgraded){
            const facUnits = unitFactionOf(TEAM_A)==='allies'
              ? ['abrams','bradley','marder','leclerc','leopard','challenger','puma','mcv']
              : ['t90','t84bm','b11','mcv'];
            for(const t of facUnits) mkUnit(t);
          }
          else if(selBuilding.upgrading){ mkAction('升级中...','none',false); }
          else { mkAction('升级 战车工厂 $'+FACTORY_UPGRADE_COST,'upgrade',true); }
        }
        // 兵营:升级 / 高级步兵
        if(selBuilding.defName==='barracks'){
          if(selBuilding.upgraded){ mkUnit(advancedInfantryType(TEAM_A)); }
          else if(selBuilding.upgrading){ mkAction('升级中...','none',false); }
          else { mkAction('升级 兵营 $'+BARRAX_UPGRADE_COST,'barrackUp',true); }
        }
        // 机场:释放停驻的战斗机
        if(selBuilding.defName==='airfield'){
          let parked=0;
          for(const u of units) if(u.hp>0 && u.fly && u.parked && u.homeBase===selBuilding) parked++;
          if(parked) mkAction('释放战斗机 ('+parked+' 架)','releaseAir',true);
        }
      } else {
        if(selBuilding.defName==='power' && selBuilding.pwrUpgrading){
          mkAction('升级中...','none',false);
        } else if(selBuilding.defName==='power' && selBuilding.powerLevel<POWER_MAX_LEVEL){
          mkAction('升级发电厂 $'+POWER_UPGRADE_COST,'pwrUp',true);
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
    if(first.type==='f16' || first.type==='su35'){
      // 空对空导弹包(A-120c=F16 / R-37m=苏35)
      if(first.aaUpgrading) mkAction(airAAName(first)+' 空对空导弹包 安装中 '+Math.floor(first.aaProg/AA_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.aa) mkAction(airAAName(first)+' 空对空导弹包 $'+AA_COST,'aaUp',true);
      else mkAction(airAAName(first)+': '+first.aaAmmo+'/'+AA_AMMO+' 发(空对空)','none',false);
      // 空对地导弹包(A-174b=F16 / Kh-29=苏35)
      if(first.agUpgrading) mkAction(airAGName(first)+' 空对地导弹包 安装中 '+Math.floor(first.agProg/AG_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.ag) mkAction(airAGName(first)+' 空对地导弹包 $'+AG_COST,'agUp',true);
      else mkAction(airAGName(first)+': '+first.agAmmo+'/'+AG_AMMO+' 发(空对地)','none',false);
      // 雷达火控(射程+30,解锁攻击模式按键)
      if(first.radarUpgrading) mkAction('雷达火控 安装中 '+Math.floor(first.radarProg/RADAR_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.radar) mkAction('雷达火控 $'+RADAR_COST,'radarUp',true);
      else {
        mkAction('雷达火控:导弹射程+'+RADAR_RANGE_BONUS,'none',false);
        if(first.aa) mkAction('1号位 '+airAAName(first)+': '+AIR_MODE_NAME[first.modeAA],'modeAA',true);
        if(first.ag) mkAction('2号位 '+airAGName(first)+': '+AIR_MODE_NAME[first.modeAG],'modeAG',true);
      }
      // 涂层更新(敌方雷达式探测-50px)
      if(first.coatUpgrading) mkAction('涂层更新 安装中 '+Math.floor(first.coatProg/COAT_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.coat) mkAction('涂层更新 $'+COAT_COST,'coatUp',true);
      else mkAction('涂层更新:敌方探测 -'+COAT_RANGE_PENALTY+'px','none',false);
    }
    if(isCarrier(first) && first.cargoUnits && first.cargoUnits.length) mkAction('释放部队 ('+first.cargoUnits.length+')','unload',true);
    if(first.type==='challenger'){
      if(first.upgrading) mkAction('升级中 '+Math.floor(first.upgradeProg/CHALL_UPGRADE_TIME*100)+'%','none',false);
      else if(first.upgradeLvl<2) mkAction('升级 → '+CHALL_NAMES[first.upgradeLvl+1]+' $'+CHALL_UPGRADE_COST,'challUpgrade',true);
      else mkAction('已满级 '+CHALL_NAMES[2],'none',false);
    }
    if(ATGM_TYPES.indexOf(first.type)!==-1){
      if(first.atgmUpgrading) mkAction(atgmModuleName(first)+' 安装中 '+Math.floor(first.atgmProg/ATGM_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.atgm) mkAction(atgmModuleName(first)+' $'+ATGM_COST,'atgmUp',true);
    }
    if(first.type==='abrams'){
      if(first.apsUpgrading) mkAction('自主防御系统 安装中 '+Math.floor(first.apsProg/APS_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.aps) mkAction('自主防御系统 $'+APS_COST,'apsUp',true);
      else mkAction('自主防御系统:'+(first.apsOn?'开启':'关闭')+' (反导弹 '+first.apsAmmo+'/'+APS_MAX_AMMO+')','apsToggle',true);
    }
    if(first.type==='t84bm'){
      // 反应装甲模块(300盾/回10)
      if(first.rarmUpgrading) mkAction('反应装甲 安装中 '+Math.floor(first.rarmProg/RARM_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.rarm) mkAction('反应装甲 $'+RARM_COST,'rarmUp',true);
      else mkAction('反应装甲:盾 '+Math.ceil(first.shield)+'/'+T84BM_SHIELD+' (回'+T84BM_SHIELD_REGEN+'/秒)','none',false);
      // 红外干扰装置(前方120°扇形干扰敌TOW),可开关
      if(first.irUpgrading) mkAction('红外干扰装置 安装中 '+Math.floor(first.irProg/IR_UPGRADE_TIME*100)+'%','none',false);
      else if(!first.ir) mkAction('红外干扰装置 $'+IR_COST,'irUp',true);
      else mkAction('红外干扰装置:'+(first.irOn?'开启':'关闭'),'irToggle',true);
    }
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
