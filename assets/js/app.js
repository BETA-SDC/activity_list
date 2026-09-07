(function () {
  "use strict";

  const AL = window.ActivityList = window.ActivityList || {};
  const app = document.getElementById("app");

  const state = {
    activityGroups: [],
    tasks: [],
    calendarSources: [],
    calendarSourceIds: [],
    activityGroupId: "todo",
    filterMode: "status"
  };

  const loadData = async () => {
    const [activityGroups, tasks] = await Promise.all([
      AL.loadActivityGroups(),
      AL.loadTaskFiles()
    ]);

    state.activityGroups = activityGroups.map((group) => ({
      ...group,
      activities: AL.sortActivities(group.activities)
    }));
    state.activityGroupId =
      state.activityGroups.find((group) => group.default)?.id ||
      state.activityGroups.find((group) => group.id === "todo")?.id ||
      state.activityGroups[0]?.id ||
      "";
    state.tasks = tasks;
    state.calendarSources = await AL.loadCalendarSources(state);
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
    AL.showLoading(app);
    try {
      await loadData();
      AL.render(state, app);
    } catch (error) {
      AL.showError(app, error);
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
      AL.render(state, app);
    }

    const groupButton = event.target.closest("[data-group]");
    if (groupButton) {
      state.activityGroupId = groupButton.dataset.group;
      AL.render(state, app);
    }

    const exportButton = event.target.closest("#exportCalendarBtn");
    if (exportButton) {
      AL.exportSelectedCalendar(state);
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

    if (AL.currentPage() === "calendar") {
      AL.render(state, app);
    }
  });

  init();
})();
