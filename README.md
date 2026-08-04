# FCS

浏览器端 **3D 军事飞行射击** 小游戏（街机偏模拟）。用 Vite + TypeScript + Three.js 实现，可选 Electron 便携版 EXE。

作者：[cptslow123](https://github.com/cptslow123)  
仓库：<https://github.com/cptslow123/A-rudimentary-flight-simulator>

---

## 玩法概览

- 标题选机：**轰炸机 / 攻击机 / 战斗机**
- 单地图跑道起飞 → 无尽清剿计分
- **固定目标**（营地、桥梁、设施、堡垒）：摧毁后约 60 秒原地刷新
- **地面移动目标**（步兵、车辆、坦克、防空车等）：开局地图内生成，击毁后从边缘补刷
- **空中敌机**：机动规避，被攻击或锁定时更剧烈
- **防空车**：向上锥形扫描锁定玩家并发射防空导弹
- **热诱弹 (X)**：诱偏来袭导弹；也可大机动摆脱（导引头锥角外丢锁）
- 弹药空中缓慢恢复，降落跑道可快速补给

### 机型差异（简）

| 机型 | 特点 |
|------|------|
| 轰炸机 | 低速高载弹；机枪 + 重磅炸弹 + 热诱弹 |
| 攻击机 | 中速；小炸弹 / 火箭 / 可锁定导弹 + 热诱弹 |
| 战斗机 | 高速高机动；机炮 + 导弹 + 热诱弹 |

---

## 默认键位

| 按键 | 作用 |
|------|------|
| 鼠标移动 | 俯仰 / 偏航（进入后指针锁定；**下移 = 抬头**） |
| W / S | 油门增减 |
| A / D | 滚转 |
| Q / E | 偏航 |
| 空格 | 投弹（仅炸弹） |
| 左键 | 当前武器射击（非炸弹） |
| 右键按住 | 瞄准放大 |
| X | 热诱弹 |
| 1–4 | 切换武器槽 |
| Esc | 暂停 |

标题页右下角 **`dev`**：调试作弊（无限弹药 / 不被锁定 / 无限 HP）。

---

## 快速开始

### 环境

- Node.js 18+ 推荐  
- Windows（已验证）；其它系统可用浏览器开发模式

### 安装与运行（浏览器）

在 monorepo 根目录：

```bash
npm install
npm run start:flightgame
```

浏览器打开终端提示的地址（一般为 <http://localhost:5173/> 或 <http://127.0.0.1:5173/>）。

仅在 `flightgame/` 内：

```bash
cd flightgame
npm install
npm run dev
```

### 打包 Windows 便携 EXE

根目录：

```bash
npm run build:flightgame
```

或：

```bash
cd flightgame
npm run build:win
```

产物（构建后保留）：

```text
flightgame/release/FCS-Portable-1.0.0-x64.exe
```

说明：使用 monorepo 已有 Electron（`electronDist`），无需在 `flightgame` 内再装一份 Electron。  
打包后可删除中间目录 `flightgame/web/`、`flightgame/release/win-unpacked/` 等，**保留** portable EXE 即可。

---

## 目录结构（相关部分）

```text
electron-workspace/          # monorepo 根
  flightgame/                # 本飞行游戏
    src/
      aircraft/              # 机型数据与网格
      flight/                # 飞行物理
      weapons/               # 武器、锁定、弹道
      targets/               # 固定/移动/空中目标
      threats/               # 防空与敌方导弹、热诱弹
      world/                 # 地形与跑道
      ui/                    # 标题、HUD、雷达、dev 面板
      audio/                 # WebAudio 合成音效
      game/                  # 主循环与状态
    main.cjs                 # Electron 壳
    package.json
  package.json               # workspaces 脚本
```

同仓库 monorepo 内可能还有其它小游戏 workspace（如逻辑门等），与飞行模拟相互独立。

---

## 技术栈

- **渲染**：Three.js  
- **工具链**：Vite · TypeScript  
- **桌面壳**：Electron（portable）  
- **美术**：低多边形程序化拼装 + 高度图地形  
- **音频**：Web Audio API 合成（无外部音源文件）

---

## 开发说明

- 中文 UI，桌面分辨率优先（建议 ≥ 1280×720）  
- 物理为简化运动学 / 包围近似，非完整刚体引擎  
- v1 范围：单地图、无尽计分、无多人、无真实航电仪表  

---

## License

UNLICENSED / 个人项目。见各 `package.json`。

---

## 链接

- GitHub 主页：<https://github.com/cptslow123>  
- 本仓库：<https://github.com/cptslow123/A-rudimentary-flight-simulator>
