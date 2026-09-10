import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const apiDir = resolve(repoRoot, "apps", "api");
const port = process.env.PORT ?? "4000";

if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

stopStaleApiProcesses();
removeApiBuildInfo();

if (process.env.BUILD_CONTRACTS_ON_DEV === "1") {
  run("pnpm", ["--filter", "@ticket-booking/contracts", "build"], repoRoot);
} else {
  console.log("[dev-api] Skipping contracts build for faster startup.");
}

const nest = spawn("pnpm", ["exec", "nest", "start", "--watch"], {
  cwd: apiDir,
  env: {
    ...process.env,
    PORT: port,
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

nest.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
}

function removeApiBuildInfo() {
  const tsBuildInfoPath = resolve(apiDir, "tsconfig.tsbuildinfo");

  if (!existsSync(tsBuildInfoPath)) {
    return;
  }

  try {
    rmSync(tsBuildInfoPath, { force: true });
  } catch (error) {
    console.warn(
      `[dev-api] Could not remove ${tsBuildInfoPath}. Continuing anyway.`,
    );
    console.warn(`[dev-api] ${error instanceof Error ? error.message : error}`);
  }
}

function stopStaleApiProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const snapshot = JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[PSCustomObject]@{
          Processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine)
          Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $env:SEATLY_DEV_API_PORT -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
        } | ConvertTo-Json -Depth 3 -Compress`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, SEATLY_DEV_API_PORT: port },
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      },
    ),
  );
  const processes = snapshot.Processes;
  const listeners = new Set(snapshot.Listeners);
  const byId = new Map(processes.map((row) => [row.ProcessId, row]));
  const protectedIds = new Set();
  for (let id = process.pid; id && !protectedIds.has(id);) {
    protectedIds.add(id);
    id = byId.get(id)?.ParentProcessId;
  }
  const normalize = (value) =>
    String(value ?? "")
      .replaceAll("\\", "/")
      .toLowerCase();
  const repoMarker = normalize(repoRoot);

  const staleProcessIds = new Set(
    processes
      .filter((row) => {
        const commandLine = normalize(row.CommandLine);
        const processId = Number(row.ProcessId);
        const absoluteApi =
          commandLine.includes(`${repoMarker}/apps/api/`) &&
          (commandLine.includes("@nestjs/cli/") ||
            /\/dist\/main(?:\.js)?(?:["\s]|$)/.test(commandLine));
        // A direct build launch may contain no absolute workspace path. Only
        // accept that relative entry point when it owns this API's target port.
        const relativeApi =
          listeners.has(processId) &&
          /(?:^|["\s])(?:\.\/)?apps\/api\/dist\/main(?:\.js)?(?:["\s]|$)/.test(
            commandLine,
          );

        return (
          row.Name?.toLowerCase() === "node.exe" &&
          Number.isInteger(processId) &&
          !protectedIds.has(processId) &&
          (absoluteApi || relativeApi)
        );
      })
      .map((row) => Number(row.ProcessId)),
  );

  // Stop the old launcher as well as its watcher so it cannot restart the API.
  for (const processId of [...staleProcessIds]) {
    const seen = new Set();
    for (
      let parent = byId.get(processId)?.ParentProcessId;
      parent && !seen.has(parent);
    ) {
      if (protectedIds.has(parent)) break;
      seen.add(parent);
      const row = byId.get(parent);
      if (
        row?.Name?.toLowerCase() === "node.exe" &&
        /\/scripts\/dev-api\.mjs(?:["\s]|$)/.test(normalize(row.CommandLine))
      ) {
        staleProcessIds.add(parent);
      }
      parent = row?.ParentProcessId;
    }
  }

  const roots = [...staleProcessIds].filter((id) => {
    const seen = new Set();
    for (
      let parent = byId.get(id)?.ParentProcessId;
      parent && !seen.has(parent);
    ) {
      if (staleProcessIds.has(parent)) return false;
      seen.add(parent);
      parent = byId.get(parent)?.ParentProcessId;
    }
    return true;
  });

  for (const processId of roots) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(processId), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      console.log(`[dev-api] Stopped stale API process tree ${processId}.`);
    } catch {
      // The process may have already exited.
    }
  }
}
