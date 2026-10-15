import { initData } from "./pages/data";
import { initHelp } from "./pages/help";
import { initRaces } from "./pages/races";
import { initTeams } from "./pages/teams";
import { initThreads } from "./pages/threads";
import { openStore } from "./store";

/** Entry of every page: open the shared database, then start the page. */
export async function start(page: "threads" | "teams" | "races" | "data" | "help"): Promise<void> {
  const status = document.getElementById("appstatus");
  try {
    if (page === "help") {
      await initHelp(); // the helper page needs no database
      return;
    }
    const store = await openStore();
    if (!store.persistent && status) {
      status.textContent = "This browser does not allow saving data between visits. Use the Data page to save a copy.";
    }
    if (page === "threads") initThreads(store);
    else if (page === "teams") initTeams(store);
    else if (page === "races") initRaces(store);
    else initData(store);
  } catch (e) {
    if (status) {
      status.className = "err";
      status.textContent = "Could not start: " + (e instanceof Error ? e.message : String(e));
    }
    throw e;
  }
}
