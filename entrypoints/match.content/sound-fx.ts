import { AutodartsToolsGameData, type IGameData } from "@/utils/game-data-storage";
import { AutodartsToolsConfig, type IConfig } from "@/utils/storage";

let gameDataWatcherUnwatch: any;
let config: IConfig;

// Audio player for Safari compatibility
let audioPlayer: HTMLAudioElement | null = null;
// Queue for sounds to be played
const soundQueue: { url?: string; base64?: string; name?: string }[] = [];
// Flag to track if we're currently playing a sound
let isPlaying = false;
// Flag to track if audio has been unlocked
let audioUnlocked = false;
// Debounce timer for processing game data
let debounceTimer: number | null = null;
// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 200;
// Flag to track if we've shown the interaction notification
let interactionNotificationShown = false;
// Reference to notification element
let notificationElement: HTMLElement | null = null;
// Reference to the style element for notification
let notificationStyleElement: HTMLStyleElement | null = null;

// Audio element pool for Safari compatibility
const AUDIO_POOL_SIZE = 3;
const audioPool: HTMLAudioElement[] = [];
let currentAudioIndex = 0;
// Tracking URLs that need to be revoked
const blobUrlsToRevoke: string[] = [];

export async function soundFx() {
  console.log("Autodarts Tools: Sound FX");

  try {
    config = await AutodartsToolsConfig.getValue();
    console.log("Autodarts Tools: Config loaded", config?.soundFx?.sounds?.length || 0, "sounds available");

    // Initialize audio player for Safari compatibility
    initAudioPlayer();

    if (!gameDataWatcherUnwatch) {
      gameDataWatcherUnwatch = AutodartsToolsGameData.watch((gameData: IGameData, oldGameData: IGameData) => {
        console.log("Autodarts Tools: soundFx game data updated");

        // Debounce the processGameData call
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = window.setTimeout(() => {
          processGameData(gameData, oldGameData);
          debounceTimer = null;
        }, DEBOUNCE_DELAY);
      });
    }
  } catch (error) {
    console.error("Autodarts Tools: soundFx initialization error", error);
  }
}

export function soundFxOnRemove() {
  console.log("Autodarts Tools: soundFx on remove");
  if (gameDataWatcherUnwatch) {
    gameDataWatcherUnwatch();
    gameDataWatcherUnwatch = null;
  }

  // Clear any pending debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Clean up audio player
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.removeEventListener("ended", playNextSound);
    audioPlayer = null;
  }

  // Clean up audio pool
  audioPool.forEach((audio) => {
    audio.pause();
    audio.src = "";
    audio.remove();
  });
  audioPool.length = 0;

  // Revoke any blob URLs
  blobUrlsToRevoke.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Autodarts Tools: Error revoking URL", e);
    }
  });
  blobUrlsToRevoke.length = 0;

  // Remove notification elements if they exist
  removeInteractionNotification();
}

/**
 * Initialize the audio player with Safari compatibility in mind
 */
function initAudioPlayer(): void {
  if (!audioPlayer) {
    audioPlayer = new Audio();

    // Add ended event listener to play the next sound in queue
    audioPlayer.addEventListener("ended", playNextSound);

    // Handle errors
    audioPlayer.addEventListener("error", (e) => {
      console.error("Autodarts Tools: Audio playback error", e);
      // Move to next sound on error
      playNextSound();
    });

    // Initialize audio pool
    for (let i = 0; i < AUDIO_POOL_SIZE; i++) {
      const audio = new Audio();
      audio.addEventListener("ended", () => {
        console.log("Autodarts Tools: Pool audio ended");
        playNextSound();
      });
      audio.addEventListener("error", (error) => {
        console.error("Autodarts Tools: Pool audio error", error);
        playNextSound();
      });
      audioPool.push(audio);
    }

    // Unlock audio on first user interaction (required for Safari/iOS)
    document.addEventListener("click", unlockAudio, { once: true });
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });
  }
}

/**
 * Unlock audio playback on user interaction (required for Safari/iOS)
 */
