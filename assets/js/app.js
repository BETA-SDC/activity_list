(function () {
  "use strict";

  const app = document.getElementById("app");
  const MAX_TASK_FILES = 200;

  const state = {
    activityGroups: [],
    tasks: [],
    activityGroupId: "todo",
    filterMode: "status"
  };

  const clean = (value) => (typeof value === "string" ? value.trim() : "");

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
    const url = `${path}?v=${Date.now()}`;
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
          const path = name.startsWith("./")
            ? name
            : `${basePath}${name}`;
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
      "./data/任务分工/",
      "./data/任务分工/index.json",
      (i) => `./data/任务分工/任务分工-P${i}.json`
    );
  }

  async function loadActivityGroups() {
    const manifestPath = "./data/activities/index.json";
    const manifest = await fetchJSON(manifestPath);
    const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];

    if (!groups.length) {
      throw new Error("data/activities/index.json 中没有可用的活动分组。");
    }

    const loadedGroups = await Promise.all(groups.map(async (group) => {
      const files = Array.isArray(group.files) ? group.files : [];
      const activities = [];

      for (const file of files) {
        const path = file.startsWith("./")
          ? file
          : `./data/activities/${file}`;
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
      subtitle: "仅展示待办和已完成中已填写预计日期（D）的活动。"
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

  const activeActivities = () =>
    state.activityGroups
      .filter((group) => group.includeInCalendar || group.includeInContribution)
      .flatMap((group) => group.activities);

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

  const datedActivities = () =>
    sortActivities(
      activeActivities().filter((activity) =>
        clean(activity["预计月份(Y)"]) && clean(activity["预计日期(D)"])
      )
    );

  const renderCalendar = () => {
    const dated = datedActivities();
    if (!dated.length) {
      return emptyState("当前没有填写预计日期（D）的活动。");
    }

    const months = new Map();
    for (const activity of dated) {
      const month = toNumber(activity["预计月份(Y)"]);
      if (!months.has(month)) {
        months.set(month, []);
      }
      months.get(month).push(activity);
    }

    const monthCards = [...months.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([month, activities]) => {
        const year = new Date().getFullYear();
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstWeekday = new Date(year, month - 1, 1).getDay();
        const offset = (firstWeekday + 6) % 7;
        const byDay = new Map();

        for (const activity of activities) {
          const day = toNumber(activity["预计日期(D)"]);
          if (!byDay.has(day)) {
            byDay.set(day, []);
          }
          byDay.get(day).push(activity);
        }

        const cells = [];
        for (let i = 0; i < offset; i += 1) {
          cells.push('<div class="calendar-day outside" aria-hidden="true"></div>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const events = byDay.get(day) || [];
          cells.push(`
            <div class="calendar-day">
              <span class="day-number">${day}</span>
              ${events.map((event) => `
                <div class="cal-event" title="${escapeHTML(event["活动名称"] || "")}">
                  <span class="event-code">${escapeHTML(clean(event["代号"]) || "—")}</span>
                  <span class="event-name"> · ${escapeHTML(clean(event["活动名称"]))}</span>
                </div>
              `).join("")}
            </div>
          `);
        }

        return `
          <section class="month-card">
            <div class="month-head">
              <h2>${month}月</h2>
              <span>${activities.length} 项活动</span>
            </div>
            <div class="calendar-grid">
              ${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}
              ${cells.join("")}
            </div>
          </section>
        `;
      });

    return monthCards.join("");
  };

  const buildContribution = () => {
    const members = new Map();
    const ensure = (name) => {
      if (!members.has(name)) {
        members.set(name, { name, total: 0, task: 0 });
      }
      return members.get(name);
    };

    for (const activity of activeActivities()) {
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
          <p>请将网站部署到 GitHub Pages，或使用本地静态服务器打开。直接双击 index.html 时，浏览器通常会阻止读取同目录 JSON 文件。</p>
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
  });

  init();
})();
