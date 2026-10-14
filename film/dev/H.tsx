// 场景 H 的独立预览入口（只打包这一个场景）。tools/sheet.sh / preview.sh 用它。
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {makeScenePreviewMod, TAIL} from '../scenes/preview';
import {sceneById, toF} from '../scenes/core/timeline';
import {S} from '../scenes/s/H';

const def = sceneById('H');
const C = makeScenePreviewMod('H', S);
const Root: React.FC = () => <Composition id="S-H" component={C} durationInFrames={toF(def.end) - toF(def.start) + TAIL} fps={30} width={1080} height={1920} />;
registerRoot(Root);