function unlockAudio(): void {
  if (audioUnlocked || !audioPlayer) return;

  console.log("Autodarts Tools: Attempting to unlock audio");

  // Create a short silent audio buffer
  const silentAudio = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

  audioPlayer.src = silentAudio;
  audioPlayer.volume = 0.01;

  // Also unlock all audio pool elements
  audioPool.forEach((audio, i) => {
    audio.src = silentAudio;
    audio.volume = 1;
    // Don't play them all, just load them
    if (i === 0) {
      audio.play().catch(e => console.error("Autodarts Tools: Error unlocking pool audio", e));
    }
  });

  audioPlayer.play()
    .then(() => {
      console.log("Autodarts Tools: Audio unlocked successfully");
      audioUnlocked = true;
      hideInteractionNotification();

      // If we have sounds in the queue, start playing them
      if (soundQueue.length > 0 && !isPlaying) {
        playNextSound();
      }
    })
    .catch((error) => {
      console.error("Autodarts Tools: Failed to unlock audio", error);
    });
}

/**
 * Shows a notification to inform the user they need to interact with the page
 */
function showInteractionNotification(): void {
  // Return if notification is already shown or if another notification with the same class already exists
  if (interactionNotificationShown || document.querySelector(".adt-notification")) return;

  interactionNotificationShown = true;

  // Add style for notification if not already added
  if (!document.querySelector("style[data-adt-notification-style]")) {
    notificationStyleElement = document.createElement("style");
    notificationStyleElement.setAttribute("data-adt-notification-style", "");
    notificationStyleElement.textContent = `
      .adt-notification {
        position: fixed;
        bottom: 16px;
        right: 32px;
        z-index: 50;
        max-width: 28rem;
        border-radius: 6px;
        padding: 16px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
        backdrop-filter: blur(4px);
        background-color: rgba(0, 0, 0, 0.4);
        color: white;
      }
      .adt-notification::after {
        content: '';
        position: absolute;
        inset: 0;
        background-color: rgba(220, 38, 38, 0.3);
        border-radius: 6px;
        pointer-events: none;
      }
      .adt-notification-content {
        display: flex;
      }
      .adt-notification-icon {
        margin-right: 8px;
        flex-shrink: 0;
        font-size: 1.25rem;
      }
      .adt-notification-message {
        margin-right: 16px;
        flex-grow: 1;
      }
      .adt-notification-close {
        flex-shrink: 0;
        font-size: 1.25rem;
        opacity: 0.7;
        background: none;
        border: none;
        color: white;
        cursor: pointer;
      }
      .adt-notification-close:hover {
        opacity: 1;
      }
      
      /* Animation classes */
      @keyframes adt-notification-enter {
        from {
          transform: translateY(32px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .adt-notification {
        animation: adt-notification-enter 300ms ease-out forwards;
      }
    `;
    document.head.appendChild(notificationStyleElement);
  } else {
    // If the style element exists but we don't have a reference to it, get a reference
    notificationStyleElement = document.querySelector("style[data-adt-notification-style]");
  }

  // Create notification element if it doesn't exist
  if (!notificationElement) {
    notificationElement = document.createElement("div");
    notificationElement.className = "adt-notification";
    notificationElement.setAttribute("data-adt-notification-source", "sound-fx");
    notificationElement.innerHTML = `
      <div class="adt-notification-content">
        <div class="adt-notification-message">
          Please interact with the page (click, tap, or press a key) to enable audio for sound effects.
        </div>
        <button class="adt-notification-close">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><!-- Icon from Pixelarticons by Gerrit Halfmann - https://github.com/halfmage/pixelarticons/blob/master/LICENSE --><path fill="currentColor" d="M5 5h2v2H5zm4 4H7V7h2zm2 2H9V9h2zm2 0h-2v2H9v2H7v2H5v2h2v-2h2v-2h2v-2h2v2h2v2h2v2h2v-2h-2v-2h-2v-2h-2zm2-2v2h-2V9zm2-2v2h-2V7zm0 0V5h2v2z"/></svg>
        </button>
      </div>
    `;

    // Add click listener to close button
    const closeButton = notificationElement.querySelector(".adt-notification-close");
    if (closeButton) {
      closeButton.addEventListener("click", hideInteractionNotification);
    }

    // Add the notification to the DOM
    document.body.appendChild(notificationElement);
  } else {
    notificationElement.style.display = "block";
  }
}

/**
 * Hides the interaction notification
 */
