# 逻辑工坊 · 第6–20关设计

前5关（门铃、冰箱警告、双手冲压、仓库照明、温室通风）已完成。

以下延续同一套公式：现实场景 → 自然语言需求 → 布尔输入 → 输出期望 → 可用逻辑门 → 设计者目标函数。

---

## 已有关卡速览

| 关 | 主题 | 输入 | 输出 | 要点 |
|---|---:|---:|---|---|
| 1 | 门铃 | 1 | 1 | 直连 |
| 2 | 冰箱警示 | 1 | 1 | NOT |
| 3 | 双手冲压 | 2 | 1 | AND |
| 4 | 仓库照明 | 2 | 1 | AND + NOT |
| 5 | 温室通风 | 3 | 1 | OR、括号、下雨否决 |

---

## 第6关：停车场入口管理

**新引入：** 多输出分支。

**输入端：**

- `vehicle` — 入口检测到车辆
- `verified` — 车辆身份验证通过
- `full` — 停车场已满

**输出端：**

- `gate` — 入口栏杆升起
- `sign` — 显示"车位已满"

**自然语言需求：**

> 检测到车辆，并且身份验证通过，并且停车场未满时，升起入口栏杆。
> 检测到车辆但停车场已满时，显示"车位已满"。

**可用元件：** AND、NOT

**目标函数：**

```text
gate = vehicle AND verified AND (NOT full)
sign = vehicle AND full
```

**反例保护：** 已满且有车辆通过验证时，栏杆不能升，但满位牌必须亮。

---

## 第7关：火灾报警系统

**新引入：** 手动超控、维护豁免、多层次输出。

**输入端：**

- `smoke` — 烟雾传感器报警
- `heat` — 高温传感器报警
- `manual` — 手动报警按钮按下
- `bypass` — 消防检修模式开启

**输出端：**

- `bell` — 火灾警铃响起
- `sprinkler` — 消防喷淋启动
- `notify` — 发送消防通知

**自然语言需求：**

> 烟雾和高温同时报警时，系统确认发生火灾，应响起警铃、启动喷淋并发送通知。
> 手动报警按钮被按下时，警铃应立即响起并发送通知，但喷淋不能由手动按钮直接启动。
> 消防检修模式开启时，自动传感器不应触发任何设备，但手动报警按钮仍可启动警铃和通知。

**可用元件：** AND、OR、NOT

**设计中间信号：**

```text
fire_detected = smoke AND heat AND (NOT bypass)
```

**目标函数：**

```text
bell    = fire_detected OR manual
notify  = fire_detected OR manual
sprinkler = fire_detected
```

**反例保护：** 手动按钮 + 维护模式下不能启动喷淋；维护模式下自动传感器无效。

---

## 第8关：双控楼梯灯

**新引入：** XOR。

**输入端：**

- `s1` — 楼下开关朝上
- `s2` — 楼上开关朝上

**输出端：**

- `light` — 楼梯灯打开

**自然语言需求：**

> 两个开关方向不同时，楼梯灯打开；两个开关方向相同时，楼梯灯关闭。改变任意一个开关的方向，都会切换灯的状态。

**可用元件：** AND、OR、NOT

> 通关后解锁 XOR，显示"你的电路用了 N 个门，使用 XOR 可以简化为 1 个门"。

**目标函数：**

```text
light = s1 XOR s2
```

---

## 第9关：汽车安全启动

**新引入：** 旁路条件、多输出、错误诊断。

**输入端：**

- `seatbelt` — 驾驶员已系安全带
- `brake` — 刹车踏板已踩下
- `service` — 维修模式开启
- `fault` — 发动机存在故障

**输出端：**

- `start` — 允许启动发动机
- `warn_cond` — 显示"启动条件不足"
- `warn_fault` — 显示"发动机故障"

**自然语言需求：**

