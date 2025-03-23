import { waitForElement } from "@/utils";
import { AutodartsToolsLobbyData } from "@/utils/lobby-data-storage";
import type { ILobbyStatus } from "@/utils/storage";
import type { ILobbies } from "@/utils/websocket-helpers";

let lobbyDataWatcherUnwatch: any;

export async function teamLobby() {
  console.log("Autodarts Tools: Team Lobby - Starting");

  try {
    const lobbyData = await AutodartsToolsLobbyData.getValue();
    if (lobbyData?.isPrivate) {
      processTeamLobby(lobbyData).catch(console.error);
      lobbyDataWatcherUnwatch = AutodartsToolsLobbyData.watch((data: ILobbies | undefined) => {
        if (!data) return;
        processTeamLobby(data).catch(console.error);
      });
    }

    // const lobbyStatus = await AutodartsToolsLobbyStatus.getValue();
    //       console.log(lobbyStatus);

    //       if (lobbyStatus.isPrivate) {
    //         await new Promise(resolve => setTimeout(resolve, 200));
    //         await waitForElement(".ad-ext-player-name");
    //         const username = (await AutodartsToolsGlobalStatus.getValue())?.user?.name;
    //         const userElements = [ ...document.querySelectorAll(".ad-ext-player-name") ];
    //         const userEl = userElements?.filter(el => el.textContent?.trim() === username);

    //         if (userEl.length) {
    //           const removeBtn = userEl[1].closest("tr")?.querySelector("button:last-of-type") as HTMLButtonElement;
    //           removeBtn?.click();
    //           startPlayerToBoardObserver();
    //         } else {
    //           console.log("Autodarts Tools: no user found in lobby");
    //         }
    //       }
  } catch (e) {
    console.error("Autodarts Tools: Team Lobby - Error: ", e);
  }
}

async function processTeamLobby(lobbyStatus: ILobbyStatus) {
  console.log("Autodarts Tools: Team Lobby - Processing");

  await new Promise(resolve => setTimeout(resolve, 200));
  await waitForElement(".ad-ext-player-name");
  const username = lobbyStatus.host?.name;

  // Find all tr elements that might contain player information
  const rows = [ ...document.querySelectorAll("tr") ];

  // Process each row
  for (const row of rows) {
    // Skip rows containing "via" text
    if (row.textContent?.includes("via")) {
      continue;
    }

    // Check if this row contains the host username
    const playerNameElement = row.querySelector(".ad-ext-player-name > p");
    if (playerNameElement?.textContent?.trim()?.toLowerCase() === username?.toLowerCase()) {
      // Find and click the remove button
      const removeBtn = row.querySelector("button:last-of-type") as HTMLButtonElement;
      removeBtn?.click();
    }
  }

  await new Promise(resolve => setTimeout(resolve, 200));

  const useMyBoardButtons = [ ...document.querySelectorAll("button") ]
    .filter(button => button.textContent?.trim() === "Use my board");

  useMyBoardButtons.forEach((button) => {
    button.click();
  });
}

export async function teamLobbyOnRemove() {
  lobbyDataWatcherUnwatch?.();
}
