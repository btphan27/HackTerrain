document.addEventListener("DOMContentLoaded", () => {
    let currentRoundData = null;
    let currentHintIndex = 0;
    let keptFeatureIds = new Set();
    let projectsPool = [];
    let selectedDifficulty = "medium";
  
    const setupStatusEl = document.getElementById("setup-status");
    const statusEl = document.getElementById("mvp-status");
    const screenSetup = document.getElementById("screen-setup");
    const screenRound = document.getElementById("screen-round");
    const screenResult = document.getElementById("screen-result");
  
    const startBtn = document.getElementById("start-btn");
    const againBtn = document.getElementById("again-btn");
    const submitBtn = document.getElementById("submit-btn");
  
    // Quit buttons handler: Exit back to quests hub
    document.querySelectorAll(".quit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = "/games";
      });
    });
  
    const roundMeta = document.getElementById("round-meta");
    const roundBrief = document.getElementById("round-brief");
    const featureGrid = document.getElementById("feature-grid");
    const keptCount = document.getElementById("kept-count");
    const hintBtn = document.getElementById("hint-btn");
    const hintList = document.getElementById("hint-list");
    const storyInput = document.getElementById("story");
    const reasonInput = document.getElementById("reason");
    const resultBody = document.getElementById("result-body");
  
    // Load fallback dataset
    fetch('/data/fallback-mvp.json')
      .then(res => res.json())
      .catch(() => [])
      .then(data => { projectsPool = data; });
  
    startBtn.addEventListener("click", async () => {
      const difficultyInput = document.querySelector('input[name="difficulty"]:checked');
      selectedDifficulty = difficultyInput ? difficultyInput.value : "medium";
  
      setupStatusEl.textContent = "⛏️ Mining your quest...";
      setupStatusEl.className = "mvp-status";
      startBtn.disabled = true;
  
      const randomProject = projectsPool.length > 0 
        ? projectsPool[Math.floor(Math.random() * projectsPool.length)].project 
        : { title: "Hack Project", tagline: "An awesome tool", description: "Build something cool." };
  
      try {
        const response = await fetch("/api/mvp/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectData: randomProject, level: selectedDifficulty })
        });
  
        if (!response.ok) throw new Error("Failed to generate round");
  
        currentRoundData = await response.json();
        currentRoundData.difficulty = selectedDifficulty;
        
        setupRoundUI(currentRoundData);
        
        screenSetup.hidden = true;
        screenRound.hidden = false;
        setupStatusEl.textContent = "";
      } catch (err) {
        console.error(err);
        setupStatusEl.textContent = "❌ Failed to start round. Check API key!";
        setupStatusEl.className = "mvp-status is-error";
      } finally {
        startBtn.disabled = false;
      }
    });
  
    function setupRoundUI(data) {
      roundMeta.textContent = `Team Size: ${data.teamSize} people | Time: ${data.hoursAvailable} hours | Difficulty: ${data.difficulty.toUpperCase()}`;
      roundBrief.textContent = data.brief;
  
      keptFeatureIds.clear();
      currentHintIndex = 0;
      hintList.innerHTML = "";
      storyInput.value = "";
      reasonInput.value = "";
      updateKeptCount();
      updateHintButtonText();
  
      featureGrid.innerHTML = data.features.map(f => `
        <button type="button" class="mvp-feature" data-id="${f.id}" aria-pressed="false">
          <span class="mvp-state">[ ] Skip</span>
          <strong>${f.name}</strong>
          <span>${f.description}</span>
        </button>
      `).join("");
  
      document.querySelectorAll(".mvp-feature").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const isPressed = btn.getAttribute("aria-pressed") === "true";
          
          if (isPressed) {
            btn.setAttribute("aria-pressed", "false");
            btn.querySelector(".mvp-state").textContent = "[ ] Skip";
            keptFeatureIds.delete(id);
          } else {
            btn.setAttribute("aria-pressed", "true");
            btn.querySelector(".mvp-state").textContent = "[✓] Keep";
            keptFeatureIds.add(id);
          }
          updateKeptCount();
        });
      });
    }
  
    function updateKeptCount() {
      keptCount.textContent = `Kept ${keptFeatureIds.size} of ${currentRoundData.features.length} features`;
    }
  
    hintBtn.addEventListener("click", () => {
      if (!currentRoundData || !currentRoundData.hints) return;
      const totalHints = currentRoundData.hints.length;
      
      if (currentHintIndex < totalHints) {
        const p = document.createElement("p");
        p.className = "mvp-hint";
        p.style.marginTop = "0.5rem";
        p.textContent = `Hint (${currentHintIndex + 1}/${totalHints}): ${currentRoundData.hints[currentHintIndex]}`;
        hintList.appendChild(p);
        currentHintIndex++;
        updateHintButtonText();
      }
    });
  
    function updateHintButtonText() {
      if (!currentRoundData || !currentRoundData.hints) return;
      const totalHints = currentRoundData.hints.length;
      const remaining = totalHints - currentHintIndex;
      
      if (remaining > 0) {
        hintBtn.textContent = `Need a hint? (${remaining}/${totalHints} remaining)`;
        hintBtn.disabled = false;
      } else {
        hintBtn.textContent = "No more hints (0 remaining)";
        hintBtn.disabled = true;
      }
    }
  
    submitBtn.addEventListener("click", async () => {
      if (submitBtn.disabled) return;
  
      if (keptFeatureIds.size === 0) {
        setTemporaryStatus("⚠️ You must keep at least one feature for your MVP!", true, 3000);
        return;
      }
      if (!storyInput.value.trim()) {
        setTemporaryStatus("⚠️ Please describe your demo story first.", true, 3000);
        return;
      }
  
      setTemporaryStatus("⏳ Coach Gemini is evaluating your scope...", false, 0);
      submitBtn.disabled = true;
      submitBtn.textContent = "Evaluating...";
  
      try {
        const response = await fetch("/api/mvp/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: currentRoundData.brief,
            features: currentRoundData.features,
            shippedIds: currentRoundData.shippedIds,
            keptIds: Array.from(keptFeatureIds),
            demoStory: storyInput.value,
            cutReason: reasonInput.value,
            hoursAvailable: currentRoundData.hoursAvailable,
            teamSize: currentRoundData.teamSize
          })
        });
  
        if (!response.ok) throw new Error("Scoring failed");
        const result = await response.json();
  
        renderResults(result);
        screenRound.hidden = true;
        screenResult.hidden = false;
        clearStatus();
      } catch (err) {
        console.error(err);
        setTemporaryStatus("❌ Failed to score round. Check API key or console.", true, 3000);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Lock in my MVP";
      }
    });
  
    function setTemporaryStatus(msg, isError, duration = 3000) {
      statusEl.textContent = msg;
      statusEl.className = isError ? "mvp-status is-error" : "mvp-status";
      
      if (isError && duration > 0) {
        setTimeout(() => {
          if (statusEl.textContent === msg) {
            clearStatus();
          }
        }, duration);
      }
    }
  
    function clearStatus() {
      statusEl.textContent = "";
      statusEl.className = "mvp-status";
    }
  
    function renderResults(res) {
      const realShippedSet = new Set(currentRoundData.shippedIds);
      
      let reviewHtml = currentRoundData.features.map(f => {
        const kept = keptFeatureIds.has(f.id);
        const shipped = realShippedSet.has(f.id);
        
        let statusClass = "is-extra";
        let tagText = "Cut";
        if (kept && shipped) { statusClass = "is-matched"; tagText = "Kept & Shipped (Correct!)"; }
        else if (!kept && !shipped) { statusClass = "is-matched"; tagText = "Correctly Cut"; }
        else if (kept && !shipped) { statusClass = "is-extra"; tagText = "Kept (Scope Creep)"; }
        else if (!kept && shipped) { statusClass = "is-missed"; tagText = "Cut (Missed Core Feature)"; }
  
        return `
          <li class="${statusClass}">
            <span class="mvp-tag">${f.name} — ${tagText}</span>
            <span>${f.description}</span>
          </li>
        `;
      }).join("");
  
      resultBody.innerHTML = `
        <p class="mvp-score">Core Loop Score: ${res.coreLoopScore}/5 | Demo Score: ${res.demoScore}/5</p>
        <p><strong>Coach Feedback:</strong> ${res.feedback}</p>
        <p><strong>Try Next Time:</strong> ${res.tryNext}</p>
        <p><strong>Winners' Note:</strong> ${currentRoundData.shippedNote}</p>
        
        <h3>Feature Breakdown</h3>
        <ul class="mvp-review">${reviewHtml}</ul>
      `;
    }
  
    againBtn.addEventListener("click", () => {
      screenResult.hidden = true;
      screenSetup.hidden = false;
      clearStatus();
    });
  });