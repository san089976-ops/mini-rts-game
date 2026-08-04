# FCS

3D 军事飞行射击小游戏，Vite + TypeScript + Three.js，可选 Electron 便携版。

## 快速开始

需要 Node.js 18+。

Windows 快速启动：

```bash
flightgame\start-game.bat
```

脚本会自动检查 npm，缺少依赖时自动安装，然后启动 Vite 并打开 `http://127.0.0.1:5173/`。

手动启动（本地端口）：

```bash
cd flightgame
npm install
npm run dev
```

浏览器打开终端提示的地址，默认为 `http://localhost:5173/`。若 5173 被占用，Vite 会使用下一个可用端口（如 5174），以终端输出为准。

## 构建

```bash
cd flightgame
npm run build:web
```

打包 Windows 便携版：

```bash
npm run build:win
```

产物：`flightgame/release/FCS-Portable-1.0.0-x64.exe`

也可以直接运行 `flightgame\build-exe.bat` 一键打包。

## 项目结构

- `flightgame/src/` 游戏源码（飞行、武器、目标、战役任务、UI）
- `flightgame/main.cjs` Electron 壳

## License

UNLICENSED