function hideInteractionNotification(): void {
  if (notificationElement) {
    notificationElement.remove();
    notificationElement = null;
  }
  interactionNotificationShown = false;
}

/**
 * Completely removes notification elements from the DOM
 */
function removeInteractionNotification(): void {
  // Only remove the notification if it belongs to this feature
  if (notificationElement && notificationElement.getAttribute("data-adt-notification-source") === "sound-fx") {
    notificationElement.remove();
    notificationElement = null;

    // Only remove the style element if no other notifications are present
    if (notificationStyleElement && !document.querySelector(".adt-notification")) {
      notificationStyleElement.remove();
      notificationStyleElement = null;
    }
  }

  interactionNotificationShown = false;
}

/**
 * Process game data to trigger sounds based on game events
 */
async function processGameData(gameData: IGameData, oldGameData: IGameData): Promise<void> {
  if (!gameData.match || gameData.match.activated !== undefined || !gameData.match.turns?.length) return;

  const currentThrow = gameData.match.turns[0].throws[gameData.match.turns[0].throws.length - 1];
  if (!currentThrow) return;

  const editMode: boolean = gameData.match.activated !== undefined && gameData.match.activated >= 0;
  if (editMode) return;

  const currentPlayerIndex = gameData.match.player;
  const isLastThrow: boolean = gameData.match.turns[0].throws.length >= 3;
  const throwName: string = currentThrow.segment.name; // S1
  const winner: boolean = gameData.match.winner >= 0 || (gameData.match.variant === "X01" && gameData.match.gameScores[currentPlayerIndex] === 0);
  const busted: boolean = gameData.match.turns[0].busted;
  const points: number = gameData.match.turns[0].points;
  const combinedThrows: string = gameData.match.turns[0].throws.map(t => t.segment.name.toLowerCase()).join("_");

  if (winner) {
    // Check if there's a winner player index and name available
    const winnerPlayerIndex = gameData.match.winner;
    const winnerPlayerName = gameData.match.players?.[winnerPlayerIndex]?.name;

    if (winnerPlayerName) {
      // First try to play player-specific gameshot sound
      const playerSpecificTrigger = `ambient_gameshot_${winnerPlayerName.toLowerCase().replace(/\s+/g, "_")}`;
      console.log(`Autodarts Tools: Trying player-specific gameshot sound "${playerSpecificTrigger}"`);

      // Check if the player-specific sound exists
      const playerSpecificSoundExists = config?.soundFx?.sounds?.some(sound =>
        sound.enabled && sound.triggers && (
          sound.triggers.includes(playerSpecificTrigger)
          || sound.triggers.includes(playerSpecificTrigger.replace("ambient_", ""))
        ),
      );

      if (playerSpecificSoundExists) {
        playSound(playerSpecificTrigger);
      } else {
        // Fallback to regular gameshot sound
        console.log(`Autodarts Tools: No player-specific gameshot sound found for "${winnerPlayerName}", falling back to standard gameshot`);
        playSound("ambient_gameshot");
      }
    } else {
      // Fallback if no player name available
      playSound("ambient_gameshot");
    }
  } else if (busted) {
    playSound("ambient_busted");
  } else if (isLastThrow) {
    playSound(`ambient_${throwName.toLowerCase()}`);
    playSound(`ambient_${points}`);
    playSound(`ambient_${combinedThrows}`);
  } else {
    playSound(`ambient_${throwName.toLowerCase()}`);
  }
}

/**
 * Play a sound based on the trigger
 * Adds the sound to a queue to be played sequentially
 */
