(function () {
  "use strict";

  const AL = window.ActivityList = window.ActivityList || {};

  AL.pad2 = (value) => String(value).padStart(2, "0");

  AL.addDays = (year, month, day, delta) => {
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + delta);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  };

  AL.parseClock = (value) => {
    const match = AL.clean(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return null;
    }
    return {
      hour: Number(match[1]),
      minute: Number(match[2]),
      second: Number(match[3] || 0)
    };
  };

  AL.formatDateParts = ({ year, month, day }) =>
    `${String(year).padStart(4, "0")}${AL.pad2(month)}${AL.pad2(day)}`;

  AL.formatDateTimeParts = (date, clock) =>
    `${AL.formatDateParts(date)}T${AL.pad2(clock.hour)}${AL.pad2(clock.minute)}${AL.pad2(clock.second || 0)}`;

  AL.utcStamp = () => {
    const now = new Date();
    return [
      now.getUTCFullYear(),
      AL.pad2(now.getUTCMonth() + 1),
      AL.pad2(now.getUTCDate())
    ].join("") + `T${AL.pad2(now.getUTCHours())}${AL.pad2(now.getUTCMinutes())}${AL.pad2(now.getUTCSeconds())}Z`;
  };

  AL.escapeICS = (value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");

  AL.unescapeICS = (value) =>
    String(value ?? "")
      .replace(/\\n/gi, "\n")
      .replace(/\\;/g, ";")
      .replace(/\\,/g, ",")
      .replace(/\\\\/g, "\\");

  AL.unfoldICS = (text) =>
    String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n[ \t]/g, "");

  AL.parseICSTimestamp = (value, params = "") => {
    const text = AL.clean(value);
    if (!text) {
      return null;
    }

    const allDay = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(text);
    if (allDay) {
      const match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (!match) {
        return null;
      }
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        allDay: true
      };
    }

    const utc = text.endsWith("Z");
    const raw = utc ? text.slice(0, -1) : text;
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (!match) {
      return null;
    }

    const date = utc
      ? new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6])
      ))
      : new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6])
      );

    return {
      year: utc ? date.getUTCFullYear() : date.getFullYear(),
      month: (utc ? date.getUTCMonth() : date.getMonth()) + 1,
      day: utc ? date.getUTCDate() : date.getDate(),
      hour: utc ? date.getUTCHours() : date.getHours(),
      minute: utc ? date.getUTCMinutes() : date.getMinutes(),
      second: utc ? date.getUTCSeconds() : date.getSeconds(),
      allDay: false
    };
  };

  AL.parseICSFile = (text) => {
    const events = [];
    const lines = AL.unfoldICS(text).split("\n").map((line) => line.trimEnd()).filter(Boolean);
    let current = null;

    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        current = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (current) {
          events.push(current);
        }
        current = null;
        continue;
      }
      if (!current) {
        continue;
      }

      const colon = line.indexOf(":");
      if (colon < 0) {
        continue;
      }
      const head = line.slice(0, colon);
      const value = AL.unescapeICS(line.slice(colon + 1));
      const [name, ...params] = head.split(";");
      const key = name.toUpperCase();
      current[key] ||= [];
      current[key].push({ params: params.join(";"), value });
    }

    return events;
  };

  AL.buildEventFromICS = (event, source) => {
    const startEntry = event.DTSTART?.[0];
    if (!startEntry) {
      return null;
    }

    const startStamp = AL.parseICSTimestamp(startEntry.value, startEntry.params);
    if (!startStamp) {
      return null;
    }

    const endEntry = event.DTEND?.[0];
    const endStamp = endEntry ? AL.parseICSTimestamp(endEntry.value, endEntry.params) : null;
    const title = AL.clean(event.SUMMARY?.[0]?.value) || "未命名事件";
    const description = AL.clean(event.DESCRIPTION?.[0]?.value);
    const location = AL.clean(event.LOCATION?.[0]?.value);
    const uid = AL.clean(event.UID?.[0]?.value) || `${source.id}:${title}`;
    const allDay = startStamp.allDay === true;
    const start = allDay
      ? AL.formatDateParts(startStamp)
      : AL.formatDateTimeParts(startStamp, startStamp);
    const end = allDay
      ? endStamp && endStamp.allDay
        ? AL.formatDateParts(endStamp)
        : AL.formatDateParts(AL.addDays(startStamp.year, startStamp.month, startStamp.day, 1))
      : endStamp && !endStamp.allDay
        ? AL.formatDateTimeParts(endStamp, endStamp)
        : AL.formatDateTimeParts(
          {
            year: startStamp.year,
            month: startStamp.month,
            day: startStamp.day
          },
          {
            hour: (startStamp.hour + 1) % 24,
            minute: startStamp.minute,
            second: startStamp.second
          }
        );

    return {
      id: uid,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceColor: source.color,
      sourceColorStrong: source.colorStrong,
      title,
      year: startStamp.year,
      month: startStamp.month,
      day: startStamp.day,
      allDay,
      start,
      end,
      location,
      detail: description,
      summary: title,
      sortTime: allDay ? 0 : ((startStamp.hour || 0) * 60) + (startStamp.minute || 0)
    };
  };

  AL.foldICSLines = (lines) =>
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

  AL.downloadTextFile = (filename, text, mimeType) => {
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

  AL.buildTaskCalendarEvent = (activity, source) => {
    const date = {
      year: new Date().getFullYear(),
      month: AL.toNumber(activity["预计月份(Y)"]),
      day: AL.toNumber(activity["预计日期(D)"])
    };

    if (!date.month || !date.day) {
      return null;
    }

    const clock = AL.parseClock(activity["开始时间(H)"]);
    const code = AL.clean(activity["代号"]) || "—";
    const title = AL.clean(activity["活动名称"]) || "未命名活动";
    const location = AL.clean(activity["地点"]);
    const detail = AL.clean(activity["详情"]);
    const status = AL.clean(activity["状态"]);
    const start = clock ? AL.formatDateTimeParts(date, clock) : AL.formatDateParts(date);
    const end = clock
      ? null
      : AL.formatDateParts(AL.addDays(date.year, date.month, date.day, 1));

    return {
      id: `${source.id}:${code}:${date.year}-${AL.pad2(date.month)}-${AL.pad2(date.day)}`,
      sourceId: source.id,
      sourceLabel: source.label,
      sourceColor: source.color,
      sourceColorStrong: source.colorStrong,
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

  AL.loadCalendarSourceManifest = async () => {
    const fallback = [
      {
        id: "tasks",
        label: "任务带入",
        kind: "activity",
        color: "rgba(226, 146, 52, 0.18)",
        colorStrong: "rgba(226, 146, 52, 0.9)",
        default: true,
        includeInCalendar: true,
        includeInContribution: true
      },
      {
        id: "external",
        label: "外部导入",
        kind: "file",
        file: "external.ics",
        color: "rgba(24, 69, 136, 0.18)",
        colorStrong: "rgba(24, 69, 136, 0.9)",
        default: true,
        includeInCalendar: true,
        includeInContribution: false
      }
    ];

    try {
      const manifest = await AL.fetchJSON("data/calendar/index.json");
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

  AL.loadExternalCalendarEvents = async (source) => {
    const files = [];
    if (Array.isArray(source.files)) {
      files.push(...source.files);
    }
    if (source.file) {
      files.push(source.file);
    }
    if (!files.length) {
      files.push("external.ics");
    }

    const items = [];
    for (const file of files) {
      try {
        const path = AL.joinSitePath("data/calendar/", file);
        const data = await AL.fetchText(path);
        items.push(...AL.parseICSFile(data).map((entry) => AL.buildEventFromICS(entry, source)).filter(Boolean));
      } catch (error) {
        // 外部日历文件缺失时跳过，避免影响其他来源。
      }
    }

    return items;
  };

  AL.loadCalendarSources = async (state) => {
    const sourceConfigs = await AL.loadCalendarSourceManifest();
    return Promise.all(sourceConfigs.map(async (source) => {
      const normalized = {
        id: AL.clean(source.id) || AL.clean(source.label) || "未命名",
        label: AL.clean(source.label) || AL.clean(source.id) || "未命名",
        kind: AL.clean(source.kind) || "file",
        default: source.default === true,
        includeInCalendar: source.includeInCalendar !== false,
        includeInContribution: source.includeInContribution !== false,
        color: AL.clean(source.color) || "",
        colorStrong: AL.clean(source.colorStrong) || "",
        file: AL.clean(source.file) || "",
        files: Array.isArray(source.files) ? source.files.map(String).filter(Boolean) : []
      };

      if (normalized.kind === "activity") {
        return {
          ...normalized,
          events: AL.calendarActivities(state)
            .map((activity) => AL.buildTaskCalendarEvent(activity, normalized))
            .filter(Boolean)
        };
      }

      return {
        ...normalized,
        events: await AL.loadExternalCalendarEvents(normalized)
      };
    }));
  };

  AL.selectedCalendarSources = (state) =>
    state.calendarSources.filter((source) => state.calendarSourceIds.includes(source.id));

  AL.selectedCalendarEvents = (state) =>
    AL.selectedCalendarSources(state)
      .filter((source) => source.includeInCalendar !== false)
      .flatMap((source) => source.events);

  AL.eventSortValue = (event) =>
    (((event.month || 0) * 100) + (event.day || 0)) * 1000 + (event.sortTime || 0);

  AL.buildICS = (events) => {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BETA-SDC//Activity List//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    for (const event of events) {
      const uid = `${event.id || event.sourceId}-${event.year}-${AL.pad2(event.month)}-${AL.pad2(event.day)}@beta-sdc`;
      const summary = AL.escapeICS(event.summary || event.title || "未命名事件");
      const descriptionParts = [
        event.sourceLabel ? `来源：${event.sourceLabel}` : "",
        event.code ? `代号：${event.code}` : "",
        event.status ? `状态：${event.status}` : "",
        event.detail ? `备注：${event.detail}` : ""
      ].filter(Boolean);
      const description = AL.escapeICS(descriptionParts.join("\n"));
      const location = event.location ? AL.escapeICS(event.location) : "";

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${AL.escapeICS(uid)}`);
      lines.push(`DTSTAMP:${AL.utcStamp()}`);
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
      lines.push(`CATEGORIES:${AL.escapeICS(event.sourceLabel || "活动")}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return AL.foldICSLines(lines);
  };

  AL.exportSelectedCalendar = (state) => {
    const events = AL.selectedCalendarEvents(state).sort((a, b) => AL.eventSortValue(a) - AL.eventSortValue(b));
    if (!events.length) {
      return;
    }
    AL.downloadTextFile("beta-activity-calendar.ics", AL.buildICS(events), "text/calendar;charset=utf-8");
  };
})();
