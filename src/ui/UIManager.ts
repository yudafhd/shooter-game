import { WORLD_LIST } from '../data/worlds';
import { STAGES } from '../data/stages';
import { UPGRADE_SPECS } from '../gameplay/SaveManager';
import type { GameEngine, EngineMode } from '../engine/GameEngine';
import type { HUDState, QualityPreset, StageResult, UpgradeLevels } from '../types/game';

type ModalScreen = 'none' | 'menu' | 'stages' | 'upgrades' | 'settings' | 'pause' | 'result' | 'loading';

export class UIManager {
  private root: HTMLElement;
  private engine: GameEngine;
  private currentModal: ModalScreen = 'loading';
  private returnModalAfterSettings: ModalScreen = 'menu';

  // HUD elements
  private hudEl!: HTMLElement;
  private hudStageEl!: HTMLElement;
  private hudWaveEl!: HTMLElement;
  private hudSquadEl!: HTMLElement;
  private hudCoinsEl!: HTMLElement;
  private hudProgressFill!: HTMLElement;
  private hudBuffsEl!: HTMLElement;
  private hudFpsEl!: HTMLElement;
  private bossBarWrap!: HTMLElement;
  private bossNameEl!: HTMLElement;
  private bossPhaseEl!: HTMLElement;
  private bossHpFill!: HTMLElement;
  private bossHpText!: HTMLElement;
  private bossWarnEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private dragHintEl!: HTMLElement;
  private bannerTimeout = 0;

  // Overlays
  private overlayContainer!: HTMLElement;
  private loadingEl!: HTMLElement;
  private loadingFill!: HTMLElement;
  private loadingLabel!: HTMLElement;