function playSound(trigger: string): void {
  if (!config?.soundFx?.sounds || !config.soundFx.sounds.length) {
    console.log("Autodarts Tools: No sounds configured");
    return;
  }

  // Find all sounds that match the trigger
  let matchingSounds = config.soundFx.sounds.filter(sound =>
    sound.enabled && sound.triggers && sound.triggers.includes(trigger),
  );

  // If no direct match, try to find a fallback without the ambient_ prefix
  if (!matchingSounds.length && trigger.startsWith("ambient_")) {
    const withoutAmbientPrefix = trigger.replace("ambient_", "");
    console.log(`Autodarts Tools: Trying fallback sound for "${trigger}" -> "${withoutAmbientPrefix}"`);
    matchingSounds = config.soundFx.sounds.filter(sound =>
      sound.enabled && sound.triggers && sound.triggers.includes(withoutAmbientPrefix),
    );

    if (matchingSounds.length) {
      console.log(`Autodarts Tools: Using fallback sound for "${trigger}" -> "${withoutAmbientPrefix}"`);
    }
  }

  // If still no match, try to find a fallback only for s, d, or t prefixes
  // For example, if "s41" is not found, try "41"
  if (!matchingSounds.length && trigger.length > 1) {
    // Handle both ambient_ prefixed and non-ambient prefixed triggers
    const triggerWithoutAmbient = trigger.startsWith("ambient_")
      ? trigger.replace("ambient_", "")
      : trigger;

    const firstChar = triggerWithoutAmbient.charAt(0).toLowerCase();

    // Check for miss prefix (m) and fallback to "outside"
    // But only if the trigger doesn't contain an underscore (to avoid combined throws)
    if (firstChar === "m" && !triggerWithoutAmbient.includes("_")) {
      const number = triggerWithoutAmbient.substring(1);

      // Check if the rest is a number (for m<NUMBER> pattern)
      if (/^\d+$/.test(number)) {
        console.log(`Autodarts Tools: Using fallback chain for "ambient_m${number}" -> "ambient_miss" -> "ambient_outside" -> "miss" -> "outside"`);

        // Try ambient_miss first
        matchingSounds = config.soundFx.sounds.filter(sound =>
          sound.enabled && sound.triggers && sound.triggers.includes("ambient_miss"),
        );

        // If no ambient_miss, try ambient_outside
        if (!matchingSounds.length) {
          matchingSounds = config.soundFx.sounds.filter(sound =>
            sound.enabled && sound.triggers && sound.triggers.includes("ambient_outside"),
          );
        }

        // If no ambient_outside, try miss
        if (!matchingSounds.length) {
          matchingSounds = config.soundFx.sounds.filter(sound =>
            sound.enabled && sound.triggers && sound.triggers.includes("miss"),
          );
        }

        // If no miss, try outside
        if (!matchingSounds.length) {
          matchingSounds = config.soundFx.sounds.filter(sound =>
            sound.enabled && sound.triggers && sound.triggers.includes("outside"),
          );
        }

        if (matchingSounds.length) {
          console.log(`Autodarts Tools: Found sound in fallback chain for "ambient_m${number}"`);
        }
      } else {
        // Original fallback for "m" without a number
        console.log(`Autodarts Tools: Using fallback sound for "${trigger}" -> "outside"`);
        matchingSounds = config.soundFx.sounds.filter(sound =>
          sound.enabled && sound.triggers && (
            sound.triggers.includes("ambient_outside")
            || sound.triggers.includes("outside")
          ),
        );
      }
    } else if (firstChar === "d" || firstChar === "t") {
      // For double (d) and triple (t) prefixes, try multiple fallbacks
      const number = triggerWithoutAmbient.substring(1);

      // Only proceed if the rest is a number
      if (/^\d+$/.test(number)) {
        // First try "double" or "triple" as fallback
        const wordFallback = firstChar === "d" ? "double" : "triple";
        const ambientWordFallback = `ambient_${wordFallback}`;

        console.log(`Autodarts Tools: Trying fallback sound for "${trigger}" -> "${wordFallback}" or "${ambientWordFallback}"`);
        matchingSounds = config.soundFx.sounds.filter(sound =>
          sound.enabled && sound.triggers && (
            sound.triggers.includes(ambientWordFallback)
            || sound.triggers.includes(wordFallback)
          ),
        );

        if (matchingSounds.length) {
          console.log(`Autodarts Tools: Using fallback sound for "${trigger}" -> "${wordFallback}" or "${ambientWordFallback}"`);

          // Play the word fallback sound
          const randomIndex = Math.floor(Math.random() * matchingSounds.length);
          const soundToPlay = matchingSounds[randomIndex];

          // Add to queue
          if (soundToPlay.url || soundToPlay.base64) {
            soundQueue.push({
              url: soundToPlay.url,
              base64: soundToPlay.base64,
              name: soundToPlay.name,
            });

            // Also try to play the number sound right after
            console.log(`Autodarts Tools: Also trying to play number "${number}" after ${wordFallback}`);
            const numberSounds = config.soundFx.sounds.filter(sound =>
              sound.enabled && sound.triggers && (
                sound.triggers.includes(`ambient_${number}`)
                || sound.triggers.includes(number)
              ),
            );

            if (numberSounds.length) {
              const randomNumberIndex = Math.floor(Math.random() * numberSounds.length);
              const numberSoundToPlay = numberSounds[randomNumberIndex];

              if (numberSoundToPlay.url || numberSoundToPlay.base64) {
                soundQueue.push({
                  url: numberSoundToPlay.url,
                  base64: numberSoundToPlay.base64,
                  name: numberSoundToPlay.name,
                });
                console.log(`Autodarts Tools: Added number "${number}" sound to queue`);
              }
            }

            // Start playing if not already playing
            if (!isPlaying) {
              playNextSound();
            }

            // Return early since we've handled the sound playing
            return;
          }
        } else {
          // If no "double"/"triple" sound, fall back to just the number
          console.log(`Autodarts Tools: Trying fallback sound for "${trigger}" -> "${number}"`);
          matchingSounds = config.soundFx.sounds.filter(sound =>
            sound.enabled && sound.triggers && (
              sound.triggers.includes(`ambient_${number}`)
              || sound.triggers.includes(number)
            ),
          );

          if (matchingSounds.length) {
            console.log(`Autodarts Tools: Using fallback sound for "${trigger}" -> "${number}"`);
          }
        }
      }
    } else if (firstChar === "s") {
      // Only use fallback for s (single) prefix
      const fallbackTrigger = triggerWithoutAmbient.substring(1);

      // Only proceed if the rest is a number
      if (/^\d+$/.test(fallbackTrigger)) {
        // Skip s<NUMBER> check if we already tried it in the "without ambient_" fallback
        const shouldCheckSNumber = !trigger.startsWith("ambient_")
          || (trigger.startsWith("ambient_") && trigger.replace("ambient_", "") !== `s${fallbackTrigger}`);

        if (shouldCheckSNumber) {
          // Try s<NUMBER> without ambient prefix
          console.log(`Autodarts Tools: Trying fallback sound for "${trigger}" -> "s${fallbackTrigger}"`);
          matchingSounds = config.soundFx.sounds.filter(sound =>
            sound.enabled && sound.triggers && sound.triggers.includes(`s${fallbackTrigger}`),
          );

          if (matchingSounds.length) {
            console.log(`Autodarts Tools: Using fallback sound for "${trigger}" -> "s${fallbackTrigger}"`);

            // Play the s<NUMBER> fallback sound
            const randomIndex = Math.floor(Math.random() * matchingSounds.length);
            const soundToPlay = matchingSounds[randomIndex];

            // Add to queue
            if (soundToPlay.url || soundToPlay.base64) {
              soundQueue.push({
                url: soundToPlay.url,
                base64: soundToPlay.base64,
                name: soundToPlay.name,
              });

              // Start playing if not already playing
              if (!isPlaying) {
                playNextSound();
              }

              // Return early since we've handled the sound playing
              return;
            }
          }
        }

        // If no s<NUMBER> sound or we skipped that check, fall back to just the number
        if (!matchingSounds.length) {
          console.log(`Autodarts Tools: Trying fallback sound for "${trigger}" -> "${fallbackTrigger}"`);
          matchingSounds = config.soundFx.sounds.filter(sound =>
            sound.enabled && sound.triggers && (
              sound.triggers.includes(`ambient_${fallbackTrigger}`)
              || sound.triggers.includes(fallbackTrigger)
            ),
          );

          if (matchingSounds.length) {
            console.log(`Autodarts Tools: Using fallback sound for "${trigger}" -> "${fallbackTrigger}"`);
          }
        }
      }
    }
  }

  // Special case: fallback from "miss" to "outside"
  if (!matchingSounds.length && trigger.toLowerCase() === "ambient_miss") {
    matchingSounds = config.soundFx.sounds.filter(sound =>
      sound.enabled && sound.triggers && (
        sound.triggers.includes("ambient_outside")
        || sound.triggers.includes("outside")
      ),
    );

    if (matchingSounds.length) {
      console.log("Autodarts Tools: Using fallback sound for \"ambient_miss\" -> \"ambient_outside\" or \"outside\"");
    }
  }

  // If we found matching sounds
  if (matchingSounds.length) {
    // If multiple sounds match the trigger, pick a random one
    const randomIndex = Math.floor(Math.random() * matchingSounds.length);
    const soundToPlay = matchingSounds[randomIndex];

    console.log("Autodarts Tools: Found matching sound", soundToPlay.name);

    // Check if the sound has either URL or base64 data
    if (!soundToPlay.url && !soundToPlay.base64) {
      console.error("Autodarts Tools: Sound has neither URL nor base64 data", soundToPlay);
      return;
    }

    // Add to queue with both url and base64 properties
    soundQueue.push({
      url: soundToPlay.url,
      base64: soundToPlay.base64,
      name: soundToPlay.name,
    });
    console.log("Autodarts Tools: Queue length after adding", soundQueue.length);

    // If not currently playing, start playing
    if (!isPlaying) {
      playNextSound();
    }
  } else {
    console.log(`Autodarts Tools: No sound found for trigger "${trigger}"`);
  }
}

