(function () {
  "use strict";

  const AL = window.ActivityList = window.ActivityList || {};

  AL.pageIntro = (view) => {
    const meta = AL.pageMeta[view];
    return `
      <section class="intro">
        <div>
          <p class="eyebrow">Westlake Beta College Activity Center</p>
          <h1>${AL.escapeHTML(meta.title)}</h1>
          ${meta.subtitle ? `<p class="subtitle">${AL.escapeHTML(meta.subtitle)}</p>` : ""}
        </div>
        <button class="refresh-btn" id="refreshBtn" type="button">刷新数据</button>
      </section>
    `;
  };

  AL.visibleActivityGroups = (state) =>
    state.showArchived
      ? state.activityGroups
      : state.activityGroups.filter((group) => group.id !== "archive");

  AL.allActivities = (state) =>
    state.activityGroups.flatMap((group) => group.activities);

  AL.visibleActivities = (state) =>
    AL.visibleActivityGroups(state).flatMap((group) => group.activities);

  AL.statusChoices = (state) => {
    const preferred = ["待分工", "已分工"];
    const choices = new Set();
    for (const activity of AL.allActivities(state)) {
      const status = AL.clean(activity["状态"]);
      if (status && status !== "已归档") {
        choices.add(status);
      }
    }
    return [...preferred.filter((status) => choices.has(status)), ...[...choices].filter((status) => !preferred.includes(status))];
  };

  AL.activeStatusFilter = (state) => {
    const choices = AL.statusChoices(state);
    return choices.includes(state.statusFilter) ? state.statusFilter : (choices[0] || "待分工");
  };

  AL.activityEditorDefaults = () => ({
    "代号": "",
    "活动名称": "",
    "状态": "待分工",
    "建立规划时间": "",
    "详情": "",
    "活动类型": "",
    "总负责人": "",
    "预计月份(Y)": "",
    "预计日期(D)": "",
    "开始时间(H)": "",
    "地点": ""
  });

  AL.activityEditorDraftFrom = (activity) => ({
    ...AL.activityEditorDefaults(),
    ...Object.fromEntries(Object.entries(activity || {}).filter(([, value]) => value !== undefined && value !== null))
  });

  AL.activityEditorTitle = (state) =>
    state.activityEditorMode === "edit" ? "编辑活动卡片" : "新增活动卡片";

  AL.activityEditorHint = "保存会写回本地 data/activities 文件。";

  AL.activityEditorOptionList = () => ["待分工", "已分工", "已归档"];

  AL.activityEditorRequiredFields = () => new Set(["代号", "活动名称", "状态", "活动类型"]);

  AL.activityEditorField = (draft, key, label, type = "text", extra = "") => {
    const value = AL.clean(draft?.[key]);
    const id = `activity-field-${key.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "")}`;
    const required = AL.activityEditorRequiredFields().has(key);
    const labelHTML = required
      ? `${AL.escapeHTML(label)}<span class="required-mark" aria-hidden="true">*</span>`
      : AL.escapeHTML(label);
    if (type === "textarea") {
      return `
        <label class="form-field form-field-full" for="${id}">
          <span>${labelHTML}</span>
          <textarea id="${id}" data-activity-field="${AL.escapeHTML(key)}" rows="4" placeholder="请输入${AL.escapeHTML(label)}"${required ? " required" : ""}>${AL.escapeHTML(value)}</textarea>
        </label>
      `;
    }
    if (type === "select") {
      return `
        <label class="form-field" for="${id}">
          <span>${labelHTML}</span>
          <select id="${id}" data-activity-field="${AL.escapeHTML(key)}"${required ? " required" : ""}>
            ${AL.activityEditorOptionList().map((option) => `
              <option value="${AL.escapeHTML(option)}" ${option === value ? "selected" : ""}>${AL.escapeHTML(option)}</option>
            `).join("")}
          </select>
        </label>
      `;
    }
    return `
      <label class="form-field" for="${id}">
        <span>${labelHTML}</span>
        <input id="${id}" type="${type}" data-activity-field="${AL.escapeHTML(key)}" value="${AL.escapeHTML(value)}" placeholder="请输入${AL.escapeHTML(label)}"${required ? " required" : ""}${extra}>
      </label>
    `;
  };

  AL.activityEditorModal = (state) => {
    if (!state.activityEditorOpen) {
      return "";
    }

    const draft = state.activityEditorDraft || AL.activityEditorDefaults();
    const title = AL.activityEditorTitle(state);

    return `
      <div class="editor-backdrop" data-close-activity-editor></div>
      <section class="editor-modal" role="dialog" aria-modal="true" aria-labelledby="activityEditorTitle">
        <div class="editor-head">
          <div>
            <p class="editor-eyebrow">Activities</p>
            <h2 id="activityEditorTitle">${AL.escapeHTML(title)}</h2>
            <p class="editor-hint">${AL.escapeHTML(AL.activityEditorHint)}</p>
          </div>
          <button type="button" class="editor-close" data-close-activity-editor aria-label="关闭">×</button>
        </div>
        <form class="activity-editor-form" autocomplete="off">
          <div class="editor-grid">
            ${AL.activityEditorField(draft, "代号", "代号")}
            ${AL.activityEditorField(draft, "活动名称", "活动名称")}
            ${AL.activityEditorField(draft, "状态", "状态", "select")}
            ${AL.activityEditorField(draft, "活动类型", "活动类型")}
            ${AL.activityEditorField(draft, "总负责人", "总负责人")}
            ${AL.activityEditorField(draft, "详情", "详情", "textarea")}
            ${AL.activityEditorField(draft, "预计月份(Y)", "预计月份(Y)", "text")}
            ${AL.activityEditorField(draft, "预计日期(D)", "预计日期(D)", "text")}
            ${AL.activityEditorField(draft, "开始时间(H)", "开始时间(H)", "text")}
            ${AL.activityEditorField(draft, "地点", "地点")}
          </div>
          <div class="editor-footer">
            <div class="editor-note">红色 * 为必填项，未填不能提交。</div>
            <div class="editor-actions">
              <button type="button" class="secondary-btn" data-close-activity-editor>取消</button>
              <button type="submit" class="primary-btn">保存到本地</button>
            </div>
          </div>
        </form>
      </section>
    `;
  };

  AL.emptyState = (message) => `
    <div class="state-card">
      <div>
        <h2>暂时没有可显示的内容</h2>
        <p>${AL.escapeHTML(message)}</p>
      </div>
    </div>
  `;

  AL.taskTimeText = (task) => {
    const start = AL.clean(task["预计开始时间"]);
    const end = AL.clean(task["预计结束时间"]);

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

  AL.taskDetailsForActivity = (state, activity) => {
    const code = AL.clean(activity["代号"]);
    const name = AL.clean(activity["活动名称"]);
    let matches = state.tasks.filter((task) => AL.clean(task["代号"]) === code);

    if (!matches.length && name) {
      matches = state.tasks.filter((task) => AL.clean(task["活动名称"]) === name);
    }

    return matches.filter((task) =>
      AL.clean(task["分工"]) || AL.clean(task["负责人"]) || AL.taskTimeText(task)
    );
  };

  AL.taskItem = (task) => {
    const work = AL.clean(task["分工"]) || "未填写分工";
    const owner = AL.clean(task["负责人"]) || "负责人待定";
    const time = AL.taskTimeText(task);

    return `
      <div class="task-item">
        <div class="task-work">${AL.escapeHTML(work)}</div>
        ${owner ? `<div class="task-owner">负责人：${AL.escapeHTML(owner)}</div>` : ""}
        ${time ? `<div class="task-time">时间：${AL.escapeHTML(time)}</div>` : ""}
      </div>
    `;
  };

  AL.getGroupById = (state, groupId) =>
    state.activityGroups.find((group) => group.id === groupId) || state.activityGroups[0] || null;

  AL.activityCard = (state, activity) => {
    const code = AL.clean(activity["代号"]) || "—";
    const name = AL.clean(activity["活动名称"]) || "未命名活动";
    const status = AL.clean(activity["状态"]) || "未分类";
    const planningTime = AL.clean(activity["建立规划时间"]);
    const type = AL.clean(activity["活动类型"]) || "未分类";
    const owner = AL.clean(activity["总负责人"]) || "待定";
    const location = AL.clean(activity["地点"]);
    const detail = AL.clean(activity["详情"]);
    const isAssigned = status === "已分工";
    const taskDetails = isAssigned ? AL.taskDetailsForActivity(state, activity) : [];

    let taskDetailsHTML = "";
    if (isAssigned) {
      if (taskDetails.length) {
        taskDetailsHTML = `
          <div class="task-details">
            <div class="task-details-head">
              分工细节
              <span>${taskDetails.length} 项</span>
            </div>
            <div class="task-list">${taskDetails.map(AL.taskItem).join("")}</div>
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
          <span class="code">${AL.escapeHTML(code)}</span>
          <div class="badges">
            <span class="badge status">${AL.escapeHTML(status)}</span>
            <span class="badge type">${AL.escapeHTML(type)}</span>
          </div>
        </div>
        <div class="card-title-row">
          <h3>${AL.escapeHTML(name)}</h3>
          <button type="button" class="card-edit-btn" data-edit-activity="${AL.escapeHTML(code)}">编辑</button>
        </div>
        ${detail ? `<p class="detail">${AL.escapeHTML(detail)}</p>` : ""}
        ${taskDetailsHTML}
        <dl class="meta">
          <div>
            <dt>总负责人</dt>
            <dd>${AL.escapeHTML(owner)}</dd>
          </div>
          ${planningTime ? `
            <div>
              <dt>建立规划时间</dt>
              <dd>${AL.escapeHTML(planningTime)}</dd>
            </div>
          ` : ""}
          <div>
            <dt>预计时间</dt>
            <dd>${AL.escapeHTML(AL.activityTimeText(activity))}</dd>
          </div>
          ${location ? `
            <div>
              <dt>地点</dt>
              <dd>${AL.escapeHTML(location)}</dd>
            </div>
          ` : ""}
        </dl>
      </article>
    `;
  };

  AL.groupActivities = (activities, mode) => {
    const sortedActivities = mode === "archive"
      ? AL.sortArchivedActivities(activities)
      : AL.sortActivities(activities);
    const groups = new Map();
    for (const activity of sortedActivities) {
      const key = mode === "type"
        ? AL.clean(activity["活动类型"]) || "未分类"
        : AL.clean(activity["状态"]) || "未分类";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(activity);
    }
    return groups;
  };

  AL.sortArchivedActivities = (activities) =>
    [...activities].sort((a, b) => {
      const aStamp = Date.parse(AL.clean(a["建立规划时间"]).replace(" ", "T")) || 0;
      const bStamp = Date.parse(AL.clean(b["建立规划时间"]).replace(" ", "T")) || 0;
      if (aStamp !== bStamp) {
        return aStamp - bStamp;
      }
      const aNum = AL.toNumber(a["代号"]);
      const bNum = AL.toNumber(b["代号"]);
      if (aNum !== bNum) {
        return aNum - bNum;
      }
      return String(a["活动名称"] || "").localeCompare(
        String(b["活动名称"] || ""),
        "zh-CN",
        { numeric: true }
      );
    });

  AL.renderActivities = (state) => {
    const groups = AL.visibleActivityGroups(state);
    if (!groups.length) {
      return AL.emptyState("请在 data/activities/ 目录放置活动分组后刷新。");
    }

    const statusChoices = AL.statusChoices(state);
    const activeStatusFilter = AL.activeStatusFilter(state);
    const allVisibleActivities = AL.allActivities(state);
    const archivedActivities = allVisibleActivities.filter((activity) => AL.clean(activity["状态"]) === "已归档");
    const activeActivities = allVisibleActivities.filter((activity) => AL.clean(activity["状态"]) !== "已归档");
    const filteredActivities = state.filterMode === "status" && activeStatusFilter
      ? activeActivities.filter((activity) => AL.clean(activity["状态"]) === activeStatusFilter)
      : activeActivities;
    const visibleActivities = state.filterMode === "archive"
      ? archivedActivities
      : state.showArchived
        ? [...filteredActivities, ...archivedActivities]
        : filteredActivities;
    const groupingMode = state.filterMode === "archive" ? "type" : state.filterMode;

    if (!visibleActivities.length) {
      return `
        <div class="toolbar">
          <div class="toolbar-stack">
            <div class="toolbar-row toolbar-main">
              <div class="segmented" aria-label="分列方式">
                <button type="button" data-mode="status" class="${state.filterMode === "status" ? "active" : ""}">按状态分列</button>
                <button type="button" data-mode="type" class="${state.filterMode === "type" ? "active" : ""}">按活动类型分列</button>
                <button type="button" data-mode="archive" class="${state.filterMode === "archive" ? "active" : ""}">已归档</button>
              </div>
              <label class="archive-toggle">
                <input type="checkbox" data-show-archived ${state.showArchived ? "checked" : ""}>
                <span>展示已归档</span>
              </label>
              <button type="button" class="toolbar-action" data-open-activity-editor>＋ 新增活动</button>
            </div>
            ${state.filterMode === "status" ? `
              <div class="segmented status-filter" aria-label="状态筛选">
                ${statusChoices.map((status) => `
                  <button type="button" data-status="${AL.escapeHTML(status)}" class="${activeStatusFilter === status ? "active" : ""}">${AL.escapeHTML(status)}</button>
                `).join("")}
              </div>
            ` : ""}
            <span class="count-pill">共 0 项</span>
          </div>
        </div>
        ${AL.emptyState("当前阶段暂时没有活动。")}
      `;
    }
    const groupsHTML = [...AL.groupActivities(visibleActivities, groupingMode).entries()].map(([name, activities]) => `
      <section class="group">
        <h2>${AL.escapeHTML(name)}</h2>
        <span class="group-count">${activities.length}</span>
      </section>
      <div class="activity-grid">
        ${activities.map((activity) => AL.activityCard(state, activity)).join("")}
      </div>
    `).join("");

    return `
      <div class="toolbar">
        <div class="toolbar-stack">
          <div class="toolbar-row toolbar-main">
            <div class="segmented" aria-label="分列方式">
              <button type="button" data-mode="status" class="${state.filterMode === "status" ? "active" : ""}">按状态分列</button>
              <button type="button" data-mode="type" class="${state.filterMode === "type" ? "active" : ""}">按活动类型分列</button>
              <button type="button" data-mode="archive" class="${state.filterMode === "archive" ? "active" : ""}">已归档</button>
            </div>
            <label class="archive-toggle">
              <input type="checkbox" data-show-archived ${state.showArchived ? "checked" : ""}>
              <span>展示已归档</span>
            </label>
            <button type="button" class="toolbar-action" data-open-activity-editor>＋ 新增活动</button>
          </div>
          ${state.filterMode === "status" ? `
            <div class="segmented status-filter" aria-label="状态筛选">
              ${statusChoices.map((status) => `
                <button type="button" data-status="${AL.escapeHTML(status)}" class="${activeStatusFilter === status ? "active" : ""}">${AL.escapeHTML(status)}</button>
              `).join("")}
            </div>
          ` : ""}
          <span class="count-pill">共 ${visibleActivities.length} 项</span>
        </div>
      </div>
      ${groupsHTML}
      ${AL.activityEditorModal(state)}
    `;
  };

  AL.renderCalendar = (state) => {
    const sources = AL.selectedCalendarSources(state);
    if (!sources.length) {
      return `
        <div class="toolbar calendar-toolbar">
          <div class="calendar-sources">
            ${state.calendarSources.map((source) => `
              <label class="source-toggle source-${AL.escapeHTML(source.id)}"${AL.sourceStyle(source)}>
                <input type="checkbox" data-source="${AL.escapeHTML(source.id)}" ${state.calendarSourceIds.includes(source.id) ? "checked" : ""}>
                <span>${AL.escapeHTML(source.label)}</span>
                <em>${source.events.length}</em>
              </label>
            `).join("")}
          </div>
          <div class="calendar-actions">
            <button class="export-btn" id="exportCalendarBtn" type="button" disabled>⤓ 导出 Apple 日历</button>
          </div>
          <span class="count-pill">共 0 个事件</span>
        </div>
        ${AL.emptyState("请至少勾选一个日历来源。")}
      `;
    }

    const events = AL.selectedCalendarEvents(state).sort((a, b) => AL.eventSortValue(a) - AL.eventSortValue(b));
    if (!events.length) {
      return `
        <div class="toolbar calendar-toolbar">
          <div class="calendar-sources">
            ${state.calendarSources.map((source) => `
              <label class="source-toggle source-${AL.escapeHTML(source.id)}"${AL.sourceStyle(source)}>
                <input type="checkbox" data-source="${AL.escapeHTML(source.id)}" ${state.calendarSourceIds.includes(source.id) ? "checked" : ""}>
                <span>${AL.escapeHTML(source.label)}</span>
                <em>${source.events.length}</em>
              </label>
            `).join("")}
          </div>
          <div class="calendar-actions">
            <button class="export-btn" id="exportCalendarBtn" type="button" disabled>⤓ 导出 Apple 日历</button>
          </div>
          <span class="count-pill">共 0 个事件</span>
        </div>
        ${AL.emptyState("当前勾选的日历来源没有可展示的事件。")}
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
                <div class="cal-event source-${AL.escapeHTML(event.sourceId)}"${AL.sourceStyle(event)} title="${AL.escapeHTML(event.title || "")}">
                  <span class="event-code">${AL.escapeHTML(event.code || "—")}</span>
                  <span class="event-name"> · ${AL.escapeHTML(event.title || "")}</span>
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
            <label class="source-toggle source-${AL.escapeHTML(source.id)}"${AL.sourceStyle(source)}>
              <input type="checkbox" data-source="${AL.escapeHTML(source.id)}" ${state.calendarSourceIds.includes(source.id) ? "checked" : ""}>
              <span>${AL.escapeHTML(source.label)}</span>
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

  AL.buildContribution = (state) => {
    const members = new Map();
    const ensure = (name) => {
      if (!members.has(name)) {
        members.set(name, { name, total: 0, task: 0 });
      }
      return members.get(name);
    };

    for (const activity of AL.contributionActivities(state)) {
      const owner = AL.clean(activity["总负责人"]);
      if (owner) {
        ensure(owner).total += 1;
      }
    }

    for (const task of state.tasks) {
      const owner = AL.clean(task["负责人"]);
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

  AL.renderContribution = (state) => {
    const members = AL.buildContribution(state);
    if (!members.length) {
      return AL.emptyState("当前没有可统计的总负责人或分工负责人。");
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
        <div class="member-col" title="${AL.escapeHTML(member.name)}：总负责人 ${member.total} 次，分工负责人 ${member.task} 次">
          <div class="bar" role="img" aria-label="${AL.escapeHTML(member.name)}：总负责人 ${member.total} 次，分工负责人 ${member.task} 次">
            ${member.task ? `<div class="bar-segment blue" style="height:${taskPercent}%">${showTaskLabel ? member.task : ""}</div>` : ""}
            ${member.total ? `<div class="bar-segment red" style="height:${totalPercent}%">${showTotalLabel ? member.total : ""}</div>` : ""}
          </div>
          <div class="member-name">${AL.escapeHTML(member.name)}</div>
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

  AL.updateNavigation = () => {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const active = link.dataset.nav === AL.currentPage();
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  AL.render = (state, app) => {
    const page = AL.currentPage();
    const body = page === "activities"
      ? AL.renderActivities(state)
      : page === "calendar"
        ? AL.renderCalendar(state)
        : AL.renderContribution(state);

    app.innerHTML = AL.pageIntro(page) + body;
    AL.updateNavigation();
    document.title = `${AL.pageMeta[page].title} · 西湖大学β书院活动中心`;
  };

  AL.showLoading = (app) => {
    app.innerHTML = `
      <div class="state-card">
        <div>
          <div class="spinner"></div>
          <p>正在读取活动与分工数据…</p>
        </div>
      </div>
    `;
  };

  AL.showError = (app, error) => {
    app.innerHTML = `
      <div class="state-card">
        <div>
          <h2>数据读取失败</h2>
          <p>${AL.escapeHTML(error.message || "未知错误")}</p>
          <p>请将网站部署到 GitHub Pages，或使用本地静态服务器打开。直接双击页面 HTML 时，浏览器通常会阻止读取同目录 JSON 文件。</p>
          <button class="retry-btn" id="retryBtn" type="button">重试</button>
        </div>
      </div>
    `;
  };
})();
