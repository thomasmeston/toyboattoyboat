/**
 * Bakes the sailor idle arm pose into client/src/avatarIdlePose.js.
 *
 * Idle arms used to be read live from the first frame of each walk GLB, so the
 * rest stance was whatever the walk cycle happened to start on and could not be
 * tuned without re-exporting art. This snapshots those quaternions and applies
 * an adduction (arms toward the torso) about the model-space Z axis, mirrored
 * per side.
 *
 * Re-run after changing TUCK_RAD or replacing a walk GLB:
 *   node scripts/bake-idle-pose.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

/** Adduction applied to each upper arm, radians. Raise to tuck arms in further. */
const TUCK_RAD = 0.13;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'client/public/models');
const OUT_FILE = path.join(ROOT, 'client/src/avatarIdlePose.js');

const CHARACTERS = ['boy', 'girl'];

const ARM_BONES = [
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
];

/** Upper arm bone -> tuck direction. Mirrored: +Z folds the right arm in, -Z the left. */
const TUCK_SIGN = { LeftArm: -1, RightArm: 1 };

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a glb: ${file}`);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
    if (len % 4 !== 0) off += 4 - (len % 4);
  }
  if (!json) throw new Error(`no JSON chunk: ${file}`);
  return { json, bin };
}

function accessorRows(json, bin, index) {
  const acc = json.accessors[index];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  if (acc.componentType !== 5126) throw new Error(`non-float accessor: ${acc.componentType}`);
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || comps * 4;
  const rows = [];
  for (let i = 0; i < acc.count; i++) {
    const row = [];
    for (let c = 0; c < comps; c++) row.push(bin.readFloatLE(base + i * stride + c * 4));
    rows.push(row);
  }
  return rows;
}

/** Bone name -> first-keyframe rotation [x,y,z,w] from the GLB's first animation. */
function firstFrameRotations({ json, bin }) {
  const anim = json.animations?.[0];
  if (!anim) return {};
  const out = {};
  for (const ch of anim.channels) {
    if (ch.target?.path !== 'rotation') continue;
    out[json.nodes[ch.target.node].name] = accessorRows(json, bin, anim.samplers[ch.sampler].output)[0];
  }
  return out;
}

/** Object3D mirror of the GLB node tree, in bind transforms. */
function buildTree(json) {
  const objs = json.nodes.map((n) => {
    const o = new THREE.Object3D();
    o.name = n.name || '';
    if (n.matrix) {
      new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    } else {
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
    }
    return o;
  });
  json.nodes.forEach((n, i) => {
    for (const c of n.children || []) objs[i].add(objs[c]);
  });
  const scene = new THREE.Object3D();
  objs.filter((o) => !o.parent).forEach((r) => scene.add(r));
  return { scene, byName: new Map(objs.map((o) => [o.name, o])) };
}

/**
 * Rebuild the runtime idle stance: clip0 frame 0 on the body, walk frame 0 on
 * the arms — matching applyIdleArms() in ChildAvatar.js.
 */
function buildIdleStance(character) {
  const run = readGlb(path.join(MODELS, `parisian-${character}-run.glb`));
  const base = readGlb(path.join(MODELS, `parisian-${character}.glb`));
  const walk = readGlb(path.join(MODELS, `parisian-${character}-walk.glb`));

  const { scene, byName } = buildTree(run.json);
  const armPose = firstFrameRotations(walk);

  for (const [name, q] of Object.entries(firstFrameRotations(base))) {
    byName.get(name)?.quaternion.fromArray(q);
  }
  for (const name of ARM_BONES) {
    if (armPose[name]) byName.get(name).quaternion.fromArray(armPose[name]);
  }
  scene.updateMatrixWorld(true);
  return { scene, byName, armPose };
}

/** Rotate a bone about a model-space axis, expressed in its parent's frame. */
function rotateInModelSpace(bone, modelAxis, angle) {
  const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const axisLocal = modelAxis.clone().applyQuaternion(parentWorld.invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axisLocal, angle));
}

const MODEL_Z = new THREE.Vector3(0, 0, 1);
const round = (n) => Number(n.toFixed(6));

function bakeCharacter(character) {
  const { scene, byName, armPose } = buildIdleStance(character);
  const hips = byName.get('Hips').getWorldPosition(new THREE.Vector3());
  const before = {};
  for (const side of ['Left', 'Right']) {
    before[side] = byName.get(`${side}Hand`).getWorldPosition(new THREE.Vector3());
  }

  for (const [bone, sign] of Object.entries(TUCK_SIGN)) {
    rotateInModelSpace(byName.get(bone), MODEL_Z, sign * TUCK_RAD);
  }
  scene.updateMatrixWorld(true);

  const pose = {};
  for (const name of ARM_BONES) {
    if (!armPose[name]) continue;
    const q = byName.get(name).quaternion;
    pose[name] = [round(q.x), round(q.y), round(q.z), round(q.w)];
  }

  const report = [];
  for (const side of ['Left', 'Right']) {
    const after = byName.get(`${side}Hand`).getWorldPosition(new THREE.Vector3());
    const spread = (p) => Math.abs(p.x - hips.x);
    report.push(
      `${side}: hand out ${spread(before[side]).toFixed(3)} -> ${spread(after).toFixed(3)}`
        + ` (${(after.y - before[side].y).toFixed(3)} height)`,
    );
  }
  return { pose, report };
}

const blocks = [];
for (const character of CHARACTERS) {
  const { pose, report } = bakeCharacter(character);
  console.log(`${character}: ${report.join('  |  ')}`);
  const rows = Object.entries(pose)
    .map(([bone, q]) => `    ${bone}: [${q.join(', ')}],`)
    .join('\n');
  blocks.push(`  ${character}: {\n${rows}\n  },`);
}

const out = `// Generated by scripts/bake-idle-pose.mjs — do not edit by hand.
// Snapshot of the sailor idle arm stance (walk GLB frame 0) with a ${TUCK_RAD} rad
// adduction applied to each upper arm so the arms rest nearer the torso.
// Re-run \`node scripts/bake-idle-pose.mjs\` after changing TUCK_RAD there.

/** Local bone quaternions as [x, y, z, w], keyed by character then bone. */
export const IDLE_ARM_POSE = {
${blocks.join('\n')}
};

/** Adduction baked into the upper arms above, radians. */
export const IDLE_ARM_TUCK_RAD = ${TUCK_RAD};
`;

fs.writeFileSync(OUT_FILE, out);
console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)}`);
