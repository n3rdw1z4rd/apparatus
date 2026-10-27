/// <reference lib="webworker" />
import { serveGraphEvaluation } from '@n3rdw1z4rd/smoke-ui-node-graph/worker';
import { BEHAVIOR_KIND } from './behaviors';
import { registerSceneNodes } from './scene-nodes';

/* Graph evaluation, off the main thread: apparatus's nodes, and behaviour scripts as a module kind. */
serveGraphEvaluation({ register: registerSceneNodes, kinds: [BEHAVIOR_KIND] });