/**
 * Play the next sound in the queue
 */
function playNextSound(): void {
  console.log("Autodarts Tools: playNextSound called, queue length:", soundQueue.length);

  if (soundQueue.length === 0) {
    console.log("Autodarts Tools: Sound queue is empty");
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const nextSound = soundQueue.shift();

  console.log("Autodarts Tools: Next sound to play:", nextSound?.name);

  if (nextSound) {
    console.log("Autodarts Tools: Playing sound");

    try {
      // Get the next audio element from the pool
      const audioElement = audioPool[currentAudioIndex];

      // Make sure the audio element exists
      if (!audioElement) {
        console.error("Autodarts Tools: Audio element not found in pool");
        isPlaying = false;
        return;
      }

      // Update index for next use
      currentAudioIndex = (currentAudioIndex + 1) % AUDIO_POOL_SIZE;

      // Stop any current playback
      audioElement.pause();

      // Try URL first if available
      if (nextSound.url) {
        console.log("Autodarts Tools: Using URL source");

        // Set the source to the URL
        audioElement.src = nextSound.url;

        // Play the sound
        audioElement.play()
          .then(() => {
            console.log("Autodarts Tools: URL sound playing successfully");
          })
          .catch((error) => {
            console.error("Autodarts Tools: Error playing URL sound", error);

            // Check if the error is due to user interaction requirement
            if (
              error.toString().includes("failed because the user didn't interact with the document first") // chrome
              || error.toString().includes("The play method is not allowed by the user agent") // firefox
              || error.toString().includes("The request is not allowed by the user agent") // safari
            ) {
              showInteractionNotification();
              unlockAudio(); // Try to unlock audio again
            }

            // If URL fails and we have base64, try that as fallback
            if (nextSound.base64) {
              console.log("Autodarts Tools: Falling back to base64 after URL failure");
              playBase64Sound(nextSound.base64);
            } else {
              // Move to next sound
              playNextSound();
            }
          });
      } else if (nextSound.base64) { // If no URL, try base64
        playBase64Sound(nextSound.base64);
      } else {
        console.error("Autodarts Tools: Sound has neither URL nor base64 data");
        // Move to next sound
        playNextSound();
      }
    } catch (error) {
      console.error("Autodarts Tools: Exception while setting up audio", error);
      // Move to next sound on error
      playNextSound();
    }
  } else {
    console.error("Autodarts Tools: nextSound is unexpectedly empty even though queue had items");
    isPlaying = false;
  }
}

/**
 * Play a sound from base64 data
 */
function playBase64Sound(base64Data: string): void {
  console.log("Autodarts Tools: Using base64 source");

  try {
    // Create a blob URL from the base64 data
    const audioUrl = createAudioBlobUrl(base64Data);

    if (!audioUrl) {
      console.error("Autodarts Tools: Failed to create audio blob URL");
      playNextSound();
      return;
    }

    // Add URL to tracking array for later revocation
    blobUrlsToRevoke.push(audioUrl);

    // Get the next audio element from the pool
    const audioElement = audioPool[currentAudioIndex];

    // Make sure the audio element exists
    if (!audioElement) {
      console.error("Autodarts Tools: Audio element not found in pool for base64");
      URL.revokeObjectURL(audioUrl);
      const index = blobUrlsToRevoke.indexOf(audioUrl);
      if (index > -1) {
        blobUrlsToRevoke.splice(index, 1);
      }
      playNextSound();
      return;
    }

    // Update index for next use
    currentAudioIndex = (currentAudioIndex + 1) % AUDIO_POOL_SIZE;

    // Stop any current playback
    audioElement.pause();

    // Set the source to the blob URL
    audioElement.src = audioUrl;

    // Play the sound
    audioElement.play()
      .then(() => {
        console.log("Autodarts Tools: Base64 sound playing successfully");
      })
      .catch((error) => {
        console.error("Autodarts Tools: Base64 sound playback failed", error);

        // Check if error is due to user interaction requirement
        if (
          error.toString().includes("failed because the user didn't interact with the document first") // chrome
          || error.toString().includes("The play method is not allowed by the user agent") // firefox
          || error.toString().includes("The request is not allowed by the user agent") // safari
        ) {
          showInteractionNotification();
          unlockAudio(); // Try to unlock audio again
        }

        URL.revokeObjectURL(audioUrl);
        const index = blobUrlsToRevoke.indexOf(audioUrl);
        if (index > -1) {
          blobUrlsToRevoke.splice(index, 1);
        }
        playNextSound();
      });
  } catch (error) {
    console.error("Autodarts Tools: Error processing base64 data", error);
    playNextSound();
  }
}

/**
 * Create a blob URL from base64 data
 * Returns null if the conversion fails
 */
function createAudioBlobUrl(base64Data: string): string | null {
  try {
    // First, extract the actual base64 data if it's a data URL
    let rawBase64 = base64Data;

    // If it's a data URL (starts with data:), extract just the base64 part
    if (base64Data.startsWith("data:")) {
      const commaIndex = base64Data.indexOf(",");
      if (commaIndex !== -1) {
        rawBase64 = base64Data.substring(commaIndex + 1);
      } else {
        console.error("Autodarts Tools: Invalid data URL format");
        return null;
      }
    }

    // Clean the base64 string - remove whitespace, newlines, etc.
    rawBase64 = rawBase64.replace(/[\s\r\n]+/g, "");

    // Handle potential padding issues
    // Base64 strings should have a length that is a multiple of 4
    while (rawBase64.length % 4 !== 0) {
      rawBase64 += "=";
    }

    // Remove any characters that aren't valid in base64
    rawBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, "");

    // Decode base64 to binary
    let binaryString: string;
    try {
      binaryString = window.atob(rawBase64);
    } catch (e) {
      console.error("Autodarts Tools: Base64 decoding failed", e);

      // Log a sample of the problematic string to help with debugging
      console.error("Autodarts Tools: Problem with base64 string:",
        rawBase64.length > 50 ? `${rawBase64.substring(0, 50)}...` : rawBase64);

      return null;
    }

    // Create a typed array from the binary string
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create a blob and object URL
    // Try to determine the MIME type from the data URL if available
    let mimeType = "audio/mpeg"; // Default MIME type
    if (base64Data.startsWith("data:")) {
      const mimeMatch = base64Data.match(/^data:([^;]+);/);
      if (mimeMatch && mimeMatch[1]) {
        mimeType = mimeMatch[1];
      }
    }

    const blob = new Blob([ bytes ], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Autodarts Tools: Failed to create blob URL", error);
    return null;
  }
}

// Clean up blob URLs periodically to prevent memory leaks
setInterval(() => {
  if (blobUrlsToRevoke.length > 20) {
    console.log("Autodarts Tools: Cleaning up blob URLs", blobUrlsToRevoke.length);
    // Keep the 5 most recent URLs (they might still be in use)
    const urlsToKeep = blobUrlsToRevoke.slice(-5);
    const urlsToRemove = blobUrlsToRevoke.slice(0, -5);

    urlsToRemove.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Autodarts Tools: Error revoking URL", e);
      }
    });

    blobUrlsToRevoke.length = 0;
    blobUrlsToRevoke.push(...urlsToKeep);
  }
}, 60000); // Check every minute
