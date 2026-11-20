import './styles/main.css';
import { GameEngine } from './engine/GameEngine';
import { UIManager } from './ui/UIManager';

const canvasHost = document.getElementById('canvas-host');
const uiRoot = document.getElementById('ui-root');

if (!canvasHost || !uiRoot) {
  throw new Error('Missing #canvas-host or #ui-root container');
}

let ui: UIManager;

const engine = new GameEngine(canvasHost, {
  onHudUpdate: (hud) => ui?.updateHud(hud),
  onBanner: (text, tone) => ui?.showBanner(text, tone),
  onLoadingProgress: (pct, label) => ui?.setLoading(pct, label),
  onStageEnd: (result) => ui?.showResult(result),
  onModeChange: (mode) => ui?.onModeChange(mode)
});

ui = new UIManager(uiRoot, engine);
ui.setLoading(15, 'Loading verified 3D assets & manifest...');

engine.bootstrap().catch((err) => {
  console.error(err);
  ui.setLoading(100, `Startup Error: ${err instanceof Error ? err.message : String(err)}`);
});

// Expose lightweight debug handle for automated QA verification
(window as unknown as { __CROWD_SIEGE__?: { engine: GameEngine; ui: UIManager } }).__CROWD_SIEGE__ = {
  engine,
  ui
};