> 正常情况下，必须系好安全带、踩下刹车，且发动机无故障，才能启动。
> 维修模式可以绕过安全带和刹车要求，但不能绕过发动机故障。
> 非维修模式下，有人尝试启动（刹车踩下）但没有满足安全带和刹车条件时，显示"启动条件不足"。
> 发动机存在故障时，始终显示故障提示。

**支持信号：**

```text
normal_ready = seatbelt AND brake
qualify = normal_ready OR service
```

**可用元件：** AND、OR、NOT

**目标函数：**

```text
start       = qualify AND (NOT fault)
warn_cond   = brake AND (NOT service) AND (NOT normal_ready)
warn_fault  = fault
```

**反例保护：** 维修 + 故障 ≠ 允许启动；维修模式下不显示条件不足。

---

## 第10关：药品冷藏柜

**新引入：** 传感器不一致检测、紧急按钮。

**输入端：**

- `a` — 传感器A报告温度过高
- `b` — 传感器B报告温度过高
- `door` — 柜门已关闭
- `service` — 维修模式开启
- `override` — 紧急制冷按钮按下

**输出端：**

- `cool` — 压缩机启动
- `alarm_sensor` — 温度传感器故障警报
- `alarm_door` — 柜门警报
- `check` — 请求人工检查

**自然语言需求：**

> 两个温度传感器都报告温度过高时，压缩机自动启动。
> 两个传感器判断不一致时，不自动启动压缩机，并发出传感器故障警报。
> 紧急制冷按钮可以直接启动压缩机，即使两个传感器不一致。
> 维修模式开启时，自动制冷和传感器警报关闭，但紧急制冷仍有效。
> 柜门未关闭且非维修模式时，发出柜门警报。
> 传感器不一致或柜门未关闭时，请求人工检查——维修模式下也不能取消人工检查。

**可用元件：** AND、OR、NOT、XOR

**设计中间信号：**

```text
both_hot  = a AND b
mismatch  = a XOR b
auto_ok   = NOT service
```

**目标函数：**

```text
cool         = override OR (auto_ok AND both_hot)
alarm_sensor = auto_ok AND mismatch
alarm_door   = auto_ok AND (NOT door)
check        = mismatch OR (NOT door)
```

**反例保护：** 维修模式下双传感器一致过热也不能自动制冷；紧急制冷总是有效。

---

## 第11关：化工厂压力表决

**新引入：** 三传感器多数表决、备用系统切换。

**输入端：**

- `a` — 压力传感器A报警
- `b` — 压力传感器B报警
- `c` — 压力传感器C报警
- `manual` — 人工紧急停机按钮按下
- `bypass` — 自动系统检修模式开启
- `valve_ok` — 泄压阀可用
- `cooling_ok` — 备用冷却系统可用

**输出端：**

- `shutdown` — 反应器紧急停机
- `valve` — 打开泄压阀
- `cooling` — 启动备用冷却
- `sensor_err` — 传感器不一致警报
- `crit_err` — 严重安全故障警报

**自然语言需求：**

> 三个压力传感器中至少两个报警时，系统确认压力异常。
> 自动系统检修模式开启时，传感器不能自动触发停机、泄压或冷却。
> 人工紧急停机不受检修影响，按下即停机。
> 自动确认压力异常时：停机，并优先开泄压阀；若泄压阀不可用则启动备用冷却。
> 人工紧急停机只负责停机，不联动泄压或冷却。
> 三个传感器没有全部相同判断时，发出传感器不一致警报。
> 已确认压力异常但泄压阀和冷却都不可用时，发出严重安全故障警报。

**可用元件：** AND、OR、NOT、XOR

**设计中间信号：**

```text
majority = (a AND b) OR (a AND c) OR (b AND c)

all_ok   = (NOT a) AND (NOT b) AND (NOT c)
all_bad  = a AND b AND c
sensor_match = all_ok OR all_bad

pressure  = majority AND (NOT bypass)
```

