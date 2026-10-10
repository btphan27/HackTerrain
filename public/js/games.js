const form = document.getElementById("challenge-form");
const result = document.getElementById("challenge-result");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const topic = form.topic.value;
  const difficulty = form.difficulty.value;

  result.textContent = "Generating...";
  try {
    const res = await fetch("/api/games/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, difficulty }),
    });
    if (!res.ok) throw new Error("Server error " + res.status);
    showChallenge(await res.json());
  } catch (err) {
    result.textContent = "Something went wrong: " + err.message;
  }
});

function showChallenge(c) {
  result.innerHTML = "";
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h3");
  title.textContent = c.title;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${c.difficulty} • ${c.timeLimitMinutes} min`;
  const desc = document.createElement("p");
  desc.textContent = c.description;
  const deliverable = document.createElement("p");
  deliverable.textContent = "Deliverable: " + c.deliverable;

  const solutionBtn = document.createElement("button");
  solutionBtn.className = "btn btn-secondary";
  solutionBtn.textContent = "I give up, show solution";
  const solution = document.createElement("p");

  solutionBtn.addEventListener("click", async () => {
    const res = await fetch(`/api/games/${c.id}/solution`);
    const data = await res.json();
    solution.textContent = data.solution;
    solutionBtn.remove();
  });

  card.append(title, meta, desc, deliverable, solutionBtn, solution);
  result.append(card);
}