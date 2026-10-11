document.addEventListener("DOMContentLoaded", () => {
    console.log("🟢 Judging JS loaded successfully.");
  
    let currentLevelData = null;
    let currentLives = 3;
    let currentQuestionIndex = 0;
  
    const screenSetup = document.getElementById("screen-setup");
    const screenGame = document.getElementById("screen-game");
    const screenResult = document.getElementById("screen-result");
    const startBtn = document.getElementById("start-btn");
    const againBtn = document.getElementById("again-btn");
  
    const livesDisplay = document.getElementById("lives-display");
    const bossHealth = document.getElementById("boss-health");
    const questProgress = document.getElementById("quest-progress");
    const arenaTitle = document.getElementById("arena-title");
    const qCategory = document.getElementById("q-category");
    const qPrompt = document.getElementById("q-prompt");
    const optionsGrid = document.getElementById("options-grid");
    const resultTitle = document.getElementById("result-title");
    const resultBody = document.getElementById("result-body");
  
    if (!startBtn) {
      console.error("❌ #start-btn element not found in DOM!");
      return;
    }
  
    startBtn.addEventListener("click", async () => {
      console.log("🚀 Start Quest button clicked!");
      startBtn.textContent = "Loading Quest...";
      startBtn.disabled = true;
  
      const selectedRadio = document.querySelector('input[name="difficulty"]:checked');
      const selectedMode = selectedRadio ? selectedRadio.value : 'easy';
  
      try {
        console.log(`📡 Fetching level: /api/judging/level/${selectedMode}`);
        const res = await fetch(`/api/judging/level/${selectedMode}`);
        if (!res.ok) throw new Error(`Server returned status ${res.status}`);
        
        currentLevelData = await res.json();
        console.log("📦 Level data received:", currentLevelData);
  
        currentLives = 3;
        currentQuestionIndex = 0;
        updateHud();
  
        screenSetup.hidden = true;
        screenGame.hidden = false;
        arenaTitle.textContent = `HackPanel: ${currentLevelData.levelName || 'Judge Duel'}`;
        
        const creeper = document.getElementById("creeper");
        if (creeper) {
          creeper.style.opacity = "1";
          creeper.style.transform = "translateX(0)";
          creeper.style.background = "#22c55e";
        }
  
        renderQuestion();
      } catch (err) {
        console.error("❌ Failed to load level data:", err);
        alert("Could not load quest level. Check terminal logs!");
      } finally {
        startBtn.textContent = "Start Quest";
        startBtn.disabled = false;
      }
    });
    function updateHud() {
        if (!currentLevelData) return;
        const totalQ = currentLevelData.questions.length;
        const hpPercent = Math.max(0, ((totalQ - currentQuestionIndex) / totalQ) * 100);
        bossHealth.style.width = `${hpPercent}%`;
        questProgress.textContent = `Q ${currentQuestionIndex + 1}/${totalQ}`;
    
        // Render 3 pixel SVG hearts (Red if active, muted purple/grey if lost)
        let heartsHtml = "";
        for (let i = 0; i < 3; i++) {
          const fillColor = i < currentLives ? "#ef4444" : "#a098b5";
          heartsHtml += `
            <svg width="22" height="20" viewBox="0 0 10 9" shape-rendering="crispEdges" style="margin-right: 2px;">
              <path fill="var(--ink, #4b3a68)" d="M1 0h3v1h2V0h3v1h1v3h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1H2V5H1V4H0V1h1V0z"/>
              <path fill="${fillColor}" d="M2 1h2v2H2V1zm4 0h2v2H6V1zM1 3h8v1H1V3zm1 2h6v1H2V5zm1 2h4v1H3V7zm1 2h2v1H4V9z"/>
            </svg>
          `;
        }
        livesDisplay.innerHTML = heartsHtml;
      }
    
    function renderQuestion() {
      const questions = currentLevelData.questions;
      if (currentQuestionIndex >= questions.length) {
        triggerVictory();
        return;
      }
  
      updateHud();
      const q = questions[currentQuestionIndex];
      qCategory.textContent = q.category;
      qPrompt.textContent = q.prompt;
  
      optionsGrid.innerHTML = q.options.map((opt, index) => `
        <button type="button" class="option-btn" data-correct="${opt.correct}">
          <strong>${String.fromCharCode(65 + index)}.</strong> ${opt.text}
        </button>
      `).join("");
  
      document.querySelectorAll(".option-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const isCorrect = e.currentTarget.getAttribute("data-correct") === "true";
          handleAnswer(isCorrect, currentQuestionIndex >= questions.length - 1);
        });
      });
    }
  
    function handleAnswer(isCorrect, isFinalQuestion) {
      const avatar = document.getElementById("avatar");
      const creeper = document.getElementById("creeper");
  
      if (isCorrect) {
        avatar.style.transform = "translateX(180px) scale(1.1)";
        
        setTimeout(() => {
          if (isFinalQuestion) {
            creeper.style.transform = "scale(1.4)";
            creeper.style.background = "#ff4444";
            setTimeout(() => { creeper.style.opacity = "0"; }, 300);
          } else {
            creeper.style.transform = "translateX(15px) rotate(10deg)";
          }
        }, 200);
  
        setTimeout(() => {
          avatar.style.transform = "translateX(0) scale(1)";
          creeper.style.transform = "translateX(0) rotate(0deg)";
          currentQuestionIndex++;
          renderQuestion();
        }, 750);
  
      } else {
        currentLives--;
        updateHud();
  
        creeper.style.transform = "translateX(-120px) scale(1.1)";
        avatar.style.transform = "translateX(-10px)";
  
        setTimeout(() => {
          creeper.style.transform = "translateX(0) scale(1)";
          avatar.style.transform = "translateX(0)";
        }, 350);
  
        if (currentLives <= 0) {
          setTimeout(triggerGameOver, 500);
        }
      }
    }
  
    function triggerVictory() {
      screenGame.hidden = true;
      screenResult.hidden = false;
      document.getElementById("result-header").textContent = "🏆 Victory!";
      resultTitle.textContent = "Quest Complete!";
      resultBody.innerHTML = `<p>You defeated the <strong>${currentLevelData.creeperName}</strong> and defended your codebase!</p>`;
    }
  
    function triggerGameOver() {
      screenGame.hidden = true;
      screenResult.hidden = false;
      document.getElementById("result-header").textContent = "💥 Game Over";
      resultTitle.textContent = "BOOM! Codebase Destroyed";
      resultBody.innerHTML = `<p>The <strong>${currentLevelData.creeperName}</strong> blew up your project. Try again!</p>`;
    }
  
    if (againBtn) {
      againBtn.addEventListener("click", () => {
        screenResult.hidden = true;
        screenSetup.hidden = false;
      });
    }
  });