**目标函数：**

```text
shutdown   = manual OR pressure
valve      = pressure AND valve_ok
cooling    = pressure AND (NOT valve_ok) AND cooling_ok
sensor_err = NOT sensor_match
crit_err   = pressure AND (NOT valve_ok) AND (NOT cooling_ok)
```

---

## 第12关：智能会议室预订

**新引入：** 四输入组合、资源互斥、时间窗口。

**输入端：**

- `booked` — 已有人预订当前时段
- `checkin` — 预订人已签到
- `occupied` — 房间红外检测到有人
- `admin` — 管理员超控钥匙

**输出端：**

- `unlock` — 门锁打开
- `warning` — 显示"即将释放"
- `release` — 自动释放给他人
- `report` — 标记异常占用

**自然语言需求：**

> 预订且签到，或红外检测到有人且预订人已签到：门锁打开。
> 红外检测到有人且已签到：正常。
> 红外检测到有人但未预订、已签到：标记异常。
> 已预订但红外无人且未签到：显示"即将释放"。
> 已预订但红外无人且未签到超过宽限期（此处简化）：自动释放给他人。
> 管理员超控钥匙可以强制打开门锁，但不影响释放与异常判断。

**可用元件：** AND、OR、NOT

**设计中间信号：**

```text
ok_occupy = occupied AND checkin
valid     = booked AND checkin
```

**目标函数：**

```text
unlock  = admin OR valid OR ok_occupy
warning = booked AND (NOT occupied) AND (NOT checkin)
release = booked AND (NOT occupied) AND (NOT checkin)       // 简化逻辑
report  = occupied AND (NOT booked) AND checkin
```

---

## 第13关：工厂传送带安全

**新引入：** 安全联锁链、多级停止。

**输入端：**

- `running` — 传送带已启动
- `guard` — 安全护罩已关闭
- `beam` — 安全光幕未被遮挡
- `estop` — 紧急停止按钮未按下（正常为真）
- `reset` — 复位按钮已按下
- `maint` — 维护钥匙已插入

**输出端：**

- `motor` — 电机运转
- `brake` — 安全制动器锁死
- `light` — 警示灯塔亮起
- `ready` — 系统就绪指示灯

**自然语言需求：**

> 传送带已在控制面板启动，且护罩关闭，且光幕未被遮挡，且急停未按下：电机运转。
> 急停按下时：制动器锁死，警示灯亮起，电机不可运转。复位前一直保持。
> 护罩打开或光幕被遮挡：电机停止，警示灯亮起，但制动器不锁死。
> 维护模式下，电机必须停止且制动器锁死。即使其他条件满足也不得启动。
> 只有在电机不运转、制动器不锁死、护罩关好、光幕正常、急停未按下时，显示系统就绪。

**可用元件：** AND、OR、NOT

**设计中间信号：**

```text
safe    = guard AND beam AND estop
can_run = safe AND running AND (NOT maint)
```

**目标函数：**

```text
motor = can_run
brake = (NOT estop) OR maint
light = (NOT safe) OR maint
ready = (NOT running) AND safe AND (NOT maint) AND estop
      // 简化：电机未转、护罩关、光幕清、急停未按、非维护
```

---

## 第14关：智能灌溉系统

**新引入：** 天气否决 + 多个启动源 + XNOR 隐含逻辑。

**输入端：**

- `dry` — 土壤湿度低于阈值
- `scheduled` — 定时灌溉计划到达
- `rain` — 正在下雨
- `freeze` — 气温低于冰点
- `manual` — 手动灌溉开关开启

**输出端：**

- `water` — 启动灌溉
- `skip` — 显示"已跳过（天气原因）"
- `done` — 显示"灌溉完成或无需灌溉"

**自然语言需求：**

