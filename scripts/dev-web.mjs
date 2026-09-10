import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const webDir = resolve(repoRoot, "apps", "web");
const devDistDir = ".next-dev";
const devDistPath = resolve(webDir, devDistDir);

stopStaleWebProcesses();
removeDevCache();

if (process.env.BUILD_CONTRACTS_ON_DEV === "1") {
  run("pnpm", ["--filter", "@ticket-booking/contracts", "build"], repoRoot);
} else {
  console.log("[dev-web] Skipping contracts build for faster startup.");
}

const nextArgs = ["exec", "next", "dev", "--port", "3000"];

if (process.env.DISABLE_TURBO_DEV !== "1") {
  nextArgs.push("--turbo");
}

const next = spawn("pnpm", nextArgs, {
  cwd: webDir,
  env: {
    ...process.env,
    NEXT_DIST_DIR: devDistDir,
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

next.on("exit", (code, signal) => {
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

function removeDevCache() {
  if (!existsSync(devDistPath)) {
    return;
  }

  try {
    rmSync(devDistPath, { force: true, recursive: true });
  } catch (error) {
    console.warn(
      `[dev-web] Could not remove ${devDistPath}. If dev still fails, close any old Next.js terminals and retry.`,
    );
    console.warn(`[dev-web] ${error instanceof Error ? error.message : error}`);
  }
}

function stopStaleWebProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  let rows = [];

  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        [
          "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\"",
          "| Select-Object ProcessId,CommandLine",
          "| ConvertTo-Json -Compress",
        ].join(" "),
      ],
      { encoding: "utf8" },
    ).trim();

    rows = output ? JSON.parse(output) : [];
  } catch {
    return;
  }

  const processes = Array.isArray(rows) ? rows : [rows];
  const ownPid = process.pid;
  const repoMarker = repoRoot.toLowerCase();

  const staleProcessIds = processes
    .filter((row) => {
      const commandLine = String(row.CommandLine ?? "").toLowerCase();
      const processId = Number(row.ProcessId);
      const belongsToRepo = commandLine.includes(repoMarker);
      const isNextCli =
        commandLine.includes("apps\\web") &&
        (commandLine.includes("next\\dist\\bin\\next") ||
          commandLine.includes("next/dist/bin/next"));
      const isNextWorker =
        commandLine.includes("next-server") ||
        commandLine.includes(".next-dev\\postcss.js") ||
        commandLine.includes(".next-dev/postcss.js");

      return (
        Number.isInteger(processId) &&
        processId !== ownPid &&
        belongsToRepo &&
        (isNextCli || isNextWorker)
      );
    })
    .map((row) => Number(row.ProcessId));

  for (const processId of staleProcessIds) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(processId), "/T", "/F"], {
        stdio: "ignore",
      });
      console.log(`[dev-web] Stopped stale Next.js process ${processId}.`);
    } catch {
      // The process may have already exited.
    }
  }
}
