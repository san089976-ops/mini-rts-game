---
name: verify-static-logic-gate-game
description: Runtime verification recipe for the standalone logic gate game HTML.
---

# Verify logic gate game

1. Start a static server from the project root using the `logic-gate-game` configuration in `.Codex/launch.json`.
2. Open `http://127.0.0.1:8765/logic-gate-game.html` in the Browser preview.
3. Click **开始游戏** and verify `#stage` contains the expected input/output labels, values, `.port` circles, and SVG namespace elements. Check browser console errors.
4. Return home, click **自由模式**, accept the default configuration, and click **创建画布**. Verify `#free-stage` contains two inputs, one output, two gates, and their ports.
5. Toggle a free-mode input and confirm its canvas value changes without console errors.
6. Use accessibility snapshots or DOM inspection if screenshot capture times out.