> 土壤干燥或定时计划到达时，需要灌溉。
> 正在下雨或气温低于冰点时，不能灌溉。
> 手动灌溉开关可以绕过计划和干燥要求，但不能绕过下雨或冰点。
> 需求存在但因天气跳过时，显示"已跳过"。
> 没有灌溉需求且天气允许时，显示"已完成或无需灌溉"（即正常待机）。

**可用元件：** AND、OR、NOT

**设计中间信号：**

```text
need_water = dry OR scheduled OR manual
weather_bad = rain OR freeze
```

**目标函数：**

```text
water = need_water AND (NOT weather_bad)
skip  = (dry OR scheduled) AND weather_bad AND (NOT manual)
done  = (NOT need_water) AND (NOT weather_bad)
```

---

## 第15关：数据中心温控

**新引入：** 比较器、阈值判断。

**输入端：**

- `temperature` — 当前机房温度
- `limit` — 允许的最高温度
- `ac_ok` — 空调正常
- `fire` — 消防气体释放中
- `manual` — 人工强制制冷

**输出端：**

- `cool` — 正常制冷
- `boost` — 增强制冷
- `alarm` — 温度警报
- `fault` — 空调故障警报
- `vent` — 打开通风口

**自然语言需求：**

> 当前温度超过上限时，确认温度异常并发出警报。
> 温度异常或人工强制制冷时，启动制冷。
> 空调故障且温度异常，或人工强制制冷时，启动增强制冷。
> 消防气体释放时，不得制冷也不得通风，但仍可发出温度警报。
> 空调故障时发出故障警报。

**可用元件：** AND、OR、NOT、比较器

**设计中间信号：**

```text
too_hot = temperature > limit
not_fire = NOT fire
```

**目标函数：**

```text
cool  = (too_hot OR manual) AND not_fire
boost = ((too_hot AND (NOT ac_ok)) OR manual) AND not_fire
alarm = too_hot
fault = NOT ac_ok
vent  = too_hot AND not_fire
```

---

## 第16关：电梯调度安全

**新引入：** 简单存储器、事件保持与复位。

**输入端：**

- `request` — 有人请求电梯
- `door` — 电梯门已完全关闭
- `overload` — 超载传感器
- `fire` — 消防模式激活
- `reset` — 消防状态复位

**输出端：**

- `move` — 允许电梯运行
- `open` — 开门
- `fire_return` — 消防迫降至1楼
- `alarm` — 超载警报

**自然语言需求：**

> 门已关、无超载、没有消防状态且有运行请求时，允许运行。
> 消防信号出现后，即使信号消失，消防状态也要保持，直到按下复位。
> 消防状态保持时，电梯门关闭后向1楼迫降，不响应普通请求。
> 超载时开门并响起警报，不允许运行。

**可用元件：** AND、OR、NOT、存储器

**设计中间信号：**

```text
fire_memory = fire_memory OR fire
// reset 清除 fire_memory
```

**目标函数：**

```text
move        = request AND door AND (NOT overload) AND (NOT fire_memory)
fire_return = fire_memory AND door
open        = overload
alarm       = overload
```

---

## 第17关：核磁共振安全门

**新引入：** 存储器复位、确认状态保持。

**输入端：**

- `confirm` — 护士和医生都已确认安全
- `metal` — 金属探测器报警
- `pacemaker` — 患者声明有心脏起搏器
- `scanning` — 设备正在扫描中
- `emergency` — 紧急停止已触发
- `reset` — 重新检查并清除确认

**输出端：**

- `door_lock` — 门锁锁死
- `allow_entry` — 允许人员进入
- `warn_metal` — 金属警告
- `warn_pacemaker` — 起搏器警告
- `scan_block` — 阻止扫描

**自然语言需求：**

> 护士和医生完成确认后，安全确认保持有效，直到重新检查。
> 金属报警时门锁锁死并发出警告；完成安全确认后可以暂时解锁。
> 起搏器只阻止扫描，不阻止人员进入。
> 扫描中或紧急停止时，门必须锁死且不得进入。

