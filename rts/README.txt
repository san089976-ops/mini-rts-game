================================================================
迷你红警 —— 项目说明（供后续 AI 快速上手）
================================================================

【一句话概述】
纯 HTML+Canvas+原生 JS 实现的即时战略小游戏（仿红警），单页应用，
无构建工具、无依赖、无后端，直接用浏览器打开 index.html 即可运行。

【目录结构】
  index.html            页面入口：两个 canvas(主画面/小地图)、HUD、菜单/帮助/暂停/结束覆盖层
  css/style.css         全部样式
  js/*.js               游戏逻辑（严格按 index.html 里 <script> 的顺序加载）
  img/*.png             建筑素材
  img/units/*.png       单位素材（含坦克照片贴图）
  tools/process-sprite.js  单位照片素材预处理脚本（去背景/裁切/居中）
  img/units/README.txt  素材替换说明

【JS 加载顺序（勿乱，存在函数/变量依赖）】
  config.js   常量、护甲/弹丸克制、单位/建筑/科技定义、贴图映射、RENDER_SCALE、SPRITE_ROT
  state.js    全局状态变量与工具函数（canvas、cam、credits、units/buildings 数组等）
  maps.js     地图预设 MAPS、出生点 SPAWN_POINTS、getSpawns()
  entities.js Unit / Building / Projectile / Effect 类
  map.js      genTerrain() 地形生成、genNavalTerrain() 海战图、通行性(unitPassable/uCellBlocked)
  path.js     寻路 BFS：findPath(陆地) / findPathFor(单位) / pathFor() 自动分流
              + smoothPath() 路径拉直:把 BFS 逐格直角阶梯塌缩成直线段(lineClear 做
                Bresenham 采样 + 对角防穿墙角检查),让所有单位像运输艇一样直线滑行
  build.js    建造/生产/升级/出售/科技研究
  orders.js   右键指令(移动/攻击/装卸/集结点)、选择、编队、鼠标世界坐标
  ai.js       电脑对手逻辑
  ui.js       底部 HUD 面板（选中信息、建造/生产按钮）
  input.js    键盘/鼠标输入（QWERTYUI 快捷键、编队、框选、小地图）
  update.js   每帧更新：战斗、寻路、生产、装卸、胜负判定
  render.js   渲染：地形、建筑、单位、弹丸、特效、小地图、坦克照片贴图
  menu.js     主菜单（地图卡片/队伍/资金/分组/颜色/出生点）
  music.js    背景音乐(4 首 mp3 循环)、开关/持久化、设置弹层入口
  game.js     主循环 frame()、resize()、setupGame()、启动入口

【核心常量与数据结构】
  坐标系：世界 1 单位 = 1 逻辑像素；TILE=32；地图默认 64x48 格（可动态放大）。
  MAP_W/MAP_H/W/H 是 let，由 setMapSize() 按地图设置；逻辑视口用 viewW()/viewH()。
  格子数组（二维，[x][y]）：
    terrain[x][y]   = 'grass' | 'tree' | 'water'
    blocked[x][y]   = true 表示陆地单位不可通行（水/树/建筑占格）
    structBlocked[x][y] = true 仅建筑占格（用于海军/两栖寻路区分"建筑"与"水域"）
  teams：gameTeams[{name,faction,group,ai,spawn}]；teamGroups 决定同盟/敌对；
    teamCol() 蓝=友方阵营、红=敌方阵营；teamColor() 是队伍角标色（9色，不影响蓝/红）。
  阵营：teamFactions[team] = 'allies'|'soviet'；单位外形由各自阵营决定。

【单位/建筑/护甲系统】
  单位定义在 getUnitDefs(faction)（按阵营返回），建筑在 BLD_DEFS。
  弹丸类型：cannon火炮 / bullet子弹 / machinegun机炮。
  护甲类型：cloth布甲/steel钢甲/castiron铸铁甲/titanium钛合金甲/concrete混凝土/wood木甲。

【菜单流程(模式选择页 + 遭遇战设置)】
  初始页面 #landing:遭遇战 / 任务模式 / 挑战模式(后两者"敬请期待"),帮助/设置按钮也在此页。
  点「遭遇战」进入原主菜单 #menu(地图/队伍/资金/出生点),与电脑对战。
  game.js showMenu() 从结算页返回的是 #landing(先隐藏 menu 再显示 landing)。

【电脑难度系统(每台电脑独立)】
  gameTeams[t].diff = 'easy' 简单 / 'medium' 中等 / 'brutal' 残酷,主菜单队伍行的「难度」下拉设置。
  影响(见 ai.js initAI / updateAI):
   - 经济收入倍率:简单1.0 / 中等1.6 / 残酷2.3
   - 中等·残酷:建造计划加实验室(lab),自动研发科技(优先 矿石精炼→高级炮台→阵营专属),
     并补第三座发电厂保证实验室 100 电
   - 残酷:队列深度3、训练目标更多、兵力≥2 即进攻、进攻间隔更短(18~26s)
   - 简单:完全保持原版 AI 行为
  把电脑分组设为 组A(同盟) 即作为玩家盟友,其难度设置依然生效(如"中等电脑盟友")。

【背景音乐与设置】
  js/music.js:4 首 mp3(MUSIC_FILES,与 index.html 同目录)按序循环播放——单 Audio 元素,
    'ended' 时切下一首取模循环。musicOn 持久化在 localStorage['ra_music'];
    toggleMusic()/setMusic()/playMusic() 控制;首次 pointerdown 自动开播(绕过自动播放限制)。
  入口:主菜单左上角「设置」+ 暂停页「设置」-> #settingsOv 弹层(openSettings/closeSettings,
    updateMusicUI() 刷新所有 [data-music-toggle] 按钮文本)。

  伤害 = 弹丸伤害 × ARMOR_MOD[护甲][弹丸]；磁暴步兵对布甲 150%。
  科技：RESEARCH_DEFS（发电改进/矿石精炼/高级炮台/贫铀/反应装甲）。
  反应装甲(T90):护盾 300,每秒恢复 15,被打破后也能从 0 重新生成(updateUnit 中
    shield<REACTIVE_SHIELD 即恢复,上限 REACTIVE_SHIELD),另有一次免死 survivedOnce。
   兵营升级解锁 exo(盟军)/magnet(苏军)；战车工厂升级解锁 abrams(盟军)/t90(苏军)、mcv。

【碰撞系统（方框 + 刚性,重点）】
  Unit 有碰撞箱半宽/半高 hw/hh(见 config.js 的 UNIT_BOX,缺省 = r*0.85),不再是圆圈。
  组成:
   - separateAll():对非敌对单位按"箱体重叠的最小穿透轴"计算分离速度(软,防挤压)。
   - resolveRigid():每帧位置修正,把重叠方框沿最小穿透轴互相推开(6轮迭代/每轮重建网格);
     移动中的单位优先挤开挡路的空闲单位(wu=0.2/0.8),完全重合时随机抖动,避免刚性死锁。
   - 本地脱困:applyMovement 里卡住(stuckT>0.5s)时尝试左右/后小步(8px)找不重叠空位。
  movement 用 arriveDist 判定到达;formationTargets 队形间距按 hw+hh+4 自适应,
    否则队形比碰撞箱小会互相顶死。敌人也参与刚性推开(交战时允许少量瞬时重叠)。
  选择圈:drawSel 不再画选中单位圆圈;改为选中移动中的陆地单位显示"单位→目标点"的
    虚线 + 准星目标标记(仅非 naval 单位)。


【海军系统（近期新增，重点）】
  船坞 dock：2x2、600金、720血、木甲，只能整块建在水上（canPlaceAt 强制 terrain==='water'），
    快捷键 I，生产驱逐舰 destroyer / 运输艇 transport。
  驱逐舰：naval=true，只能在水中航行；火炮 90 伤/射程118/攻速1.2/移速56。
  运输艇：amphib=true，陆海通行；小机枪(子弹10伤/攻速0.6)；capacity=12 运载点。
  通行性：
    unitPassable(u,cx,cy)：structBlocked 挡一切；树挡一切；水只有 naval/amphib 能过；驱逐舰不能上岸。
    pathFor(u,...) 自动为 naval/amphib 走 findPathFor，其余走 findPath。
  spawnUnitNear 会按单位类型选择出生格：驱逐舰出生在水格、运输艇水/陆皆可。
  生产队列与普通单位一致：选中船坞点生产按钮，"哪里点建造哪里出"。

【运输艇运载系统】
  cargoUnits[] 存放已装载单位对象；usedCapacity(t) = sum(transportCost(c))。
  transportCost(u)：步兵1 / exo·magnet2 / 矿车·灰熊3 / 犀牛(soviet tank)4 / 基地车·abrams·t90 6；海军不可上船。
  装载：选中地面单位右键点己方运输艇 -> 走"load"指令 -> 靠近自动上船(doBoard)。
  卸载：手动释放——选中运输艇右键地面=仅移动(不自动卸载);到位后选中运输艇点
    「释放部队」按钮 -> manualUnload() 在艇当前位置 unloadTransport() 生成单位。
  渲染：运输艇下方显示 "已用/12"；选中信息面板显示运载量。
  注意：Unit 构造器里 this.cargo=0 是矿车用的(矿石量)，运输艇的运载用 cargoUnits，
    二者不可混用（历史 bug：曾被覆盖导致 crash）。

【地图系统与"海上争霸"】
  每个 MAPS 条目可有 width/height/custom/spawns/islands 字段。
  setMapSize(w,h) 会同步更新 W/H/GRID_COLS/cam.maxX/maxY，切换地图后自动复位。
  海战图 naval：id='海上争霸'，80x56（比默认大），四岛(约20,15 / 60,15 / 20,41 / 60,41)环海，
    出生点按队伍数落在岛上，矿放在岛上。genNavalTerrain() 生成。
  AI 只在 naval 图上建船坞+出驱逐舰（isNaval 判定），普通图不建船坞。

【单位照片贴图（艾布拉姆 / T90）】
  这两辆坦克用玩家提供的照片作为战场本体贴图，不读像素、直接 drawImage：
    drawUnitImg() 按 SPRITE_ROT[u.type] 旋转对齐炮口到朝向前方，再 drawImage。
  预处理(去背景/裁切/居中)在 tools/process-sprite.js 完成，输出到 img/units/。
  背景识别：洪泛填充"与图片边缘相连"的纯黑或纯白区域，绝不删坦克内部内容
    （历史教训：按亮度阈值会误删深色履带导致"缺肉"）。
  SPRITE_ROT：炮管朝左的两张图转角均为 Math.PI；开火炮口闪光画在贴图左侧(-dw/2)。
  替换素材流程：把新照片放 img/units/，用 process-sprite.js 处理，确认 SPRITE_ROT。

【建筑照片贴图（建造厂 / 战车工厂 / 发电站等级 / 兵营 / 精炼厂 / 实验室）】
  各建筑可用玩家照片做战场本体;发电站按等级分 3 张贴图;兵营/精炼厂用独立战场贴图。
  process-sprite.js 支持输出目录参数(默认 img/units)，例：
    node tools/process-sprite.js "建造厂.png" command img 512
    node tools/process-sprite.js "发电站1.png" power_0 img 512   (等级0/1/2 → power_0/1/2)
    node tools/process-sprite.js "兵营.png" barracks_field img 512
    node tools/process-sprite.js "矿石精炼厂.png" refinery_field img 512
    node tools/process-sprite.js "实验室.png" lab_field img 512
    node tools/process-sprite.js "碉堡.png" turret_field img 256
    node tools/process-sprite.js "船坞.png" dock_field img 256
  碉堡贴图下仍绘制旋转机枪(贴图中心,朝 turretTarget 转动,发射原有 machinegun,
    开火闪光),程序化底座/沙袋仅在无贴图时画;船坞贴图替换 drawDockBody。
  单位照片贴图:采矿车战场本体用 harvester_field(处理时旋转参数把车头摆正朝上,
    node tools/process-sprite.js "采矿车.png" harvester_field img 512 90,
    游戏里 SPRITE_ROT.harvester=Math.PI/2 对齐朝向前方,SPRITE_SCALE.harvester=0.7 缩小,
    drawHarvesterWheels() 在照片四角叠加旋转辐条轮子动画,做出轮子滚动感);
    驱逐舰 destroyer_field / 登陆艇 transport_field 照片本来就"车头朝上",
    SPRITE_ROT=Math.PI/2,SPRITE_SCALE.destroyer=1.4(放大);SPRITE_FRONT 记录各照片
    炮口/车头方向(驱逐舰/登陆艇/矿车/坦克为向上),用于开火闪光位置。
    灰熊(盟军)/犀牛(苏军)坦克按阵营用 tank_allies_field/tank_soviet_field:
    node tools/process-sprite.js "灰熊坦克.png" tank_allies_field img 512 180 (灰熊旋转180°)
    node tools/process-sprite.js "犀牛坦克.png" tank_soviet_field img 512 (犀牛不转)
    两者照片车头均朝上,SPRITE_ROT.tank=Math.PI/2。
  碰撞:全部单位(含驱逐舰/登陆艇)共用方框刚性碰撞(hw/hh),水上正常推开;
  驱逐舰/登陆艇移动时也显示"单位→目标点"虚线+准星(不再排除 naval)。
    面板图标仍用 img/units/*.png,选择采矿车时详细栏显示"内含矿 cargo/capacity"。
  命名约定:战场贴图 key 与建造栏图标分离——
    power0/1/2 对应用 power(power.png 图标);barracks_field/refinery_field 对应
    barracks/refinery(png 图标);lab_field 对应 lab(无图标)。替换战场贴图不会改动图标。
  render.js drawBuilding()：imgs[defName] 存在即叠图(contain 不拉伸、建造中半透明)，
    发电站按 b.powerLevel 选 power_{0,1,2},兵营/精炼厂按 defName 选 *_field;
    保留队色边框/名字/血条/建造动画/队列/角标;图片缺失自动回退程序化绘制。

【草地照片地形】
  img/terrain/grass_00~15.png 由 tools/split-terrain.js 把"草地.png"切成 4x4=16 块(128px)。
  render.js drawTerrain() 草地格随机取一块平铺(按 (x*7+y*13+tileVariation)%16 固定每格)，
    加载失败回退程序化草地。切新地形：
    node tools/split-terrain.js "草地.png" grass 4 4 128

【水域照片地形】
  img/terrain/water_00~03.png 由 tools/split-terrain.js 把"水域.png"切成 2x2=4 块(128px)。
  render.js drawTerrain() 水域格随机取一块平铺(按 (x*11+y*7+tileVariation)%4 固定每格)，
    直接显示照片水纹,不再叠加程序化波光。切新水域：
    node tools/split-terrain.js "水域.png" water 2 2 128

【金矿系统（单格,采完即消失）】
  金矿 = 单个格子上的矿,ORE_PER_TILE=5000,采空后贴图消失、格子恢复普通地面。
  数据:oreFields 每项 {x,y,tx,ty,amount,max};oreGrid[tx][ty]=true 表示该格有金矿
    (禁建建筑——canPlaceAt/canDeployAt 会拒绝,但单位仍可通行,不进 blocked)。
  生成:以"金矿堆"形式——addGoldCluster() 以簇心为中心贴9宫格/就近随机聚 3 格成一撮;
    陆地地图簇心须离所有出生点 >= MIN_ORE_DIST+3(14+3)格,保证堆内每格都不贴脸基地;
    海战图每岛一撮(3格),放在离岛中心 6~9 格的环带草地。
  耗尽:updateHarvester 采到 0 时 depleteMine() 清除 oreGrid,格子恢复可建。
  采矿速度:HARVEST_SPEED=1.5,每 0.35/1.5≈0.233s 采一格 12 矿(1.5x)。
  收益:dumpOre 里 gain*(oreRefine?2:1),矿石精炼科技把矿车箱里的矿价乘 2。
  贴图:img/goldmine.png(金矿.png 去白底),drawOre 按比例放进单格,采空即不画;
    无贴图时回退程序化金色晶体;不画剩余量条。矿石不再随时间恢复。



【高分辨率渲染 RENDER_SCALE】
  画布后备缓冲按 max(devicePixelRatio, RENDER_SCALE) 放大，再 CSS 缩回窗口，
  让画面（含照片贴图）更精细。当前 RENDER_SCALE=4；卡顿可调小。
  逻辑坐标仍按窗口 CSS 尺寸，鼠标取 getBoundingClientRect，勿与 backing store 混淆。

【已知注意事项 / 坑】
  1. 地图尺寸是动态的：改地图前先 setMapSize，别把 MAP_W/H 当常量硬编码。
  2. canvas.getImageData 在 file:// 下会被浏览器安全策略拦截(SecurityError)，
     所以贴图处理必须放到 Node 脚本里，运行时只 drawImage。
  3. 遍历 units 数组时不要直接 splice（会导致 gridCollect 下标错乱），
     上船/卸载用标记+循环后统一处理，并在 doBoard 后重建 buildGrid()。
  4. Unit.cargo 被矿车占用；运输艇的装载是 cargoUnits，不要混。
  5. orderMove 里不要对自己递归（历史：选中运输艇再点运输艇会死循环栈溢出）。
  6. 单位移动、寻路、出生格都要考虑 naval/amphib，用 pathFor/unitPassable/spawnUnitNear 的分支。

【如何验证】
  无测试框架，靠 Node 语法检查 + 自制 DOM/canvas stub 冒烟测试：
  node --check js/*.js 逐文件检查语法；
  可拼接全部 js + stub 在 Node 里跑 update/render/AI 模拟，抓运行期异常。
================================================================
