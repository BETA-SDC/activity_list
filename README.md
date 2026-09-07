# 西湖大学β书院活动中心：数据维护说明

该网站会自动读取 `data/activities`、`data/calendar` 和 `data/任务分工` 文件夹下的分组数据，向内部成员展示项目计划与分工。
网站包含三个页面：
- Activities：按状态分列或按活动类型分列，已归档可单独展示。
- Calendar：可勾选任务带入与外部导入，并导出 Apple Calendar/ICS。
- Contribution：统计待分工和已分工的总负责人次数和分工负责人次数，不含归档。

这个网站会自动读取项目里的三个数据来源：

- `data/activities/index.json`
- `data/activities/todo.json`
- `data/activities/done.json`
- `data/activities/archive.json`
- `data/calendar/index.json`
- `data/calendar/external.ics`
- `data/任务分工` 文件夹下的分工文件，优先读取 `data/任务分工/index.json`

页面代码已经拆成三个静态页面和两个共享静态文件：

- `pages/activities.html`
- `pages/calendar.html`
- `pages/contribution.html`
- `index.html`（跳转入口）
- `assets/css/styles.css`
- `assets/js/shared.js`
- `assets/js/calendar.js`
- `assets/js/render.js`
- `assets/js/app.js`

如果需要在页面里直接编辑并写回本地文件，请启动本地服务：

```bash
npm start
```

然后用 `http://127.0.0.1:8787/` 打开网站。这样活动编辑会直接保存到 `data/activities/`。

请所有同学在改动文件前先阅读下面的格式要求，避免页面读取失败或显示异常。

## 一、基本规则

1. 所有 JSON 文件都必须保存为 **UTF-8 编码**。
2. JSON 中只能使用 **英文双引号**，不能使用中文引号、单引号或注释。
3. 对象或数组的最后一个元素后面 **不要加逗号**。
4. 所有字段名必须和模板完全一致，包括括号、大小写和空格。
5. 字段值没有内容时，请保留字段并填写空字符串 `""`，不要直接删掉字段。
6. 新增字段不会被页面自动显示；如果确实需要新增字段，请先和网站维护人员确认。
7. 修改文件后，回到页面点击右上角的“刷新数据”，或刷新浏览器。页面 HTML 已设置为不缓存，但 GitHub Pages 和浏览器缓存仍可能短暂保留旧资源，建议使用 `Ctrl + F5` 强制刷新。

推荐使用 VS Code、Sublime Text、在线 JSON 校验工具等编辑 JSON。不要直接用 Excel 另存为 JSON，容易产生编码或格式问题。

## 二、`data/activities` 格式模板

文件位置：`data/activities/`。

`index.json` 用来描述每个阶段对应哪些文件，展示名称建议直接写成状态名。

```json
{
  "groups": [
    {
      "id": "todo",
      "label": "待分工",
      "default": true,
      "includeInCalendar": true,
      "includeInContribution": true,
      "files": ["todo.json"]
    }
  ]
}
```

每个阶段文件都是一个数组，里面直接放活动对象。

```json
[
  {
    "代号": "P1",
    "活动名称": "Math Help Room",
    "状态": "待分工",
    "详情": "这里填写活动的简要说明，没有内容时填写空字符串",
    "活动类型": "学术活动",
    "总负责人": "张三",
    "预计月份(Y)": "9",
    "预计日期(D)": "9",
    "开始时间(H)": "14:00",
    "地点": "H4-121"
  }
]
```

字段说明：

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `代号` | 必填 | 活动唯一编号，例如 `P1`、`P2`。需要和分工文件中的代号一致 |
| `活动名称` | 建议填写 | 活动名称 |
| `状态` | 必填 | 填写“已分工”或“待分工”等阶段状态 |
| `详情` | 可空 | 活动简介，没有则写 `""` |
| `活动类型` | 必填 | 例如“学术活动”“日常活动”“出校活动”等等 |
| `总负责人` | 可空 | 活动的总负责人姓名。Contribution 页面会统计这个字段 |
| `建立规划时间` | 自动生成 | 活动被新建或补录时自动写入，用于后续归档排序 |
| `预计月份(Y)` | 可空 | 只填写月份数字，例如 `9`、`10`。不要填年份 |
| `预计日期(D)` | 可空 | 只填写日期数字，例如 `9`、`23`。Calendar 页面只显示这个字段不为空的活动 |
| `开始时间(H)` | 可空 | 例如 `19:00`，没有则写 `""` |
| `地点` | 可空 | 活动地点，没有则写 `""` |

## 三、`data/calendar` 文件格式模板

文件位置：`data/calendar/` 文件夹。

