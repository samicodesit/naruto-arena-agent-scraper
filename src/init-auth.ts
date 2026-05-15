import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { BASE_URL } from "./config.js";
import { goto, isLoggedIn, openPersistentContext } from "./browser.js";

const context = await openPersistentContext();
const page = context.pages()[0] ?? await context.newPage();

console.log("Opening Naruto-Arena. Log in manually in the browser window.");
await goto(page, BASE_URL);

const rl = readline.createInterface({ input, output });
await rl.question("After you are logged in, press Enter here...");
rl.close();

const loggedIn = await isLoggedIn(page);
console.log(loggedIn ? "Logged-in session detected." : "Login was not detected.");

await context.close();

if (!loggedIn) process.exit(1);
