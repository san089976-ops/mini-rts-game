单位素材文件夹 img/units/
========================

这里存放所有【单位】的贴图素材(建筑素材仍在 img/ 目录):

  abrams.png     艾布拉姆斯坦克(战场本体,背景已透明)
  t90.png        T90坦克(战场本体,背景已透明)
  infantry.png   步兵(信息面板图标)
  tank.png       灰熊/犀牛坦克(信息面板图标)
  harvester.png  采矿车(信息面板图标)

如何替换/新增单位素材
---------------------
1. 准备一张带纯黑或纯白背景的单位照片(PNG,8bit)。
2. 运行预处理脚本,自动把黑/白背景变透明、内容裁切并居中:

     node tools/process-sprite.js  "照片.png"  输出名

   例: node tools/process-sprite.js "我的驱逐舰.png" destroyer
   -> 生成 img/units/destroyer.png

3. 在 js/config.js 里配置:
   - IMAGES 添加映射,例如:  destroyer:'img/units/destroyer.png'
   - 若作为"战场本体"贴图,还需在 SPRITE_ROT 填写该图炮管/车头的
     自然朝向角度(以图像坐标系,+X=右,顺时针),并让 drawUnit 使用它。

4. 替换已有素材: 直接覆盖 img/units/ 下的同名文件即可,无需改代码。
