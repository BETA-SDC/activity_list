(function () {
  "use strict";

  const AL = window.ActivityList = window.ActivityList || {};

  AL.MAX_TASK_FILES = 200;

  AL.clean = (value) => (typeof value === "string" ? value.trim() : "");

  AL.SITE_BASE = location.pathname.includes("/pages/") ? "../" : "./";

  const stripLeadingDotSlash = (value) => String(value || "").replace(/^\.\//, "");

  const isRemotePath = (value) => /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("/");

  AL.resolveSitePath = (value) => {
    const path = stripLeadingDotSlash(AL.clean(value));
    if (!path) {
      return path;
    }
    if (isRemotePath(path) || path.startsWith("../")) {
      return path;
    }
    return `${AL.SITE_BASE}${path}`;
  };

  AL.joinSitePath = (basePath, childPath) => {
    const base = stripLeadingDotSlash(AL.clean(basePath));
    const child = stripLeadingDotSlash(AL.clean(childPath));
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

  AL.toNumber = (value) => {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  };

  AL.normalizeArray = (value) => (Array.isArray(value) ? value : [value]);

  AL.hasContent = (item) =>
    item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length > 0;

  AL.escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  AL.currentPage = () => {
    const page = AL.clean(document.body.dataset.page);
    return ["activities", "calendar", "contribution"].includes(page) ? page : "activities";
  };

  AL.fetchJSON = async (path) => {
    const url = `${AL.resolveSitePath(path)}?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`无法读取 ${path}（HTTP ${response.status}）`);
    }
    return response.json();
  };

  AL.fetchText = async (path) => {
    const url = `${AL.resolveSitePath(path)}?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`无法读取 ${path}（HTTP ${response.status}）`);
    }
    return response.text();
  };

  AL.loadManifestPaths = async (path) => {
    try {
      const manifest = await AL.fetchJSON(path);
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
  };

  AL.loadGroupedFiles = async (basePath, manifestPath, fallbackPattern) => {
    const manifestPaths = await AL.loadManifestPaths(manifestPath);

    if (manifestPaths && manifestPaths.length) {
      const settled = await Promise.allSettled(
        manifestPaths.map(async (name) => {
          const path = AL.joinSitePath(basePath, name);
          const data = await AL.fetchJSON(path);
          return AL.normalizeArray(data).filter(AL.hasContent);
        })
      );

      return settled
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value);
    }

    const items = [];
    let consecutiveMisses = 0;

    for (let i = 1; i <= AL.MAX_TASK_FILES; i += 1) {
      const path = fallbackPattern(i);
      try {
        const data = await AL.fetchJSON(path);
        items.push(...AL.normalizeArray(data).filter(AL.hasContent));
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

  AL.loadTaskFiles = async () =>
    AL.loadGroupedFiles(
      "data/任务分工/",
      "data/任务分工/index.json",
      (i) => `data/任务分工/任务分工-P${i}.json`
    );

  AL.loadActivityGroups = async () => {
    const manifest = await AL.fetchJSON("data/activities/index.json");
    const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];

    if (!groups.length) {
      throw new Error("data/activities/index.json 中没有可用的活动分组。");
    }

    const loadedGroups = await Promise.all(groups.map(async (group) => {
      const files = Array.isArray(group.files) ? group.files : [];
      const activities = [];

      for (const file of files) {
        const path = AL.joinSitePath("data/activities/", file);
        const data = await AL.fetchJSON(path);
        activities.push(...AL.normalizeArray(data).filter(AL.hasContent));
      }

      return {
        id: AL.clean(group.id) || AL.clean(group.label) || "未命名",
        label: AL.clean(group.label) || AL.clean(group.id) || "未命名",
        includeInCalendar: group.includeInCalendar !== false,
        includeInContribution: group.includeInContribution !== false,
        default: group.default === true,
        activities
      };
    }));

    return loadedGroups;
  };

  AL.sortActivities = (activities) =>
    [...activities].sort((a, b) => {
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

  AL.activityTimeText = (activity) => {
    const month = AL.clean(activity["预计月份(Y)"]);
    const day = AL.clean(activity["预计日期(D)"]);
    const hour = AL.clean(activity["开始时间(H)"]);

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

  AL.calendarActivities = (state) =>
    state.activityGroups
      .filter((group) => group.includeInCalendar)
      .flatMap((group) => group.activities);

  AL.contributionActivities = (state) =>
    state.activityGroups
      .filter((group) => group.includeInContribution)
      .flatMap((group) => group.activities);

  AL.pageMeta = {
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
})();
