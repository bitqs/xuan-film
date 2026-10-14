// 场景注册（导演维护）。每个场景组只改自己的 scenes/s/<ID>.tsx。
import type {SceneMod} from './core/timeline';
import {S as S_A} from './s/A';
import {S as S_B1} from './s/B1';
import {S as S_B2} from './s/B2';
import {S as S_C1} from './s/C1';
import {S as S_C2} from './s/C2';
import {S as S_D} from './s/D';
import {S as S_E} from './s/E';
import {S as S_F1} from './s/F1';
import {S as S_F2} from './s/F2';
import {S as S_G1} from './s/G1';
import {S as S_G2} from './s/G2';
import {S as S_H} from './s/H';
import {S as S_I1} from './s/I1';
import {S as S_I2} from './s/I2';

export const REGISTRY: Record<string, SceneMod> = {A: S_A, B1: S_B1, B2: S_B2, C1: S_C1, C2: S_C2, D: S_D, E: S_E, F1: S_F1, F2: S_F2, G1: S_G1, G2: S_G2, H: S_H, I1: S_I1, I2: S_I2};