`index.json` 用来描述日历来源。`kind` 为 `activity` 的来源会从活动阶段自动生成日历事件，`kind` 为 `file` 的来源会从 `.ics` 文件读取额外事件。

```json
{
  "sources": [
    {
      "id": "tasks",
      "label": "任务带入",
      "kind": "activity",
      "default": true,
      "includeInCalendar": true,
      "includeInContribution": true
    },
    {
      "id": "external",
      "label": "外部导入",
      "kind": "file",
      "file": "external.ics",
      "default": true,
      "includeInCalendar": true,
      "includeInContribution": false
    }
  ]
}
```

外部导入日历文件使用标准 `.ics` 格式，适合直接用 Apple Calendar、Outlook、Google Calendar 互通。每个事件写成一个 `VEVENT`：

```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BETA-SDC//Activity List//CN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:demo-1@beta-sdc
DTSTAMP:20260907T000000Z
DTSTART:20260901T140000
DTEND:20260901T150000
SUMMARY:示例事件
LOCATION:H4-121
DESCRIPTION:可选备注
END:VEVENT
END:VCALENDAR
```

字段说明：

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `UID` | 必填 | 事件唯一编号 |
| `DTSTART` | 必填 | 开始时间，全天事件可写 `VALUE=DATE` |
| `DTEND` | 建议填写 | 结束时间，全天事件通常写成次日日期 |
| `SUMMARY` | 必填 | 日历事件标题 |
| `LOCATION` | 可空 | 事件地点 |
| `DESCRIPTION` | 可空 | 额外说明 |

## 四、`任务分工` 文件格式模板

文件位置：分工文件放在 `data/任务分工/2026` 文件夹，通用清单放在 `data/任务分工/index.json`。文件名直接用 `P1.json` 这种格式，不再带 `任务分工` 前缀。

建议先在 `data/任务分工/index.json` 中列出需要加载的文件，再配合连续编号管理：

```text
P1.json
P2.json
P3.json
```

每个分工文件都建议使用数组，方便一个活动记录多条分工，也便于后续统一校验。

```json
[
  {
    "代号": "P1",
    "活动名称": "示例活动名称",
    "分工": "物资采买",
    "负责人": "李四",
    "预计开始时间": "2026/9/1",
    "预计结束时间": "2026/9/6"
  },
  {
    "代号": "P1",
    "活动名称": "示例活动名称",
    "分工": "主持现场",
    "负责人": "王五",
    "预计开始时间": "",
    "预计结束时间": ""
  }
]
```

字段说明：

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `代号` | 必填 | 必须和 `data/activities` 中对应活动的代号一致 |
| `活动名称` | 建议填写 | 对应活动名称，方便人工核对 |
| `分工` | 必填 | 具体分工内容 |
| `负责人` | 建议填写 | 负责这项分工的同学姓名。Contribution 页面会统计这个字段 |
| `预计开始时间` | 可空 | 例如 `2026/9/1`，没有则写 `""` |
| `预计结束时间` | 可空 | 例如 `2026/9/6`，没有则写 `""` |

## 五、后续维护注意事项

### 1. 代号要保持一致

`data/activities` 中的“代号”必须和 `data/任务分工/2026` 文件中的“代号”一致。例如活动是 `P2`，分工文件里也要写 `"代号": "P2"`，否则“已分工”状态无法自动匹配分工明细。

### 2. 用清单文件管理分工文件

如果存在 `data/任务分工/index.json`，网站会优先按清单读取，适合长期维护和不连续编号的情况。

推荐写法：

```json
{
  "files": [
    "P1.json",
    "P2.json",
    "P3.json"
  ]
}
```

如果没有清单文件，网站仍会从 `data/任务分工/2026/P1.json` 开始自动读取，连续两次找不到文件时停止。

### 3. 页面读取逻辑

- Activities：按状态分列或按活动类型分列，默认不展示已归档，归档可单独勾选。
- Calendar：可切换任务带入与外部导入，外部导入以 `.ics` 存储，导出时只包含当前勾选来源。
- Contribution：统计 `includeInContribution` 为 `true` 的阶段中的总负责人次数（绿色）以及分工负责人次数（蓝色）。

### 4. 更新后要检查

每次修改 JSON 后，请至少打开三个页面检查一次，确认活动数量、日历日期、分工明细和 Contribution 柱状图都符合预期。

## 六、长期维护建议

1. 新活动优先放入对应阶段文件，再同步补分工文件和清单。
2. 阶段文件尽量一阶段一文件，文件内部统一用数组。
3. 保持 `代号` 唯一且稳定，后续改名称不要改代号。
4. 尽量把日期写成统一格式，便于后续做排序、筛选和校验。
5. 如果经常多人协作修改，建议在提交前先做一次 JSON 校验，再刷新页面确认展示正常。
