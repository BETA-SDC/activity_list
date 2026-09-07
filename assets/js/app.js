(function () {
  "use strict";

  const app = document.getElementById("app");
  const MAX_TASK_FILES = 200;

  const state = {
    activityGroups: [],
    tasks: [],
    calendarSources: [],
    calendarSourceIds: [],
    activityGroupId: "todo",
    filterMode: "status"
  };

  const clean = (value) => (typeof value === "string" ? value.trim() : "");

  const SITE_BASE = location.pathname.includes("/pages/") ? "../" : "./";

  const stripLeadingDotSlash = (value) => String(value || "").replace(/^\.\//, "");

  const isRemotePath = (value) => /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("/");

  const resolveSitePath = (value) => {
    const path = stripLeadingDotSlash(clean(value));
    if (!path) {
      return path;
    }
    if (isRemotePath(path) || path.startsWith("../")) {
      return path;
    }
    return `${SITE_BASE}${path}`;
  };

  const joinSitePath = (basePath, childPath) => {
    const base = stripLeadingDotSlash(clean(basePath));
    const child = stripLeadingDotSlash(clean(childPath));
    if (!base) {
      return child;
    }
    if (isRemotePath(child) || child.startsWith("../")) {
      return child;
    }
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    if (child.startsWith(normalizedBase)) {
      return child;
    }
    return `${normalizedBase}${child}`;
  };

  const toNumber = (value) => {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  const normalizeArray = (value) => (Array.isArray(value) ? value : [value]);

  const hasContent = (item) =>
    item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length > 0;

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const currentPage = () => {
    const page = clean(document.body.dataset.page);
    return ["activities", "calendar", "contribution"].includes(page) ? page : "activities";
  };

  async function fetchJSON(path) {
    const url = `${resolveSitePath(path)}?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`无法读取 ${path}（HTTP ${response.status}）`);
    }
    return response.json();
  }

  async function loadManifestPaths(path) {
    try {
      const manifest = await fetchJSON(path);
      if (Array.isArray(manifest)) {
        return manifest.map(String).filter(Boolean);
      }
      if (manifest && Array.isArray(manifest.files)) {
        return manifest.files.map(String).filter(Boolean);
      }
    } catch (error) {
      // 没有清单文件时使用自动探测。
    }
    return null;
  }

  const loadGroupedFiles = async (basePath, manifestPath, fallbackPattern) => {
    const manifestPaths = await loadManifestPaths(manifestPath);

    if (manifestPaths && manifestPaths.length) {
      const settled = await Promise.allSettled(
        manifestPaths.map(async (name) => {
          const path = joinSitePath(basePath, name);
          const data = await fetchJSON(path);
          return normalizeArray(data).filter(hasContent);
        })
      );

      return settled
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value);
    }

    const items = [];
    let consecutiveMisses = 0;

    for (let i = 1; i <= MAX_TASK_FILES; i += 1) {
      const path = fallbackPattern(i);
      try {
        const data = await fetchJSON(path);
        items.push(...normalizeArray(data).filter(hasContent));
        consecutiveMisses = 0;
      } catch (error) {
        consecutiveMisses += 1;
        if (consecutiveMisses >= 2) {
          break;
        }
      }
    }

    return items;
  };

  async function loadTaskFiles() {
    return loadGroupedFiles(
      "data/任务分工/",
      "data/任务分工/index.json",
      (i) => `data/任务分工/任务分工-P${i}.json`
    );
  }

  async function loadActivityGroups() {
    const manifestPath = "data/activities/index.json";
    const manifest = await fetchJSON(manifestPath);
    const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];

    if (!groups.length) {
      throw new Error("data/activities/index.json 中没有可用的活动分组。");
    }

    const loadedGroups = await Promise.all(groups.map(async (group) => {
      const files = Array.isArray(group.files) ? group.files : [];
      const activities = [];

      for (const file of files) {
        const path = joinSitePath("data/activities/", file);
        const data = await fetchJSON(path);
        activities.push(...normalizeArray(data).filter(hasContent));
      }

      return {
        id: clean(group.id) || clean(group.label) || "未命名",
        label: clean(group.label) || clean(group.id) || "未命名",
        includeInCalendar: group.includeInCalendar !== false,
        includeInContribution: group.includeInContribution !== false,
        default: group.default === true,
        activities
      };
    }));

    return loadedGroups;
  }

  const sortActivities = (activities) =>
    [...activities].sort((a, b) => {
      const aNum = toNumber(a["代号"]);
      const bNum = toNumber(b["代号"]);
      if (aNum !== bNum) {
        return aNum - bNum;
      }
      return String(a["活动名称"] || "").localeCompare(
        String(b["活动名称"] || ""),
        "zh-CN",
        { numeric: true }
      );
    });

  const activityTimeText = (activity) => {
    const month = clean(activity["预计月份(Y)"]);
    const day = clean(activity["预计日期(D)"]);
    const hour = clean(activity["开始时间(H)"]);

    if (month && day) {
      return `${month}月${day}日${hour ? ` ${hour}` : ""}`;
    }
    if (month) {
      return `${month}月${hour ? ` ${hour}` : ""}`;
    }
    if (day) {
      return `${day}日${hour ? ` ${hour}` : ""}`;
    }
    return "日期待定";
  };

  const pageMeta = {
    activities: {
      title: "Activities",
      subtitle: "按阶段查看活动，默认只显示待办。"
    },
    calendar: {
      title: "Calendar",
      subtitle: "可勾选任务带入与外部导入，支持导出 Apple 日历。"
    },
    contribution: {
      title: "Contribution",
      subtitle: "统计待办和已完成的成员次数，不含归档。"
    }
  };

  const pageIntro = (view) => {
    const meta = pageMeta[view];
    return `
      <section class="intro">
        <div>
          <p class="eyebrow">Westlake Beta College Activity Center</p>
          <h1>${escapeHTML(meta.title)}</h1>
          ${meta.subtitle ? `<p class="subtitle">${escapeHTML(meta.subtitle)}</p>` : ""}
        </div>
        <button class="refresh-btn" id="refreshBtn" type="button">刷新数据</button>
      </section>
    `;
  };

  const emptyState = (message) => `
    <div class="state-card">
      <div>
        <h2>暂时没有可显示的内容</h2>
        <p>${escapeHTML(message)}</p>
      </div>
    </div>
  `;

  const taskTimeText = (task) => {
    const start = clean(task["预计开始时间"]);
    const end = clean(task["预计结束时间"]);

    if (start && end) {
      return `${start} — ${end}`;
    }
    if (start) {
      return `${start} 起`;
    }
    if (end) {
      return `截止 ${end}`;
    }
    return "";
  };

  const taskDetailsForActivity = (activity) => {
    const code = clean(activity["代号"]);
    const name = clean(activity["活动名称"]);
    let matches = state.tasks.filter((task) => clean(task["代号"]) === code);

    if (!matches.length && name) {
      matches = state.tasks.filter((task) => clean(task["活动名称"]) === name);
    }

    return matches.filter((task) =>
      clean(task["分工"]) || clean(task["负责人"]) || taskTimeText(task)
    );
  };

  const taskItem = (task) => {
    const work = clean(task["分工"]) || "未填写分工";
    const owner = clean(task["负责人"]) || "负责人待定";
    const time = taskTimeText(task);

    return `
      <div class="task-item">
        <div class="task-work">${escapeHTML(work)}</div>
        ${owner ? `<div class="task-owner">负责人：${escapeHTML(owner)}</div>` : ""}
        ${time ? `<div class="task-time">时间：${escapeHTML(time)}</div>` : ""}
      </div>
    `;
  };

  const getGroupById = (groupId) =>
    state.activityGroups.find((group) => group.id === groupId) || state.activityGroups[0] || null;

  const calendarActivities = () =>
    state.activityGroups
      .filter((group) => group.includeInCalendar)
      .flatMap((group) => group.activities);

  const contributionActivities = () =>
    state.activityGroups
      .filter((group) => group.includeInContribution)
      .flatMap((group) => group.activities);

  const pad2 = (value) => String(value).padStart(2, "0");

  const addDays = (year, month, day, delta) => {
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + delta);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  };

  const parseClock = (value) => {
    const match = clean(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return null;
    }
    return {
      hour: Number(match[1]),
      minute: Number(match[2]),
      second: Number(match[3] || 0)
    };
  };

  const parseFlexibleDate = (value) => {
    const text = clean(value);
    if (!text) {
      return null;
    }

    const full = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (full) {
      return {
        year: Number(full[1]),
        month: Number(full[2]),
        day: Number(full[3])
      };
    }

    const cn = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (cn) {
      return {
        year: Number(cn[1]),
        month: Number(cn[2]),
        day: Number(cn[3])
      };
    }

    const short = text.match(/^(\d{1,2})[./-](\d{1,2})$/);
    if (short) {
      return {
        year: new Date().getFullYear(),
        month: Number(short[1]),
        day: Number(short[2])
      };
    }

    const cnShort = text.match(/^(\d{1,2})月(\d{1,2})日?$/);
    if (cnShort) {
      return {
        year: new Date().getFullYear(),
        month: Number(cnShort[1]),
        day: Number(cnShort[2])
      };
    }

    return null;
  };

  const formatDateParts = ({ year, month, day }) =>
    `${String(year).padStart(4, "0")}${pad2(month)}${pad2(day)}`;

  const formatDateTimeParts = (date, clock) =>
    `${formatDateParts(date)}T${pad2(clock.hour)}${pad2(clock.minute)}${pad2(clock.second || 0)}`;

  const utcStamp = () => {
    const now = new Date();
    return [
      now.getUTCFullYear(),
      pad2(now.getUTCMonth() + 1),
      pad2(now.getUTCDate())
    ].join("") + `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  };

  const escapeICS = (value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");

  const foldICSLines = (lines) =>
    lines.flatMap((line) => {
      if (line.length <= 75) {
        return [line];
      }
      const chunks = [];
      let remaining = line;
      while (remaining.length > 75) {
        chunks.push(remaining.slice(0, 75));
        remaining = ` ${remaining.slice(75)}`;
      }
      chunks.push(remaining);
      return chunks;
    }).join("\r\n");

  const downloadTextFile = (filename, text, mimeType) => {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const activityCard = (activity) => {
    const code = clean(activity["代号"]) || "—";
    const name = clean(activity["活动名称"]) || "未命名活动";
    const status = clean(activity["状态"]) || "未分类";
    const type = clean(activity["活动类型"]) || "未分类";
    const owner = clean(activity["总负责人"]) || "待定";
    const location = clean(activity["地点"]);
    const detail = clean(activity["详情"]);
    const isAssigned = status === "已分工";
    const taskDetails = isAssigned ? taskDetailsForActivity(activity) : [];

    let taskDetailsHTML = "";
    if (isAssigned) {
      if (taskDetails.length) {
        taskDetailsHTML = `
          <div class="task-details">
            <div class="task-details-head">
              分工细节
              <span>${taskDetails.length} 项</span>
            </div>
            <div class="task-list">${taskDetails.map(taskItem).join("")}</div>
          </div>
        `;
      } else {
        taskDetailsHTML = `
          <div class="task-details empty">暂无分工明细</div>
        `;
      }
    }

    return `
      <article class="activity-card">
        <div class="card-top">
          <span class="code">${escapeHTML(code)}</span>
          <div class="badges">
            <span class="badge status">${escapeHTML(status)}</span>
            <span class="badge type">${escapeHTML(type)}</span>
          </div>
        </div>
        <h3>${escapeHTML(name)}</h3>
        ${detail ? `<p class="detail">${escapeHTML(detail)}</p>` : ""}
        ${taskDetailsHTML}
        <dl class="meta">
          <div>
            <dt>总负责人</dt>
            <dd>${escapeHTML(owner)}</dd>
          </div>
          <div>
            <dt>预计时间</dt>
            <dd>${escapeHTML(activityTimeText(activity))}</dd>
          </div>
          ${location ? `
            <div>
              <dt>地点</dt>
              <dd>${escapeHTML(location)}</dd>
            </div>
          ` : ""}
        </dl>
      </article>
    `;
  };

  const groupActivities = (activities, mode) => {
    const groups = new Map();
    for (const activity of sortActivities(activities)) {
      const key = mode === "type"
        ? clean(activity["活动类型"]) || "未分类"
        : clean(activity["状态"]) || "未分类";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(activity);
    }
    return groups;
  };

  const renderActivities = () => {
    const groups = state.activityGroups;
    if (!groups.length) {
      return emptyState("请在 data/activities/ 目录放置活动分组后刷新。");
    }

    const selectedGroup = getGroupById(state.activityGroupId);
    const visibleActivities = selectedGroup ? selectedGroup.activities : [];
    if (!visibleActivities.length) {
      return `
        <div class="toolbar">
          <div class="segmented" aria-label="活动阶段">
            ${groups.map((group) => `
              <button type="button" data-group="${escapeHTML(group.id)}" class="${state.activityGroupId === group.id ? "active" : ""}">${escapeHTML(group.label)}</button>
            `).join("")}
          </div>
          <div class="segmented" aria-label="分列方式">
            <button type="button" data-mode="status" class="${state.filterMode === "status" ? "active" : ""}">按状态分列</button>
            <button type="button" data-mode="type" class="${state.filterMode === "type" ? "active" : ""}">按活动类型分列</button>
          </div>
          <span class="count-pill">${escapeHTML(selectedGroup ? selectedGroup.label : "活动")} · 0 项</span>
        </div>
        ${emptyState("当前阶段暂时没有活动。")}
      `;
    }
    const groupsHTML = [...groupActivities(visibleActivities, state.filterMode).entries()].map(([name, activities]) => `
      <section class="group">
        <h2>${escapeHTML(name)}</h2>
        <span class="group-count">${activities.length}</span>
      </section>
      <div class="activity-grid">
        ${activities.map(activityCard).join("")}
      </div>
    `).join("");

    return `
      <div class="toolbar">
        <div class="segmented" aria-label="活动阶段">
          ${groups.map((group) => `
            <button type="button" data-group="${escapeHTML(group.id)}" class="${state.activityGroupId === group.id ? "active" : ""}">${escapeHTML(group.label)}</button>
          `).join("")}
        </div>
        <div class="segmented" aria-label="分列方式">
          <button type="button" data-mode="status" class="${state.filterMode === "status" ? "active" : ""}">按状态分列</button>
          <button type="button" data-mode="type" class="${state.filterMode === "type" ? "active" : ""}">按活动类型分列</button>
        </div>
        <span class="count-pill">${escapeHTML(selectedGroup ? selectedGroup.label : "活动")} · 共 ${visibleActivities.length} 项</span>
      </div>
      ${groupsHTML}
    `;
  };

  const buildTaskCalendarEvent = (activity, source) => {
    const date = {
      year: new Date().getFullYear(),
      month: toNumber(activity["预计月份(Y)"]),
      day: toNumber(activity["预计日期(D)"])
    };

    if (!date.month || !date.day) {
      return null;
    }

    const clock = parseClock(activity["开始时间(H)"]);
    const code = clean(activity["代号"]) || "—";
    const title = clean(activity["活动名称"]) || "未命名活动";
    const location = clean(activity["地点"]);
    const detail = clean(activity["详情"]);
    const status = clean(activity["状态"]);
    const start = clock ? formatDateTimeParts(date, clock) : formatDateParts(date);
    const end = clock
      ? null
      : formatDateParts(addDays(date.year, date.month, date.day, 1));

    return {
      id: `${source.id}:${code}:${date.year}-${pad2(date.month)}-${pad2(date.day)}`,
      sourceId: source.id,
      sourceLabel: source.label,
      title,
      code,
      year: date.year,
      month: date.month,
      day: date.day,
      allDay: !clock,
      start,
      end,
      location,
      detail,
      status,
      summary: `${code} · ${title}`,
      sortTime: clock ? ((clock.hour * 60) + clock.minute) : 0
    };
  };

  const normalizeExternalEvent = (record, source) => {
    const date = parseFlexibleDate(
      record.date || record.日期 || record["日期(D)"] || record["日期"] || record.when
    );
    if (!date) {
      return null;
    }

    const startClock = parseClock(record.startTime || record.开始时间 || record["开始时间(H)"]);
    const endClock = parseClock(record.endTime || record.结束时间 || record["结束时间(H)"]);
    const title = clean(record.title || record.标题 || record.name || record.名称) || "未命名事件";
    const location = clean(record.location || record.地点);
    const notes = clean(record.notes || record.备注 || record.detail || record.说明);
    const allDayValue = record.allDay ?? record.全天;
    const allDay = typeof allDayValue === "boolean" ? allDayValue : !startClock;
    const idSeed = clean(record.id || record.代号 || title);
    const startClockValue = startClock || { hour: 0, minute: 0, second: 0 };
    const startDateTime = new Date(
      date.year,
      date.month - 1,
      date.day,
      startClockValue.hour,
      startClockValue.minute,
      startClockValue.second
    );
    const endDateTime = new Date(startDateTime.getTime());
    if (!endClock) {
      endDateTime.setHours(endDateTime.getHours() + 1);
    }
    const start = allDay
      ? formatDateParts(date)
      : formatDateTimeParts(date, startClockValue);
    const end = allDay
      ? formatDateParts(addDays(date.year, date.month, date.day, 1))
      : endClock
        ? formatDateTimeParts(date, endClock)
        : formatDateTimeParts(
            {
              year: endDateTime.getFullYear(),
              month: endDateTime.getMonth() + 1,
              day: endDateTime.getDate()
            },
            {
              hour: endDateTime.getHours(),
              minute: endDateTime.getMinutes(),
              second: endDateTime.getSeconds()
            }
          );

    return {
      id: `${source.id}:${idSeed}:${date.year}-${pad2(date.month)}-${pad2(date.day)}`,
      sourceId: source.id,
      sourceLabel: source.label,
      title,
      year: date.year,
      month: date.month,
      day: date.day,
      allDay,
      start,
      end,
      location,
      detail: notes,
      summary: title,
      sortTime: allDay ? 0 : ((startClock ? startClock.hour : 0) * 60) + (startClock ? startClock.minute : 0)
    };
  };

  const loadCalendarSourceManifest = async () => {
    const fallback = [
      {
        id: "tasks",
        label: "任务带入",
        kind: "activity",
        default: true,
        includeInCalendar: true,
        includeInContribution: true
      },
      {
        id: "external",
        label: "外部导入",
        kind: "file",
        file: "external.json",
        default: true,
        includeInCalendar: true,
        includeInContribution: false
      }
    ];

    try {
      const manifest = await fetchJSON("data/calendar/index.json");
      if (Array.isArray(manifest)) {
        return manifest;
      }
      if (manifest && Array.isArray(manifest.sources)) {
        return manifest.sources;
      }
    } catch (error) {
      // 使用默认来源。
    }

    return fallback;
  };

  const loadExternalCalendarEvents = async (source) => {
    const files = [];
    if (Array.isArray(source.files)) {
      files.push(...source.files);
    }
    if (source.file) {
      files.push(source.file);
    }
    if (!files.length) {
      files.push("external.json");
    }

    const items = [];
    for (const file of files) {
      try {
        const path = joinSitePath("data/calendar/", file);
        const data = await fetchJSON(path);
        items.push(...normalizeArray(data).filter(hasContent));
      } catch (error) {
        // 外部日历文件缺失时跳过，避免影响其他来源。
      }
    }

    return items.map((record) => normalizeExternalEvent(record, source)).filter(Boolean);
  };

  const loadCalendarSources = async () => {
    const sourceConfigs = await loadCalendarSourceManifest();
    return Promise.all(sourceConfigs.map(async (source) => {
      const normalized = {
        id: clean(source.id) || clean(source.label) || "未命名",
        label: clean(source.label) || clean(source.id) || "未命名",
        kind: clean(source.kind) || "file",
        default: source.default === true,
        includeInCalendar: source.includeInCalendar !== false,
        includeInContribution: source.includeInContribution !== false,
        color: clean(source.color) || "",
        file: clean(source.file) || "",
        files: Array.isArray(source.files) ? source.files.map(String).filter(Boolean) : []
      };

      if (normalized.kind === "activity") {
        return {
          ...normalized,
          events: calendarActivities()
            .map((activity) => buildTaskCalendarEvent(activity, normalized))
            .filter(Boolean)
        };
      }

      return {
        ...normalized,
        events: await loadExternalCalendarEvents(normalized)
      };
    }));
  };

  const selectedCalendarSources = () =>
    state.calendarSources.filter((source) => state.calendarSourceIds.includes(source.id));

  const selectedCalendarEvents = () =>
    selectedCalendarSources()
      .filter((source) => source.includeInCalendar !== false)
      .flatMap((source) => source.events);

  const eventSortValue = (event) =>
    (((event.month || 0) * 100) + (event.day || 0)) * 1000 + (event.sortTime || 0);

  const buildICS = (events) => {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BETA-SDC//Activity List//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    for (const event of events) {
      const uid = `${event.id || event.sourceId}-${event.year}-${pad2(event.month)}-${pad2(event.day)}@beta-sdc`;
      const summary = escapeICS(event.summary || event.title || "未命名事件");
      const descriptionParts = [
        event.sourceLabel ? `来源：${event.sourceLabel}` : "",
        event.code ? `代号：${event.code}` : "",
        event.status ? `状态：${event.status}` : "",
        event.detail ? `备注：${event.detail}` : ""
      ].filter(Boolean);
      const description = escapeICS(descriptionParts.join("\n"));
      const location = event.location ? escapeICS(event.location) : "";

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${escapeICS(uid)}`);
      lines.push(`DTSTAMP:${utcStamp()}`);
      if (event.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${event.start}`);
        lines.push(`DTEND;VALUE=DATE:${event.end}`);
      } else {
        lines.push(`DTSTART:${event.start}`);
        lines.push(`DTEND:${event.end}`);
      }
      lines.push(`SUMMARY:${summary}`);
      if (description) {
        lines.push(`DESCRIPTION:${description}`);
      }
      if (location) {
        lines.push(`LOCATION:${location}`);
      }
      lines.push(`CATEGORIES:${escapeICS(event.sourceLabel || "活动")}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return foldICSLines(lines);
  };

  const exportSelectedCalendar = () => {
    const events = selectedCalendarEvents().sort((a, b) => eventSortValue(a) - eventSortValue(b));
    if (!events.length) {
      return;
    }
    downloadTextFile("beta-activity-calendar.ics", buildICS(events), "text/calendar;charset=utf-8");
  };

  const renderCalendar = () => {
    const sources = selectedCalendarSources();
    if (!sources.length) {
      return `
        <div class="toolbar calendar-toolbar">
          <div class="calendar-sources">
            ${state.calendarSources.map((source) => `
              <label class="source-toggle">
                <input type="checkbox" data-source="${escapeHTML(source.id)}" ${state.calendarSourceIds.includes(source.id) ? "checked" : ""}>
                <span>${escapeHTML(source.label)}</span>
                <em>${source.events.length}</em>
              </label>
            `).join("")}
          </div>
          <div class="calendar-actions">
            <button class="export-btn" id="exportCalendarBtn" type="button" disabled>⤓ 导出 Apple 日历</button>
          </div>
          <span class="count-pill">共 0 个事件</span>
        </div>
        ${emptyState("请至少勾选一个日历来源。")}
      `;
    }

    const events = selectedCalendarEvents().sort((a, b) => eventSortValue(a) - eventSortValue(b));
    if (!events.length) {
      return `
        <div class="toolbar calendar-toolbar">
          <div class="calendar-sources">
            ${state.calendarSources.map((source) => `
              <label class="source-toggle">
                <input type="checkbox" data-source="${escapeHTML(source.id)}" ${state.calendarSourceIds.includes(source.id) ? "checked" : ""}>
                <span>${escapeHTML(source.label)}</span>
                <em>${source.events.length}</em>
              </label>
            `).join("")}
          </div>
          <div class="calendar-actions">
            <button class="export-btn" id="exportCalendarBtn" type="button" disabled>⤓ 导出 Apple 日历</button>
          </div>
          <span class="count-pill">共 0 个事件</span>
        </div>
        ${emptyState("当前勾选的日历来源没有可展示的事件。")}
      `;
    }

    const months = new Map();
    for (const event of events) {
      const month = event.month;
      if (!months.has(month)) {
        months.set(month, []);
      }
      months.get(month).push(event);
    }

    const monthCards = [...months.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([month, monthEvents]) => {
        const year = new Date().getFullYear();
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstWeekday = new Date(year, month - 1, 1).getDay();
        const offset = (firstWeekday + 6) % 7;
        const byDay = new Map();

        for (const event of monthEvents) {
          const day = event.day;
          if (!byDay.has(day)) {
            byDay.set(day, []);
          }
          byDay.get(day).push(event);
        }

        const cells = [];
        for (let i = 0; i < offset; i += 1) {
          cells.push('<div class="calendar-day outside" aria-hidden="true"></div>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const dayEvents = byDay.get(day) || [];
          cells.push(`
            <div class="calendar-day">
              <span class="day-number">${day}</span>
              ${dayEvents.map((event) => `
                <div class="cal-event source-${escapeHTML(event.sourceId)}" title="${escapeHTML(event.title || "")}">
                  <span class="event-code">${escapeHTML(event.code || "—")}</span>
                  <span class="event-name"> · ${escapeHTML(event.title || "")}</span>
                </div>
              `).join("")}
            </div>
          `);
        }

        return `
          <section class="month-card">
            <div class="month-head">
              <h2>${month}月</h2>
              <span>${monthEvents.length} 项活动</span>
            </div>
            <div class="calendar-grid">
              ${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}
              ${cells.join("")}
            </div>
          </section>
        `;
      });

    return `
      <div class="toolbar calendar-toolbar">
        <div class="calendar-sources">
          ${state.calendarSources.map((source) => `
            <label class="source-toggle">
              <input type="checkbox" data-source="${escapeHTML(source.id)}" ${state.calendarSourceIds.includes(source.id) ? "checked" : ""}>
              <span>${escapeHTML(source.label)}</span>
              <em>${source.events.length}</em>
            </label>
          `).join("")}
        </div>
        <div class="calendar-actions">
          <button class="export-btn" id="exportCalendarBtn" type="button">⤓ 导出 Apple 日历</button>
        </div>
        <span class="count-pill">共 ${events.length} 个事件</span>
      </div>
      ${monthCards.join("")}
    `;
  };

  const buildContribution = () => {
    const members = new Map();
    const ensure = (name) => {
      if (!members.has(name)) {
        members.set(name, { name, total: 0, task: 0 });
      }
      return members.get(name);
    };

    for (const activity of contributionActivities()) {
      const owner = clean(activity["总负责人"]);
      if (owner) {
        ensure(owner).total += 1;
      }
    }

    for (const task of state.tasks) {
      const owner = clean(task["负责人"]);
      if (owner) {
        ensure(owner).task += 1;
      }
    }

    return [...members.values()]
      .filter((member) => member.total > 0 || member.task > 0)
      .sort((a, b) => {
        const diff = (b.total + b.task) - (a.total + a.task);
        if (diff !== 0) {
          return diff;
        }
        return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
      });
  };

  const renderContribution = () => {
    const members = buildContribution();
    if (!members.length) {
      return emptyState("当前没有可统计的总负责人或分工负责人。");
    }

    const totalOwnerCount = members.reduce((sum, member) => sum + member.total, 0);
    const totalTaskCount = members.reduce((sum, member) => sum + member.task, 0);
    const maxCount = Math.max(
      1,
      ...members.map((member) => member.total + member.task)
    );

    const columns = members.map((member) => {
      const totalPercent = member.total / maxCount * 100;
      const taskPercent = member.task / maxCount * 100;
      const showTotalLabel = totalPercent >= 9;
      const showTaskLabel = taskPercent >= 9;

      return `
        <div class="member-col" title="${escapeHTML(member.name)}：总负责人 ${member.total} 次，分工负责人 ${member.task} 次">
          <div class="bar" role="img" aria-label="${escapeHTML(member.name)}：总负责人 ${member.total} 次，分工负责人 ${member.task} 次">
            ${member.task ? `<div class="bar-segment blue" style="height:${taskPercent}%">${showTaskLabel ? member.task : ""}</div>` : ""}
            ${member.total ? `<div class="bar-segment red" style="height:${totalPercent}%">${showTotalLabel ? member.total : ""}</div>` : ""}
          </div>
          <div class="member-name">${escapeHTML(member.name)}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="stats-grid">
        <div class="stat-card red">
          <span>总负责人次数</span>
          <strong>${totalOwnerCount}</strong>
        </div>
        <div class="stat-card blue">
          <span>分工负责人次数</span>
          <strong>${totalTaskCount}</strong>
        </div>
        <div class="stat-card">
          <span>参与成员</span>
          <strong>${members.length}</strong>
        </div>
      </div>
      <section class="chart-card">
        <div class="chart-head">
          <h2>成员贡献堆叠图</h2>
          <div class="legend" aria-label="图例">
            <span><i class="red"></i>总负责人</span>
            <span><i class="blue"></i>分工负责人</span>
          </div>
        </div>
        <div class="chart-scroll">
          <div class="bar-chart">${columns}</div>
        </div>
      </section>
    `;
  };

  const updateNavigation = () => {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const active = link.dataset.nav === currentPage();
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const render = () => {
    const page = currentPage();
    const body = page === "activities"
      ? renderActivities()
      : page === "calendar"
        ? renderCalendar()
        : renderContribution();

    app.innerHTML = pageIntro(page) + body;
    updateNavigation();
    document.title = `${pageMeta[page].title} · 西湖大学β书院活动中心`;
  };

  const showLoading = () => {
    app.innerHTML = `
      <div class="state-card">
        <div>
          <div class="spinner"></div>
          <p>正在读取活动与分工数据…</p>
        </div>
      </div>
    `;
  };

  const showError = (error) => {
    app.innerHTML = `
      <div class="state-card">
        <div>
          <h2>数据读取失败</h2>
          <p>${escapeHTML(error.message || "未知错误")}</p>
          <p>请将网站部署到 GitHub Pages，或使用本地静态服务器打开。直接双击页面 HTML 时，浏览器通常会阻止读取同目录 JSON 文件。</p>
          <button class="retry-btn" id="retryBtn" type="button">重试</button>
        </div>
      </div>
    `;
  };

  const loadData = async () => {
    const [activityGroups, tasks] = await Promise.all([
      loadActivityGroups(),
      loadTaskFiles()
    ]);

    state.activityGroups = activityGroups.map((group) => ({
      ...group,
      activities: sortActivities(group.activities)
    }));
    state.activityGroupId =
      state.activityGroups.find((group) => group.default)?.id ||
      state.activityGroups.find((group) => group.id === "todo")?.id ||
      state.activityGroups[0]?.id ||
      "";
    state.tasks = tasks;
    state.calendarSources = await loadCalendarSources();
    state.calendarSourceIds = state.calendarSources
      .filter((source) => source.default)
      .map((source) => source.id);
    if (!state.calendarSourceIds.length) {
      state.calendarSourceIds = state.calendarSources.map((source) => source.id);
    }

    if (!state.activityGroups.length) {
      throw new Error("data/activities/index.json 中没有可用的活动数据。");
    }
  };

  const init = async () => {
    showLoading();
    try {
      await loadData();
      render();
    } catch (error) {
      showError(error);
    }
  };

  document.addEventListener("click", (event) => {
    const refreshButton = event.target.closest("#refreshBtn");
    if (refreshButton) {
      init();
      return;
    }

    const retryButton = event.target.closest("#retryBtn");
    if (retryButton) {
      init();
      return;
    }

    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) {
      state.filterMode = modeButton.dataset.mode;
      render();
    }

    const groupButton = event.target.closest("[data-group]");
    if (groupButton) {
      state.activityGroupId = groupButton.dataset.group;
      render();
    }

    const exportButton = event.target.closest("#exportCalendarBtn");
    if (exportButton) {
      exportSelectedCalendar();
    }
  });

  document.addEventListener("change", (event) => {
    const sourceToggle = event.target.closest("[data-source]");
    if (!sourceToggle) {
      return;
    }

    const sourceId = sourceToggle.dataset.source;
    if (!sourceId) {
      return;
    }

    if (sourceToggle.checked) {
      if (!state.calendarSourceIds.includes(sourceId)) {
        state.calendarSourceIds = [...state.calendarSourceIds, sourceId];
      }
    } else {
      state.calendarSourceIds = state.calendarSourceIds.filter((id) => id !== sourceId);
    }

    if (currentPage() === "calendar") {
      render();
    }
  });

  init();
})();
