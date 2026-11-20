import type { StageConfig } from '../../types/game';
import stage01 from './stage-01.json';
import stage02 from './stage-02.json';
import stage03 from './stage-03.json';
import stage04 from './stage-04.json';
import stage05 from './stage-05.json';
import stage06 from './stage-06.json';
import stage07 from './stage-07.json';
import stage08 from './stage-08.json';
import stage09 from './stage-09.json';
import stage10 from './stage-10.json';
import stage11 from './stage-11.json';
import stage12 from './stage-12.json';
import stage13 from './stage-13.json';
import stage14 from './stage-14.json';
import stage15 from './stage-15.json';
import stage16 from './stage-16.json';
import stage17 from './stage-17.json';
import stage18 from './stage-18.json';
import stage19 from './stage-19.json';
import stage20 from './stage-20.json';
import stage21 from './stage-21.json';
import stage22 from './stage-22.json';
import stage23 from './stage-23.json';
import stage24 from './stage-24.json';
import stage25 from './stage-25.json';
import stage26 from './stage-26.json';
import stage27 from './stage-27.json';
import stage28 from './stage-28.json';
import stage29 from './stage-29.json';
import stage30 from './stage-30.json';

export const STAGES: StageConfig[] = [
  stage01 as StageConfig,
  stage02 as StageConfig,
  stage03 as StageConfig,
  stage04 as StageConfig,
  stage05 as StageConfig,
  stage06 as StageConfig,
  stage07 as StageConfig,
  stage08 as StageConfig,
  stage09 as StageConfig,
  stage10 as StageConfig,
  stage11 as StageConfig,
  stage12 as StageConfig,
  stage13 as StageConfig,
  stage14 as StageConfig,
  stage15 as StageConfig,
  stage16 as StageConfig,
  stage17 as StageConfig,
  stage18 as StageConfig,
  stage19 as StageConfig,
  stage20 as StageConfig,
  stage21 as StageConfig,
  stage22 as StageConfig,
  stage23 as StageConfig,
  stage24 as StageConfig,
  stage25 as StageConfig,
  stage26 as StageConfig,
  stage27 as StageConfig,
  stage28 as StageConfig,
  stage29 as StageConfig,
  stage30 as StageConfig,
];

export function getStageConfig(stageNumber: number): StageConfig {
  const idx = Math.max(0, Math.min(STAGES.length - 1, stageNumber - 1));
  return STAGES[idx];
}