**可用元件：** AND、OR、NOT、存储器

**设计中间信号：**

```text
approved = approved OR confirm
// reset 清除 approved
blocked = scanning OR emergency
```

**目标函数：**

```text
door_lock      = metal OR blocked
allow_entry    = approved AND (NOT blocked)
warn_metal     = metal
warn_pacemaker = pacemaker
scan_block     = pacemaker OR emergency
```

---

## 第18关：机场行李分拣

**新引入：** 简单优先级选择。

**输入端：**

- `scanned` — 行李已扫码
- `flag` — 安检标记
- `heavy` — 超重
- `dest_ok` — 目的地有效
- `manual` — 人工放行
- `pause` — 系统暂停

**输出端：**

- `accept` — 接受行李
- `inspect` — 转安检复查
- `reject` — 超重退回
- `paused` — 系统暂停指示灯

**自然语言需求：**

> 系统暂停时，只亮暂停灯，不输出其他信号。
> 已扫码且超重时，优先退回，不管其他条件。
> 已扫码且人工放行时，只要不超重即可接受。
> 有安检标记且不超重、没有人工放行时，转安检复查。
> 没有安检标记、目的地有效且不超重时，接受行李。

**可用元件：** AND、OR、NOT、优先级选择器

**设计中间信号：**

```text
reject_condition = scanned AND heavy
manual_condition = scanned AND manual AND (NOT heavy)
inspect_condition = scanned AND flag AND (NOT heavy) AND (NOT manual)
accept_condition = scanned AND dest_ok AND (NOT heavy) AND (NOT flag) AND (NOT manual)
```

**优先级：**

```text
pause > reject > manual_accept > inspect > accept
```

**目标函数：**

```text
paused = pause
reject = reject_condition AND (NOT pause)
accept = (manual_condition OR accept_condition) AND (NOT pause)
inspect = inspect_condition AND (NOT pause)
```

优先级选择器用于确保暂停和超重条件优先处理，玩家不必为每个输出重复搭建大量互斥逻辑。

---

## 第19关：航天器对接系统

**新引入：** 简单中止存储器。

**输入端：**

- `align` — 对准精度达标
- `speed` — 接近速度达标
- `comms` — 通信链路正常
- `station` — 空间站已就绪
- `pilot` — 驾驶员手动接管
- `abort` — 中止按钮
- `reset` — 中止状态复位

**输出端：**

- `dock` — 执行对接
- `abort_signal` — 中止并后退
- `hold` — 保持当前位置
- `seal_now` — 启动紧急密封
- `warn` — 对接条件警告

**自然语言需求：**

> 自动模式需要对准、速度、通信和空间站全部正常。
> 驾驶员接管时，只要速度和通信正常即可对接。
> 中止按钮按下后，中止状态保持，直到复位。
> 通信中断时保持当前位置，不发普通条件警告。
> 未满足对接条件且通信正常时保持当前位置并发出警告。
> 中止时，或通信中断且空间站就绪时，启动紧急密封。

**可用元件：** AND、OR、NOT、存储器

**设计中间信号：**

```text
auto_ok = align AND speed AND comms AND station
pilot_ok = pilot AND speed AND comms
abort_memory = abort_memory OR abort
// reset 清除 abort_memory
```

**目标函数：**

```text
dock = (auto_ok OR pilot_ok) AND (NOT abort_memory)
abort_signal = abort_memory
hold = (NOT dock) AND (NOT abort_memory)
seal_now = abort_memory OR ((NOT comms) AND station)
warn = (NOT pilot) AND comms AND (NOT abort_memory) AND ((NOT align) OR (NOT speed))
```

---

## 第20关：全楼宇自动化总控

**终极关卡。新引入：** 综合前面学过的元件，不新增复杂元件。

**输入端：**

