import "~/assets/tailwind.css";
import { createApp } from "vue";
import { waitForElement, waitForElementWithTextContent } from "@/utils";
import type { IConfig } from "@/utils/storage";
import {
  AutodartsToolsConfig,
  AutodartsToolsGlobalStatus,
  AutodartsToolsLobbyStatus,
  AutodartsToolsUrlStatus,
} from "@/utils/storage";
import { discordWebhooks } from "@/entrypoints/lobby.content/discord-webhooks";
import { autoStart, onRemove as onAutoStartRemove } from "@/entrypoints/lobby.content/auto-start";
import { onRemove as onShufflePlayersRemove, shufflePlayers } from "@/entrypoints/lobby.content/shuffle-players";
import RecentLocalPlayers from "@/entrypoints/lobby.content/RecentLocalPlayers.vue";
import { fetchWithAuth } from "@/utils/helpers";
import { processWebSocketMessage } from "@/utils/websocket-helpers";

let recentLocalPlayersUI: any;
let lobbyReadyUnwatch: any;

let playerToBoardObserver: MutationObserver;

export default defineContentScript({
  matches: [ "*://play.autodarts.io/*" ],
  cssInjectionMode: "ui",
  async main(ctx: any) {
    lobbyReadyUnwatch = AutodartsToolsUrlStatus.watch(async (url: string) => {
      const config: IConfig = await AutodartsToolsConfig.getValue();
      if (/\/lobbies\/(?!.*new\/)/.test(url)) {
        console.log("Autodarts Tools: Lobby Ready");

        // Extract lobby ID from URL and fetch lobby data
        const lobbyIdMatch = url.match(/\/lobbies\/([0-9a-f-]+)/);
        if (lobbyIdMatch && lobbyIdMatch[1]) {
          const lobbyId = lobbyIdMatch[1];
          console.log("Autodarts Tools: Lobby ID:", lobbyId);

          try {
            console.log("Autodarts Tools: Fetching lobby data with cookie authentication...");
            const apiUrl = `https://api.autodarts.io/gs/v0/lobbies/${lobbyId}`;
            const response = await fetchWithAuth(apiUrl);

            console.log("Autodarts Tools: Response status:", response.status);

            if (response.ok) {
              const lobbyData = await response.json();
              console.log("Autodarts Tools: Lobby Data:", lobbyData);
              await processWebSocketMessage("autodarts.lobbies", lobbyData);
            } else {
              console.error("Autodarts Tools: Failed to fetch lobby data", response.status, response.statusText);
            }
          } catch (error) {
            console.error("Autodarts Tools: Error fetching lobby data:", error);
          }
        }

        if (config.discord.enabled) {
          await waitForElementWithTextContent("h2", "Lobby");
          await initScript(discordWebhooks, url);
        }
        if (config.autoStart.enabled) {
          await waitForElementWithTextContent("h2", "Lobby");
          await initScript(autoStart, url);
        }
        if (config.shufflePlayers.enabled) {
          await waitForElementWithTextContent("h2", "Lobby");
          await initScript(shufflePlayers, url);
        }
        if (config.recentLocalPlayers.enabled) {
          const div = document.querySelector("autodarts-tools-recent-local-players");
          if (!div) initRecentLocalPlayers(ctx).catch(console.error);
        }

        if (config.teamLobby.enabled) {
          const lobbyStatus = await AutodartsToolsLobbyStatus.getValue();
          if (lobbyStatus.isPrivate) {
            await new Promise(resolve => setTimeout(resolve, 200));
            await waitForElement(".ad-ext-player-name");
            const username = (await AutodartsToolsGlobalStatus.getValue())?.user?.name;
            const userElements = [ ...document.querySelectorAll(".ad-ext-player-name") ];
            const userEl = userElements?.filter(el => el.textContent?.trim() === username);

            if (userEl.length) {
              const removeBtn = userEl[1].closest("tr")?.querySelector("button:last-of-type") as HTMLButtonElement;
              removeBtn?.click();
              startPlayerToBoardObserver();
            } else {
              console.log("Autodarts Tools: no user found in lobby");
            }
          }
        }

        const globalStatus = await AutodartsToolsGlobalStatus.getValue();
        await AutodartsToolsGlobalStatus.setValue({ ...globalStatus, isFirstStart: true });
      } else {
        await onAutoStartRemove();
        await onShufflePlayersRemove();
        playerToBoardObserver?.disconnect();
      }
    });
  },
});

async function initScript(fn: any, url: string) {
  if (window.location.href !== url) return;
  await fn();
}

async function initRecentLocalPlayers(ctx: any) {
  const lobbyUserInputParent = (await waitForElement("input[placeholder=\"Enter name for local player\"]"))?.parentElement;
  if (!lobbyUserInputParent) return;

  recentLocalPlayersUI = await createShadowRootUi(ctx, {
    name: "autodarts-tools-recent-local-players",
    position: "inline",
    anchor: lobbyUserInputParent.parentElement,
    onMount: (container: any) => {
      const app = createApp(RecentLocalPlayers);
      app.mount(container);
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        container.classList.add("dark");
      }
      return app;
    },
    onRemove: (app: any) => {
      app?.unmount();
    },
  });
  recentLocalPlayersUI.mount();
}

function startPlayerToBoardObserver() {
  const targetNode = document.querySelectorAll("table")[1];
  if (!targetNode) {
    console.error("Target node not found");
    return;
  }
  playerToBoardObserver = new MutationObserver((m) => {
    if (m.length <= 1) return;
    const playerRow = (m[0].target as HTMLElement)?.closest("tr");
    if (!playerRow) return;
    [ ...playerRow.querySelectorAll("button") ].filter(el => el.textContent === "Use my board")[0]?.click();
  });
  playerToBoardObserver.observe(targetNode, { childList: true, subtree: true, attributes: false });
}
