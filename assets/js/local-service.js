(function () {
  "use strict";

  const AL = window.ActivityList = window.ActivityList || {};

  const trimText = (value) => (typeof value === "string" ? value.trim() : "");

  const normalizeRepoPath = (value) =>
    String(value ?? "")
      .replace(/^\.\//, "")
      .replace(/^(\.\.\/)+/, "");

  AL.LOCAL_SERVICE_ORIGIN = "http://127.0.0.1:8787";
  AL.localServiceStatus = null;
  AL.localServiceProbe = null;

  AL.detectLocalService = async () => {
    if (AL.localServiceStatus !== null) {
      return AL.localServiceStatus;
    }

    if (AL.localServiceProbe) {
      return AL.localServiceProbe;
    }

    AL.localServiceProbe = fetch(`${AL.LOCAL_SERVICE_ORIGIN}/api/health`, {
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        AL.localServiceStatus = Boolean(data && data.ok);
        return AL.localServiceStatus;
      })
      .catch(() => {
        AL.localServiceStatus = false;
        return false;
      })
      .finally(() => {
        AL.localServiceProbe = null;
      });

    return AL.localServiceProbe;
  };

  AL.resolveDataUrl = async (path) => {
    const available = await AL.detectLocalService();
    if (!available) {
      return null;
    }
    const repoPath = normalizeRepoPath(path);
    return `${AL.LOCAL_SERVICE_ORIGIN}/api/data?path=${encodeURIComponent(repoPath)}&v=${Date.now()}`;
  };

  AL.saveActivityDraft = async (draft, originalCode) => {
    const available = await AL.detectLocalService();
    if (!available) {
      throw new Error("本地服务未启动，请先运行 `npm start` 再保存。");
    }

    const response = await fetch(`${AL.LOCAL_SERVICE_ORIGIN}/api/activities/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        activity: draft,
        originalCode: trimText(originalCode)
      })
    });

    if (!response.ok) {
      throw new Error(`保存失败（HTTP ${response.status}）`);
    }

    const data = await response.json().catch(() => null);
    if (!data || !data.ok) {
      throw new Error(data?.error || "保存失败");
    }

    return data;
  };
})();