  constructor(root: HTMLElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;
    this.buildShell();
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <div id="hud" class="hud hidden">
        <div class="hud-top">
          <div class="hud-left">
            <div class="hud-pill hud-stage" id="hud-stage">STAGE 1 · Ocean Crossing</div>
            <div class="hud-pill hud-wave" id="hud-wave">WAVE 1/4 · Normal Wave</div>
          </div>
          <div class="hud-center">
            <div class="progress-track">
              <div class="progress-fill" id="hud-progress-fill"></div>
            </div>
            <div class="hud-buffs" id="hud-buffs"></div>
          </div>
          <div class="hud-right">
            <div class="hud-pill hud-squad">
              <span class="pill-label">SQUAD</span>
              <span class="pill-val" id="hud-squad">6 / 40</span>
            </div>
            <div class="hud-pill hud-coins">
              <span class="pill-label">COINS</span>
              <span class="pill-val" id="hud-coins">0</span>
            </div>
            <div class="hud-pill hud-fps hidden" id="hud-fps">60 FPS</div>
            <button class="icon-btn" id="btn-pause" aria-label="Pause">❚❚</button>
          </div>
        </div>

        <div class="boss-hud hidden" id="boss-hud">
          <div class="boss-header">
            <span class="boss-name" id="boss-name">BOSS</span>
            <span class="boss-phase hidden" id="boss-phase">PHASE 2</span>
            <span class="boss-hp-text" id="boss-hp-text">500 / 500</span>
          </div>
          <div class="boss-bar-bg">
            <div class="boss-bar-fill" id="boss-hp-fill"></div>
          </div>
          <div class="boss-warning hidden" id="boss-warning"></div>
        </div>

        <div class="event-banner hidden" id="event-banner"></div>
        <div class="drag-hint hidden" id="drag-hint">↔ DRAG LEFT / RIGHT (OR A / D) TO STEER SQUAD</div>
      </div>

      <div id="overlay-container" class="overlay-container"></div>

      <div id="loading-overlay" class="loading-overlay">
        <div class="loading-card">
          <div class="loading-title">CROWD SIEGE 3D</div>
          <div class="loading-bar"><div class="loading-bar-fill" id="loading-fill"></div></div>
          <div class="loading-label" id="loading-label">Preparing battlefield assets...</div>
        </div>
      </div>
    `;

    this.hudEl = this.root.querySelector('#hud')!;
    this.hudStageEl = this.root.querySelector('#hud-stage')!;
    this.hudWaveEl = this.root.querySelector('#hud-wave')!;
    this.hudSquadEl = this.root.querySelector('#hud-squad')!;
    this.hudCoinsEl = this.root.querySelector('#hud-coins')!;
    this.hudProgressFill = this.root.querySelector('#hud-progress-fill')!;
    this.hudBuffsEl = this.root.querySelector('#hud-buffs')!;
    this.hudFpsEl = this.root.querySelector('#hud-fps')!;
    this.bossBarWrap = this.root.querySelector('#boss-hud')!;
    this.bossNameEl = this.root.querySelector('#boss-name')!;
    this.bossPhaseEl = this.root.querySelector('#boss-phase')!;
    this.bossHpFill = this.root.querySelector('#boss-hp-fill')!;
    this.bossHpText = this.root.querySelector('#boss-hp-text')!;
    this.bossWarnEl = this.root.querySelector('#boss-warning')!;
    this.bannerEl = this.root.querySelector('#event-banner')!;
    this.dragHintEl = this.root.querySelector('#drag-hint')!;
    this.overlayContainer = this.root.querySelector('#overlay-container')!;
    this.loadingEl = this.root.querySelector('#loading-overlay')!;
    this.loadingFill = this.root.querySelector('#loading-fill')!;
    this.loadingLabel = this.root.querySelector('#loading-label')!;

    this.root.querySelector('#btn-pause')!.addEventListener('click', () => {
      this.clickSfx();
      this.engine.pause();
    });
  }

  private clickSfx(): void {
    this.engine.audio.play('sfx_ui_click', 0.7, 30, 0.05);
  }

  public setLoading(percent: number, label: string): void {
    this.loadingEl.classList.remove('hidden');
    this.loadingFill.style.width = `${Math.max(4, Math.min(100, percent))}%`;
    this.loadingLabel.textContent = label;
  }

  public hideLoading(): void {
    this.loadingEl.classList.add('hidden');
  }

  public onModeChange(mode: EngineMode): void {
    if (mode === 'loading') {
      this.hudEl.classList.add('hidden');
      this.overlayContainer.innerHTML = '';
      this.loadingEl.classList.remove('hidden');
      this.currentModal = 'loading';
      return;
    }

    this.hideLoading();

    if (mode === 'playing' || mode === 'victory_march') {
      this.currentModal = 'none';
      this.overlayContainer.innerHTML = '';
      this.hudEl.classList.remove('hidden');
      this.showDragHintBriefly();
    } else if (mode === 'paused') {
      this.showPauseMenu();
    } else if (mode === 'menu') {
      this.hudEl.classList.add('hidden');
      this.showMainMenu();
    }
  }

  private showDragHintBriefly(): void {
    this.dragHintEl.classList.remove('hidden');
    window.setTimeout(() => {
      this.dragHintEl.classList.add('hidden');
    }, 3600);
  }

  public showBanner(text: string, tone: 'good' | 'bad' | 'buff'): void {
    window.clearTimeout(this.bannerTimeout);
    this.bannerEl.textContent = text;
    this.bannerEl.className = `event-banner tone-${tone}`;
    this.bannerTimeout = window.setTimeout(() => {
      this.bannerEl.classList.add('hidden');
    }, 2200);
  }

  public updateHud(hud: HUDState): void {
    this.hudStageEl.textContent = `STAGE ${hud.stageNumber} · ${hud.worldName}`;
    this.hudWaveEl.textContent = `WAVE ${hud.waveNumber}/${hud.totalWaves} · ${hud.waveLabel}`;
    this.hudSquadEl.textContent = `${hud.squadCount} / ${hud.maxSquad}`;
    this.hudCoinsEl.textContent = hud.coins.toLocaleString();
    this.hudProgressFill.style.width = `${Math.round(hud.progress * 100)}%`;

    const buffs: string[] = [];
    if (hud.damageBuffPct > 0) buffs.push(`+${hud.damageBuffPct}% DMG`);
    if (hud.rateBuffPct > 0) buffs.push(`+${hud.rateBuffPct}% RATE`);
    this.hudBuffsEl.innerHTML = buffs.map((b) => `<span class="buff-chip">${b}</span>`).join('');

    const showFps = this.engine.save.getSettings().showFps;
    this.hudFpsEl.classList.toggle('hidden', !showFps);
    if (showFps) {
      this.hudFpsEl.textContent = `${hud.fps} FPS (${hud.quality.toUpperCase()})`;
    }

    if (hud.bossActive) {
      this.bossBarWrap.classList.remove('hidden');
      this.bossNameEl.textContent = hud.bossName;
      this.bossPhaseEl.classList.toggle('hidden', hud.bossPhase < 2);
      const pct = Math.max(0, Math.min(100, (hud.bossHp / Math.max(1, hud.bossMaxHp)) * 100));
      this.bossHpFill.style.width = `${pct}%`;
      this.bossHpText.textContent = `${hud.bossHp.toLocaleString()} / ${hud.bossMaxHp.toLocaleString()}`;
      if (hud.bossWarning) {
        this.bossWarnEl.textContent = hud.bossWarning;
        this.bossWarnEl.classList.remove('hidden');
      } else {
        this.bossWarnEl.classList.add('hidden');
      }
    } else {
      this.bossBarWrap.classList.add('hidden');
    }
  }

  public showMainMenu(): void {
    this.currentModal = 'menu';
    const data = this.engine.save.getData();
    const completedCount = Object.values(data.stages).filter((s) => s.completed).length;
    const totalStars = Object.values(data.stages).reduce((acc, s) => acc + (s.stars || 0), 0);
    const hasContinue = data.unlockedStage > 1 || completedCount > 0;
    const continueStage = Math.min(30, data.unlockedStage);

    this.overlayContainer.innerHTML = `
      <div class="panel menu-panel">
        <div class="game-badge">5 WORLDS · 30 STAGES · 120 WAVES</div>
        <h1 class="game-title">CROWD SIEGE</h1>
        <p class="game-subtitle">3D WAVE SHOOTER</p>

        <div class="menu-stats">
          <div class="stat-chip"><span>COINS</span><strong>${data.coins.toLocaleString()}</strong></div>
          <div class="stat-chip"><span>STAGES</span><strong>${completedCount} / 30</strong></div>
          <div class="stat-chip"><span>STARS</span><strong>★ ${totalStars} / 90</strong></div>
        </div>

        <div class="menu-actions">
          ${
            hasContinue
              ? `<button class="btn btn-primary btn-lg" id="btn-continue">CONTINUE · STAGE ${continueStage}</button>`
              : ''
          }
          <button class="btn ${hasContinue ? 'btn-secondary' : 'btn-primary'} btn-lg" id="btn-play">
            ${hasContinue ? 'PLAY STAGE 1' : 'PLAY'}
          </button>
          <div class="menu-row">
            <button class="btn btn-secondary" id="btn-stages">STAGE SELECT</button>
            <button class="btn btn-accent" id="btn-upgrades">UPGRADES</button>
          </div>
          <button class="btn btn-ghost" id="btn-settings">SETTINGS</button>
        </div>

        <div class="menu-footer">
          Verified CC0 3D Assets: Quaternius · Kenney · Poly Haven
        </div>
      </div>
    `;

    this.overlayContainer.querySelector('#btn-play')?.addEventListener('click', () => {
      this.clickSfx();
      void this.engine.startStage(1);
    });
    this.overlayContainer.querySelector('#btn-continue')?.addEventListener('click', () => {
      this.clickSfx();
      void this.engine.startStage(continueStage);
    });
    this.overlayContainer.querySelector('#btn-stages')?.addEventListener('click', () => {
      this.clickSfx();
      this.showStageSelect();
    });
    this.overlayContainer.querySelector('#btn-upgrades')?.addEventListener('click', () => {
      this.clickSfx();
      this.showUpgrades();
    });
    this.overlayContainer.querySelector('#btn-settings')?.addEventListener('click', () => {
      this.clickSfx();
      this.returnModalAfterSettings = 'menu';
      this.showSettings();
    });
  }

  public showStageSelect(): void {
    this.currentModal = 'stages';
    const data = this.engine.save.getData();

    const worldsHtml = WORLD_LIST.map((w) => {
      const worldStages = STAGES.filter((s) => s.worldId === w.id);
      const cards = worldStages
        .map((s) => {
          const unlocked = s.stageNumber <= data.unlockedStage;
          const rec = data.stages[s.stageNumber];
          const starsStr = rec?.completed
            ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars)
            : unlocked
              ? '☆☆☆'
              : 'LOCKED';
          return `
            <button class="stage-card ${unlocked ? 'unlocked' : 'locked'} ${s.isWorldFinale ? 'finale' : ''}"
              data-stage="${s.stageNumber}" ${unlocked ? '' : 'disabled'}>
              <div class="stage-num">${s.stageNumber}${s.isWorldFinale ? ' ♛' : ''}</div>
              <div class="stage-title">${s.name}</div>
              <div class="stage-stars">${starsStr}</div>
            </button>
          `;
        })
        .join('');

      return `
        <div class="world-section">
          <div class="world-header">
            <span class="world-badge">WORLD ${w.index}</span>
            <span class="world-name">${w.name}</span>
            <span class="world-sub">${w.subtitle}</span>
          </div>
          <div class="stage-grid">${cards}</div>
        </div>
      `;
    }).join('');

    this.overlayContainer.innerHTML = `
      <div class="panel wide-panel">
        <div class="panel-header">
          <h2>STAGE SELECT (30 STAGES)</h2>
          <button class="btn btn-ghost btn-sm" id="btn-back">← BACK</button>
        </div>
        <div class="scroll-body">${worldsHtml}</div>
      </div>
    `;

    this.overlayContainer.querySelector('#btn-back')?.addEventListener('click', () => {
      this.clickSfx();
      this.showMainMenu();
    });

    this.overlayContainer.querySelectorAll<HTMLButtonElement>('.stage-card.unlocked').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clickSfx();
        const num = Number(btn.dataset.stage);
        void this.engine.startStage(num);
      });
    });
  }

  public showUpgrades(returnToResult?: StageResult): void {
    this.currentModal = 'upgrades';
    const data = this.engine.save.getData();

    const cards = UPGRADE_SPECS.map((spec) => {
      const level = data.upgrades[spec.key];
      const isMax = level >= spec.maxLevel;
      const cost = this.engine.save.getUpgradeCost(spec.key);
      const canBuy = this.engine.save.canBuyUpgrade(spec.key);
      return `
        <div class="upgrade-card">
          <div class="upgrade-info">
            <div class="upgrade-top">
              <strong>${spec.title}</strong>
              <span class="lvl-badge">LV ${level} / ${spec.maxLevel}</span>
            </div>
            <div class="upgrade-desc">${spec.description}</div>
            <div class="upgrade-val">
              Current: <b>${spec.formatValue(level)}</b>
              ${!isMax ? ` → Next: <b class="next-val">${spec.formatValue(level + 1)}</b>` : ' (MAXED)'}
            </div>
          </div>
          <button class="btn ${canBuy ? 'btn-accent' : 'btn-disabled'} upgrade-buy-btn"
            data-key="${spec.key}" ${canBuy ? '' : 'disabled'}>
            ${isMax ? 'MAX' : `${cost.toLocaleString()} COINS`}
          </button>
        </div>
      `;
    }).join('');

    this.overlayContainer.innerHTML = `
      <div class="panel wide-panel">
        <div class="panel-header">
          <div>
            <h2>SQUAD UPGRADES</h2>
            <div class="coin-banner">AVAILABLE COINS: <strong>${data.coins.toLocaleString()}</strong></div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-back">← BACK</button>
        </div>
        <div class="upgrade-list">${cards}</div>
      </div>
    `;

    this.overlayContainer.querySelector('#btn-back')?.addEventListener('click', () => {
      this.clickSfx();
      if (returnToResult) this.showResult(returnToResult);
      else this.showMainMenu();
    });

    this.overlayContainer.querySelectorAll<HTMLButtonElement>('.upgrade-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key as keyof UpgradeLevels;
        if (this.engine.save.buyUpgrade(key)) {
          this.engine.audio.play('sfx_upgrade', 0.85, 40);
          this.showUpgrades(returnToResult);
        }
      });
    });
  }

  public showSettings(): void {
    this.currentModal = 'settings';
    const s = this.engine.save.getSettings();

    this.overlayContainer.innerHTML = `
      <div class="panel settings-panel">
        <div class="panel-header">
          <h2>SETTINGS</h2>
          <button class="btn btn-ghost btn-sm" id="btn-back">← BACK</button>
        </div>

        <div class="setting-row">
          <label>Graphics Quality</label>
          <div class="seg-group">
            ${(['low', 'medium', 'high'] as QualityPreset[])
              .map(
                (q) =>
                  `<button class="seg-btn ${s.quality === q ? 'active' : ''}" data-quality="${q}">${q.toUpperCase()}</button>`
              )
              .join('')}
          </div>
        </div>

        <div class="setting-row">
          <label>Master Volume (<span id="val-master">${Math.round(s.masterVolume * 100)}%</span>)</label>
          <input type="range" id="range-master" min="0" max="100" value="${Math.round(s.masterVolume * 100)}" />
        </div>

        <div class="setting-row">
          <label>SFX Volume (<span id="val-sfx">${Math.round(s.sfxVolume * 100)}%</span>)</label>
          <input type="range" id="range-sfx" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" />
        </div>

        <div class="setting-row toggle-row">
          <label>Camera Screen Shake</label>
          <input type="checkbox" id="chk-shake" ${s.screenShake ? 'checked' : ''} />
        </div>

        <div class="setting-row toggle-row">
          <label>Show FPS Counter</label>
          <input type="checkbox" id="chk-fps" ${s.showFps ? 'checked' : ''} />
        </div>

        <div class="setting-danger">
          <button class="btn btn-danger btn-sm" id="btn-reset">RESET SAVE PROGRESS</button>
        </div>
      </div>
    `;

    this.overlayContainer.querySelector('#btn-back')?.addEventListener('click', () => {
      this.clickSfx();
      if (this.returnModalAfterSettings === 'pause') this.showPauseMenu();
      else this.showMainMenu();
    });

    this.overlayContainer.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.clickSfx();
        const q = btn.dataset.quality as QualityPreset;
        this.engine.setQuality(q);
        this.showSettings();
      });
    });

    const masterInput = this.overlayContainer.querySelector<HTMLInputElement>('#range-master')!;
    const sfxInput = this.overlayContainer.querySelector<HTMLInputElement>('#range-sfx')!;
    const masterVal = this.overlayContainer.querySelector('#val-master')!;
    const sfxVal = this.overlayContainer.querySelector('#val-sfx')!;

    masterInput.addEventListener('input', () => {
      const v = Number(masterInput.value) / 100;
      masterVal.textContent = `${masterInput.value}%`;
      this.engine.save.updateSettings({ masterVolume: v });
      this.engine.applySettings();
    });

    sfxInput.addEventListener('input', () => {
      const v = Number(sfxInput.value) / 100;
      sfxVal.textContent = `${sfxInput.value}%`;
      this.engine.save.updateSettings({ sfxVolume: v });
      this.engine.applySettings();
    });

    this.overlayContainer.querySelector<HTMLInputElement>('#chk-shake')!.addEventListener('change', (e) => {
      this.engine.save.updateSettings({ screenShake: (e.target as HTMLInputElement).checked });
      this.engine.applySettings();
    });

    this.overlayContainer.querySelector<HTMLInputElement>('#chk-fps')!.addEventListener('change', (e) => {
      this.engine.save.updateSettings({ showFps: (e.target as HTMLInputElement).checked });
      this.engine.applySettings();
    });

    this.overlayContainer.querySelector('#btn-reset')!.addEventListener('click', () => {
      if (window.confirm('Reset all unlocked stages, stars, coins, and upgrades?')) {
        this.engine.save.resetProgress();
        this.showMainMenu();
      }
    });
  }

  public showPauseMenu(): void {
    this.currentModal = 'pause';
    this.overlayContainer.innerHTML = `
      <div class="panel compact-panel">
        <h2>PAUSED</h2>
        <div class="menu-actions">
          <button class="btn btn-primary btn-lg" id="btn-resume">RESUME</button>
          <button class="btn btn-secondary" id="btn-restart">RESTART STAGE</button>
          <button class="btn btn-ghost" id="btn-settings">SETTINGS</button>
          <button class="btn btn-danger" id="btn-menu">MAIN MENU</button>
        </div>
      </div>
    `;

    this.overlayContainer.querySelector('#btn-resume')!.addEventListener('click', () => {
      this.clickSfx();
      this.engine.resume();
    });
    this.overlayContainer.querySelector('#btn-restart')!.addEventListener('click', () => {
      this.clickSfx();
      void this.engine.restartStage();
    });
    this.overlayContainer.querySelector('#btn-settings')!.addEventListener('click', () => {
      this.clickSfx();
      this.returnModalAfterSettings = 'pause';
      this.showSettings();
    });
    this.overlayContainer.querySelector('#btn-menu')!.addEventListener('click', () => {
      this.clickSfx();
      this.engine.returnToMenu();
    });
  }

  public showResult(result: StageResult): void {
    this.currentModal = 'result';
    const starsHtml = result.victory
      ? `<div class="result-stars">${'★'.repeat(result.stars)}<span class="star-empty">${'☆'.repeat(3 - result.stars)}</span></div>`
      : `<div class="result-stars defeat-icon">✖</div>`;

    this.overlayContainer.innerHTML = `
      <div class="panel result-panel ${result.victory ? 'victory' : 'defeat'}">
        <div class="result-badge">STAGE ${result.stageNumber} · ${result.worldName}</div>
        <h2 class="result-title">${result.victory ? 'VICTORY!' : 'SQUAD WIPED'}</h2>
        <div class="result-stage-name">${result.stageName}</div>
        ${starsHtml}

        <div class="result-grid">
          <div class="res-box"><span>COINS EARNED</span><strong>+${result.coinsEarned.toLocaleString()}</strong></div>
          <div class="res-box"><span>SURVIVING SQUAD</span><strong>${result.survivingSquad}</strong></div>
          <div class="res-box"><span>ENEMIES SLAIN</span><strong>${result.enemiesDefeated}</strong></div>
          <div class="res-box"><span>CLEAR TIME</span><strong>${result.durationSec.toFixed(1)}s</strong></div>
        </div>

        <div class="menu-actions">
          ${
            result.victory && result.hasNextStage
              ? `<button class="btn btn-primary btn-lg" id="btn-next">NEXT STAGE (${result.stageNumber + 1}) →</button>`
              : ''
          }
          <div class="menu-row">
            <button class="btn ${result.victory ? 'btn-secondary' : 'btn-primary'}" id="btn-retry">RETRY</button>
            <button class="btn btn-accent" id="btn-upgrades">UPGRADES</button>
          </div>
          <button class="btn btn-ghost" id="btn-menu">MAIN MENU</button>
        </div>
      </div>
    `;

    this.overlayContainer.querySelector('#btn-next')?.addEventListener('click', () => {
      this.clickSfx();
      void this.engine.startStage(result.stageNumber + 1);
    });
    this.overlayContainer.querySelector('#btn-retry')!.addEventListener('click', () => {
      this.clickSfx();
      void this.engine.startStage(result.stageNumber);
    });
    this.overlayContainer.querySelector('#btn-upgrades')!.addEventListener('click', () => {
      this.clickSfx();
      this.showUpgrades(result);
    });
    this.overlayContainer.querySelector('#btn-menu')!.addEventListener('click', () => {
      this.clickSfx();
      this.engine.returnToMenu();
    });
  }

  public getCurrentModal(): ModalScreen {
    return this.currentModal;
  }
}
