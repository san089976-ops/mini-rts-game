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
  h+=statRow('伤害', d.damage>0? d.damage+' · '+PROJ_NAME[d.proj] : '—');
  h+=statRow('射程', d.range>0? d.range : '—');
  h+=statRow('攻速', d.rof>0? d.rof.toFixed(2)+' 秒/发' : '—');
  h+=statRow('移速', d.speed);
  h+=statRow('造价', '$'+d.cost);
  h+=statRow('护甲', ARMOR_NAME[u.armor]||'—');
  if(u.shield>0) h+=statRow('护盾', Math.ceil(u.shield)+' (回'+REACTIVE_REGEN+'/秒)');
  if(u.type==='harvester') h+=statRow('内含矿', Math.floor(u.cargo)+' / '+d.capacity);
  if(isCarrier(u)) h+=statRow('运载', usedCapacity(u)+' / '+u.capacity+' 点'+(u.def.carrier?'(可装步兵)':''));
  if(!isCarrier(u) && !u.naval && transportCost(u)>0) h+=statRow('占点', transportCost(u)+' 点');
  if(u.type==='challenger') h+=statRow('等级', u.upgrading ? ('升级中 '+Math.floor(u.upgradeProg/CHALL_UPGRADE_TIME*100)+'%') : (u.upgradeLvl>0 ? (u.upgradeLvl+' 级 · '+CHALL_NAMES[u.upgradeLvl]) : '未升级(可升级)'));
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
function updatePanel(){
  updateStats();
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
        for(const t of selBuilding.def.train) mkUnit(t);
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
              ? ['abrams','bradley','marder','leclerc','leopard','challenger','mcv']
              : ['t90','b11','mcv'];
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
    if(isCarrier(first) && first.cargoUnits && first.cargoUnits.length) mkAction('释放部队 ('+first.cargoUnits.length+')','unload',true);
    if(first.type==='challenger'){
      if(first.upgrading) mkAction('升级中 '+Math.floor(first.upgradeProg/CHALL_UPGRADE_TIME*100)+'%','none',false);
      else if(first.upgradeLvl<2) mkAction('升级 → '+CHALL_NAMES[first.upgradeLvl+1]+' $'+CHALL_UPGRADE_COST,'challUpgrade',true);
      else mkAction('已满级 '+CHALL_NAMES[2],'none',false);
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
