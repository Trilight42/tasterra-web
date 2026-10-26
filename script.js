let festivalData = null;
let visibleFoodLimit = 30;
let foodLoadMessage = "";

// Uložené akce a splněné výzvy zachováme i po obnovení stránky.
let savedEvents = JSON.parse(
  localStorage.getItem("tasterra-saved-events") || "[]"
);

let completedQuests = JSON.parse(
  localStorage.getItem("tasterra-completed-quests") || "[]"
);

function text(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.cs || value.en || "";
  }
  return "";
}

function saveProgress() {
  localStorage.setItem(
    "tasterra-saved-events",
    JSON.stringify(savedEvents)
  );

  localStorage.setItem(
    "tasterra-completed-quests",
    JSON.stringify(completedQuests)
  );
}

// Načtení skutečných dat z data.json
async function init() {
  try {
    const response = await fetch("./data.json");

    if (!response.ok) {
      throw new Error(`HTTP chyba ${response.status}`);
    }

    festivalData = await response.json();

    renderEvents();
    renderFood();
    renderQuests();
    renderSavedEvents();
  } catch (error) {
    console.error("Nepodařilo se načíst data.json:", error);

    document.querySelector("#event-list").innerHTML =
      "<p>Program se nepodařilo načíst. Zkontroluj, že používáš Live Server.</p>";
  }
}

// Zobrazení programových akcí v rozbalovacích skupinách podle dnů
function renderEvents() {
  const container = document.querySelector("#event-list");
  const selectedDay = document.querySelector("#filter-day").value;
  const selectedType = document.querySelector("#filter-type").value;
  const dayLabels = {
    "2026-10-23": "Pátek 23. října",
    "2026-10-24": "Sobota 24. října",
    "2026-10-25": "Neděle 25. října"
  };

  const filteredEvents = festivalData.events.filter(event => {
    const matchesDay = !selectedDay || event.date === selectedDay;
    const matchesType = !selectedType || event.type === selectedType;
    return matchesDay && matchesType;
  });

  if (filteredEvents.length === 0) {
    container.innerHTML = "<p>Pro vybrané filtry jsme nenašli žádné akce.</p>";
    return;
  }

  const days = selectedDay ? [selectedDay] : Object.keys(dayLabels);
  container.innerHTML = days.map(day => {
    const dayEvents = filteredEvents.filter(event => event.date === day);
    if (dayEvents.length === 0) return "";

    const cards = dayEvents.map(event => {
      const isSaved = savedEvents.includes(event.id);
      const venue = festivalData.venues.find(item => item.id === event.venueId);
      return `
        <article class="card">
          <p>${event.startTime}–${event.endTime}</p>
          <h3>${text(event.title)}</h3>
          <p>${venue ? text(venue.name) : "Místo bude upřesněno"}</p>
          <p>Typ akce: ${event.type}</p>
          <button data-save-event="${event.id}">
            ${isSaved ? "Odebrat z mého programu" : "Přidat do mého programu"}
          </button>
        </article>
      `;
    }).join("");

    return `
      <details class="accordion program-day" ${selectedDay ? "open" : ""}>
        <summary>
          <span>${dayLabels[day] || day}</span>
          <span class="accordion-count">${dayEvents.length} ${dayEvents.length === 1 ? "akce" : "akcí"}</span>
        </summary>
        <div class="accordion-content event-grid">${cards}</div>
      </details>
    `;
  }).join("");
}

// Vyhledávání jídel seskupených do rozbalovacích stánků

function renderFood(searchText = "") {
  const container = document.querySelector("#food-results");
  const query = searchText.trim().toLocaleLowerCase("cs-CZ");

  const menu = festivalData.menuItems.map(item => {
    const stand = festivalData.stands.find(
      stand => stand.id === item.standId
    );
    const country = stand
      ? festivalData.countries.find(
          country => country.id === stand.countryId
        )
      : null;
    const venue = stand
      ? festivalData.venues.find(
          venue => venue.id === stand.venueId
        )
      : null;

    return { item, stand, country, venue };
  });

  const matches = menu.filter(({ item, stand, country, venue }) => {
    const searchableText = [
      text(item.name),
      text(item.description),
      stand ? text(stand.name) : "",
      stand ? text(stand.description) : "",
      country ? text(country.name) : "",
      venue ? text(venue.name) : ""
    ].join(" ").toLocaleLowerCase("cs-CZ");

    return searchableText.includes(query);
  });

  if (matches.length === 0) {
    container.innerHTML = "<p>Nic jsme nenašli. Zkus jiné hledání.</p>";
    return;
  }

  // Zobrazíme vše až do aktuálního limitu.
  const visibleMatches = matches.slice(
    0,
    Math.min(visibleFoodLimit, matches.length)
  );

  // Seskupíme viditelná jídla podle stánků.
  const grouped = new Map();

  visibleMatches.forEach(entry => {
    const key = entry.stand ? entry.stand.id : "unknown-stand";

    if (!grouped.has(key)) {
      grouped.set(key, {
        stand: entry.stand,
        entries: []
      });
    }

    grouped.get(key).entries.push(entry);
  });

  container.innerHTML = [...grouped.values()]
    .map(({ stand, entries }) => {
      const cards = entries.map(({ item, country, venue }) => `
        <article class="card food-card">
          <h4>${text(item.name)}</h4>
          <p>${text(item.description)}</p>
          <p><strong>Země:</strong> ${
            country ? text(country.name) : "Neuvedeno"
          }</p>
          <p><strong>Místo:</strong> ${
            venue ? text(venue.name) : "Neuvedeno"
          }</p>
          <p><strong>Cena:</strong> ${item.priceCzk} Kč</p>
        </article>
      `).join("");

      return `
        <details class="accordion food-stand">
          <summary>
            <span>${stand ? text(stand.name) : "Ostatní nabídka"}</span>
            <span class="accordion-count">
              ${entries.length}
              ${entries.length === 1 ? "položka" : "položek"}
            </span>
          </summary>
          <div class="accordion-content food-grid">
            ${
              stand
                ? `<p class="stand-description">${text(stand.description)}</p>`
                : ""
            }
            ${cards}
          </div>
        </details>
      `;
    }).join("");

  // Tlačítko zobrazíme jen tehdy, když zbývají další výsledky.
  const loadMoreContainer = document.createElement("div");
  loadMoreContainer.className = "load-more-container";

  const status = document.createElement("p");
  status.textContent =
  `Zobrazeno ${visibleMatches.length} z ${matches.length} jídel.` +
  (foodLoadMessage ? ` ${foodLoadMessage}` : "");

  loadMoreContainer.appendChild(status);

  if (visibleMatches.length < matches.length) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.loadMoreFood = "";
    button.textContent = "Zobrazit dalších 30 jídel";
    loadMoreContainer.appendChild(button);
  }

  container.appendChild(loadMoreContainer);
}


