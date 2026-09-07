const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const trimText = (value) => (typeof value === "string" ? value.trim() : "");

const localTimestampText = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + ` ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

const normalizeRepoPath = (value) =>
  String(value ?? "")
    .replace(/^\.\//, "")
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\/+/, "");

const safeResolve = (relativePath) => {
  const resolved = path.resolve(ROOT, relativePath);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error("Invalid path");
  }
  return resolved;
};

const ensureDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const readText = async (filePath) => fs.readFile(filePath, "utf8");

const readJSON = async (filePath, fallback = null) => {
  try {
    return JSON.parse(await readText(filePath));
  } catch (error) {
    return fallback;
  }
};

const writeTextAtomic = async (filePath, text) => {
  await ensureDir(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, text, "utf8");
  await fs.rename(tempPath, filePath);
};

const writeJSON = async (filePath, value) => {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const send = (res, statusCode, body, headers = {}) => {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    ...headers
  });
  res.end(body);
};

const sendJSON = (res, statusCode, value) => {
  send(res, statusCode, `${JSON.stringify(value, null, 2)}\n`, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    const size = chunks.reduce((total, part) => total + part.length, 0);
    if (size > 1024 * 1024) {
      throw new Error("Request body too large");
    }
  }
  return Buffer.concat(chunks).toString("utf8");
};

const loadActivityGroups = async () => {
  const manifestPath = safeResolve("data/activities/index.json");
  const manifest = await readJSON(manifestPath, null);
  const groups = Array.isArray(manifest?.groups) ? manifest.groups : [];
  if (!groups.length) {
    throw new Error("活动分组清单为空");
  }

  const loaded = [];
  for (const group of groups) {
    const files = Array.isArray(group.files) ? group.files.filter(Boolean) : [];
    const fileEntries = [];
    for (const file of files) {
      const filePath = safeResolve(path.join("data/activities", file));
      const items = await readJSON(filePath, []);
      fileEntries.push({
        name: file,
        path: filePath,
        items: Array.isArray(items) ? items : []
      });
    }

    loaded.push({
      id: trimText(group.id) || trimText(group.label) || "未命名",
      label: trimText(group.label) || trimText(group.id) || "未命名",
      default: group.default === true,
      files: fileEntries
    });
  }

  return loaded;
};

const sortActivities = (activities) =>
  [...activities].sort((a, b) => {
    const aCode = Number(String(a?.["代号"] || "").match(/\d+/)?.[0] || 0);
    const bCode = Number(String(b?.["代号"] || "").match(/\d+/)?.[0] || 0);
    if (aCode !== bCode) {
      return aCode - bCode;
    }
    return String(a?.["活动名称"] || "").localeCompare(String(b?.["活动名称"] || ""), "zh-CN", { numeric: true });
  });

const sortArchiveActivities = (activities) =>
  [...activities].sort((a, b) => {
    const aStamp = Date.parse(String(a?.["建立规划时间"] || "").replace(" ", "T")) || 0;
    const bStamp = Date.parse(String(b?.["建立规划时间"] || "").replace(" ", "T")) || 0;
    if (aStamp !== bStamp) {
      return aStamp - bStamp;
    }
    const aCode = Number(String(a?.["代号"] || "").match(/\d+/)?.[0] || 0);
    const bCode = Number(String(b?.["代号"] || "").match(/\d+/)?.[0] || 0);
    if (aCode !== bCode) {
      return aCode - bCode;
    }
    return String(a?.["活动名称"] || "").localeCompare(String(b?.["活动名称"] || ""), "zh-CN", { numeric: true });
  });

const findActivity = (groups, code) => {
  const targetCode = trimText(code);
  if (!targetCode) {
    return null;
  }

  for (const group of groups) {
    for (const file of group.files) {
      const index = file.items.findIndex((item) => trimText(item?.["代号"]) === targetCode);
      if (index >= 0) {
        return {
          group,
          file,
          index,
          item: file.items[index]
        };
      }
    }
  }

  return null;
};

const removeActivityByCode = (groups, code) => {
  const targetCode = trimText(code);
  if (!targetCode) {
    return [];
  }

  const changedFiles = [];
  for (const group of groups) {
    for (const file of group.files) {
      const before = file.items.length;
      file.items = file.items.filter((item) => trimText(item?.["代号"]) !== targetCode);
      if (file.items.length !== before) {
        changedFiles.push(file);
      }
    }
  }

  return changedFiles;
};

const pickTargetGroup = (groups, status, fallbackGroup = null) => {
  const targetStatus = trimText(status);
  if (targetStatus) {
    const matched = groups.find((group) => group.label === targetStatus || group.id === targetStatus);
    if (matched) {
      return matched;
    }
  }

  return fallbackGroup || groups.find((group) => group.default) || groups[0] || null;
};

const writeChangedGroups = async (groups, changedFiles) => {
  const uniqueFiles = [...new Set(changedFiles.filter(Boolean))];
  for (const file of uniqueFiles) {
    file.items = path.basename(file.path) === "archive.json"
      ? sortArchiveActivities(file.items)
      : sortActivities(file.items);
    await writeJSON(file.path, file.items);
  }
};

const saveActivity = async (payload) => {
  const draft = payload?.activity && typeof payload.activity === "object" ? payload.activity : null;
  if (!draft) {
    throw new Error("缺少活动数据");
  }

  const requiredFields = [
    ["代号", "代号"],
    ["活动名称", "活动名称"],
    ["状态", "状态"],
    ["活动类型", "活动类型"]
  ];
  const missing = requiredFields
    .filter(([key]) => !trimText(draft[key]))
    .map(([, label]) => label);
  if (missing.length) {
    throw new Error(`请先填写必填项：${missing.join("、")}`);
  }

  const code = trimText(draft["代号"]);

  const groups = await loadActivityGroups();
  const originalCode = trimText(payload?.originalCode);
  const existing = findActivity(groups, originalCode || code);
  const targetGroup = pickTargetGroup(groups, draft["状态"], existing?.group || null);
  if (!targetGroup || !targetGroup.files.length) {
    throw new Error("找不到可写入的活动分组");
  }

  const targetFile = targetGroup.files[0];
  const normalized = {
    ...draft,
    "代号": code,
    "建立规划时间": trimText(draft["建立规划时间"]) || trimText(existing?.item?.["建立规划时间"]) || localTimestampText()
  };

  const changedFiles = removeActivityByCode(groups, originalCode || code);
  targetFile.items.push(normalized);
  changedFiles.push(targetFile);
  await writeChangedGroups(groups, changedFiles);

  return {
    ok: true,
    code,
    groupId: targetGroup.id,
    file: path.relative(ROOT, targetFile.path)
  };
};

const serveStatic = async (req, res, pathname) => {
  let targetPath = pathname === "/" ? "/index.html" : pathname;
  try {
    targetPath = decodeURIComponent(targetPath);
  } catch (error) {
    send(res, 400, "Bad Request", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const resolved = safeResolve(targetPath.replace(/^\/+/, ""));
  let filePath = resolved;

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch (error) {
    if (!path.extname(filePath)) {
      const withHtml = `${filePath}.html`;
      try {
        await fs.stat(withHtml);
        filePath = withHtml;
      } catch (innerError) {
        send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
    } else {
      send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
  }

  const content = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, content, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
};

const handleApi = async (req, res, url) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "", {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/data") {
    const rawPath = normalizeRepoPath(url.searchParams.get("path"));
    if (!rawPath) {
      sendJSON(res, 400, { ok: false, error: "缺少 path 参数" });
      return;
    }
    const filePath = safeResolve(rawPath);
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, content, {
      "Content-Type": MIME_TYPES[ext] || "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/activities/save") {
    try {
      const payload = JSON.parse(await readBody(req));
      const result = await saveActivity(payload);
      sendJSON(res, 200, result);
    } catch (error) {
      sendJSON(res, 400, { ok: false, error: error.message || "保存失败" });
    }
    return;
  }

  sendJSON(res, 404, { ok: false, error: "Not Found" });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJSON(res, 500, { ok: false, error: error.message || "Internal Server Error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Activity List local service running at http://127.0.0.1:${PORT}`);
});
