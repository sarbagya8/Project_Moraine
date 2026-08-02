import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { hashScryptPassword } = jiti("../src/lib/auth-protocol.ts");

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stderr.isTTY || !process.stdin.setRawMode) {
    throw new Error("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          process.stderr.write("\n");
          reject(new Error("Password hashing cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };

    process.stderr.write(prompt);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

try {
  const password = await readHidden("Authority password: ");
  const confirmation = await readHidden("Confirm password: ");
  if (!password) throw new Error("Password cannot be empty.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  process.stdout.write(`${hashScryptPassword(password)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to hash password."}\n`);
  process.exitCode = 1;
}