- `fire` — 火灾报警
- `quake` — 地震传感器
- `outage` — 市电中断
- `occupy` — 楼内有人员
- `night` — 夜间模式
- `breach` — 安防入侵
- `maint` — 全楼维护模式
- `evac` — 人工疏散按钮
- `gen_ok` — 发电机就绪
- `all_clear` — 系统全部复位

**输出端：**

- `evac_alarm` — 疏散警报
- `lights_em` — 应急照明
- `lights_normal` — 正常照明
- `hvac_off` — 关闭暖通
- `lock` — 锁死所有门
- `unlock` — 解锁所有逃生门
- `gen_start` — 启动发电机
- `siren` — 安防警笛

**自然语言需求：**

> 火灾、地震或人工疏散时，启动疏散警报、关闭暖通并解锁逃生门；维护模式下不启动疏散警报。
> 入侵时锁门并启动警笛；维护模式下不启动警笛。
> 断电时启动发电机和应急照明，正常照明关闭。
> 夜间或紧急事件时启动应急照明。
> 无紧急事件且有人在楼内、非夜间时，开启正常照明。
> 全部复位时关闭警报、警笛和应急照明，并保持逃生门锁定。

**可用元件：** AND、OR、NOT；可选用前面学过的比较器、存储器和优先级选择器。

**设计中间信号：**

```text
evac_event = fire OR quake OR evac
dark = night OR outage
not_clear = NOT all_clear
```

**目标函数：**

```text
evac_alarm    = evac_event AND (NOT maint) AND not_clear
lights_em     = (dark OR evac_event OR breach) AND not_clear
lights_normal = occupy AND (NOT dark) AND (NOT evac_event) AND (NOT breach) AND not_clear
hvac_off      = evac_event AND (NOT maint) AND not_clear
lock          = breach AND (NOT maint) AND not_clear
unlock        = evac_event AND (NOT maint) AND not_clear
gen_start     = outage AND gen_ok AND not_clear
siren         = breach AND (NOT maint) AND not_clear
```

---

## 难度曲线总结

| 关 | 新引入的元素 |
|---|---|
| 1 | 直连 |
| 2 | NOT |
| 3 | AND |
| 4 | AND + NOT |
| 5 | OR、括号、天气否决 |
| 6 | 多输出 |
| 7 | 手动超控、维护豁免、多层输出 |
| 8 | XOR 引入 |
| 9 | 旁路条件、错误诊断输出 |
| 10 | 传感器不一致 (XOR)、紧急覆盖、不可豁免的人工请求 |
| 11 | 3取2表决、备用系统级联 |
| 12 | 四输入组合、资源互斥、异常检测 |
| 13 | 安全联锁链、多级停止、复位 |
| 14 | 多启动源 + 最终否决 + 跳过原因诊断 |
| 15 | 比较器、单一阈值判断 |
| 16 | 简单存储器、消防状态保持与复位 |
| 17 | 存储器复位、确认状态保持 |
| 18 | 简单优先级选择、互斥输出 |
| 19 | 简单中止存储器、复位 |
| 20 | 综合前面学过的元件，不新增复杂元件 |

---

## 实现建议

每关数据结构沿用前五关的格式：

```js
{
  id: 6,
  title: '停车场入口管理',
  brief: '...',
  inputs: [['vehicle','入口检测到车辆'], ['verified','身份验证通过'], ['full','停车场已满']],
  outputs: [['gate','入口栏杆升起'], ['sign','显示车位已满']],
  allowed: ['AND','NOT'],
  rule: '...',
  target: (v) => ({ gate: v.vehicle && v.verified && !v.full, sign: v.vehicle && v.full })
}
```

多输出关卡使用对象返回值而非单一布尔值。

验证系统需要对多输出关卡的 `target()` 和 `evaluate().__out` 的每个输出键逐一比较，全部键通过才算通关。

第8关（XOR）在通关后解锁 XOR 门，此后所有关卡在 `allowed` 中包含 XOR。