// Zobrazení výzev Taste Quest
function renderQuests() {
  const container = document.querySelector("#quest-list");
  const quests = festivalData.tasteQuest.challenges;

  container.innerHTML = quests.map(quest => {
    const isCompleted = completedQuests.includes(quest.id);

    return `
      <article class="card">
        <h3>${text(quest.title)}</h3>
        <p>${text(quest.description)}</p>
        <p>Odměna: ${quest.points} bodů</p>
        <button data-complete-quest="${quest.id}">
          ${isCompleted ? "Označit jako nesplněné" : "Splnit výzvu"}
        </button>
      </article>
    `;
  }).join("");

  const points = quests
    .filter(quest => completedQuests.includes(quest.id))
    .reduce((total, quest) => total + quest.points, 0);

  const rewards = festivalData.tasteQuest.rewards || [];
  const unlockedRewards = rewards.filter(
    reward => points >= reward.requiredPoints
  );

  document.querySelector("#quest-progress").innerHTML = `
    <article class="card">
      <h3>Tvůj postup</h3>
      <p>Splněné výzvy: ${
        quests.filter(quest => completedQuests.includes(quest.id)).length
      } z ${quests.length}</p>
      <p>Nasbírané body: ${points}</p>
      <h3>Odemčené odměny</h3>
      ${
        unlockedRewards.length
          ? unlockedRewards.map(reward =>
              `<p>🏆 ${text(reward.name)}</p>`
            ).join("")
          : "<p>Zatím žádná odměna. Pokračuj ve výzvách!</p>"
      }
    </article>
  `;
}

// Osobní program
function renderSavedEvents() {
  const container = document.querySelector("#saved-events");

  const selectedEvents = festivalData.events.filter(event =>
    savedEvents.includes(event.id)
  );

  if (selectedEvents.length === 0) {
    container.innerHTML = "<p>Zatím nemáš uložené žádné akce.</p>";
    return;
  }

  container.innerHTML = selectedEvents.map(event => `
    <article class="card">
      <p>${event.date} · ${event.startTime}</p>
      <h3>${text(event.title)}</h3>
      <button data-save-event="${event.id}">
        Odebrat z mého programu
      </button>
    </article>
  `).join("");
}

// Filtry a vyhledávání reagují okamžitě.
document.querySelector("#filter-day").addEventListener("change", renderEvents);
document.querySelector("#filter-type").addEventListener("change", renderEvents);

// Obsluha tlačítek
document.addEventListener("click", event => {
  const loadMoreButton = event.target.closest("[data-load-more-food]");

if (loadMoreButton) {
  visibleFoodLimit += 30;
  foodLoadMessage = "Načetli jsme další jídla.";

  renderFood(document.querySelector("#food-search").value);
  return;
}
  const saveButton = event.target.closest("[data-save-event]");
  const questButton = event.target.closest("[data-complete-quest]");

  if (saveButton) {
    const id = saveButton.dataset.saveEvent;

    savedEvents = savedEvents.includes(id)
      ? savedEvents.filter(savedId => savedId !== id)
      : [...savedEvents, id];

    saveProgress();
    renderEvents();
    renderSavedEvents();
  }

  if (questButton) {
    const id = questButton.dataset.completeQuest;

    completedQuests = completedQuests.includes(id)
      ? completedQuests.filter(questId => questId !== id)
      : [...completedQuests, id];

    saveProgress();
    renderQuests();
  }
});

// Reakce na vyhledávání
document.querySelector("#food-search").addEventListener("input", event => {
  visibleFoodLimit = 30;
  foodLoadMessage = "";

  if (festivalData) {
    renderFood(event.target.value);
  }
});

init();

document.querySelector("#filter-day").addEventListener("change", renderEvents);
document.querySelector("#filter-type").addEventListener("change", renderEvents);
