(function () {
  "use strict";

  const AL = window.ActivityList = window.ActivityList || {};
  const app = document.getElementById("app");

  const state = {
    activityGroups: [],
    tasks: [],
    calendarSources: [],
    calendarSourceIds: [],
    filterMode: "status",
    statusFilter: "待分工",
    showArchived: false,
    activityEditorOpen: false,
    activityEditorMode: "create",
    activityEditorDraft: AL.activityEditorDefaults()
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
    state.tasks = tasks;
    state.statusFilter = AL.activeStatusFilter(state);
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

    const statusButton = event.target.closest("[data-status]");
    if (statusButton) {
      state.statusFilter = statusButton.dataset.status || "待分工";
      AL.render(state, app);
    }

    const archiveToggle = event.target.closest("[data-show-archived]");
    if (archiveToggle) {
      state.showArchived = archiveToggle.checked;
      AL.render(state, app);
    }

    const openEditorButton = event.target.closest("[data-open-activity-editor]");
    if (openEditorButton) {
      state.activityEditorMode = "create";
      state.activityEditorDraft = AL.activityEditorDefaults();
      state.activityEditorOpen = true;
      AL.render(state, app);
      return;
    }

    const editButton = event.target.closest("[data-edit-activity]");
    if (editButton) {
      const code = editButton.dataset.editActivity;
      const activity = AL.allActivities(state).find((item) => AL.clean(item["代号"]) === code);
      state.activityEditorMode = "edit";
      state.activityEditorDraft = AL.activityEditorDraftFrom(activity || {});
      state.activityEditorOpen = true;
      AL.render(state, app);
      return;
    }

    const closeEditorButton = event.target.closest("[data-close-activity-editor]");
    if (closeEditorButton) {
      state.activityEditorOpen = false;
      AL.render(state, app);
      return;
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

  document.addEventListener("input", (event) => {
    const field = event.target.closest("[data-activity-field]");
    if (!field || !state.activityEditorOpen) {
      return;
    }

    const key = field.dataset.activityField;
    if (!key) {
      return;
    }

    state.activityEditorDraft = {
      ...state.activityEditorDraft,
      [key]: field.value
    };
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest(".activity-editor-form");
    if (!form) {
      return;
    }
    event.preventDefault();
  });

  init();
})();
