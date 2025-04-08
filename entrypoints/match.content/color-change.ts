import { AutodartsToolsConfig } from "@/utils/storage";
import { waitForElement } from "@/utils";

let colorChangeInterval: NodeJS.Timeout | null = null;

export async function colorChange() {
  console.log("Autodarts Tools: color change");
  handleChangeColor().catch(console.error);
  colorChangeInterval = setInterval(handleChangeColor, 500);
}

async function handleChangeColor() {
  try {
    const config = await AutodartsToolsConfig.getValue();

    // Applicera site background först - oavsett om andra element finns
    const bodyElement = document.querySelector("body") as HTMLElement;
    if (bodyElement && config.colors.enabled && config.colors.siteBackground) {
      bodyElement.style.setProperty("background-color", config.colors.siteBackground, "important");
      bodyElement.style.setProperty("background-image", "none", "important");
    }

    const elements: HTMLElement[] = [];

    const playerDisplay = await waitForElement("#ad-ext-player-display") as HTMLElement;
    const playerScores = playerDisplay.querySelectorAll(".ad-ext-player");
    const playerInfos = playerDisplay.querySelectorAll("div:nth-of-type(2)");

    playerScores.forEach(element => elements.push(element as HTMLElement));
    playerInfos.forEach(element => elements.push(element as HTMLElement));

    const playerNames = playerDisplay.querySelectorAll("a");
    playerNames.forEach(element => elements.push(element as HTMLElement));

    const turnThrows = document.querySelector("#ad-ext-turn")?.childNodes;
    if (turnThrows) turnThrows.forEach(element => elements.push(element as HTMLElement));

    const turnScoreElement = turnThrows![0] as HTMLElement;
    const turnScore = turnScoreElement.querySelector("p");
    if (turnScore) elements.push(turnScore as HTMLElement);

    // för varje element, applicera färger
    elements.forEach((element) => {
      element.style.setProperty("background", config.colors.background);
      element.style.color = `${config.colors.text}`;
    });
  } catch (e) {
    console.error("Autodarts Tools: Color Change - Error changing color: ", e);
    if (colorChangeInterval) clearInterval(colorChangeInterval);
  }
}

export async function onRemove() {
  if (colorChangeInterval) clearInterval(colorChangeInterval);

  // Återställ bakgrundsfärger när funktionen inaktiveras/tas bort
  const bodyElement = document.querySelector("body") as HTMLElement;
  if (bodyElement) {
    bodyElement.style.removeProperty("background-color");
    bodyElement.style.removeProperty("background-image");
  }
}
