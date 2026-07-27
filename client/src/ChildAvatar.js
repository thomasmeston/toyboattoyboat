import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createChildAvatar as createProceduralChild } from './Assets.js';
import { assetUrl } from './assetUrl.js';
import { IDLE_ARM_POSE } from './avatarIdlePose.js';

/** Quaternius "Henry" (CC0) — https://poly.pizza/m/yEdSk8tRKc */
const CHARACTERS = {
  boy: {
    modelUrl: assetUrl('models/parisian-boy.glb'),
    /** Arm rest fallback if the character has no baked pose — never played as locomotion. */
    armPoseUrl: assetUrl('models/parisian-boy-walk.glb'),
    runUrl: assetUrl('models/parisian-boy-run.glb'),
  },
  girl: {
    modelUrl: assetUrl('models/parisian-girl.glb'),
    armPoseUrl: assetUrl('models/parisian-girl-walk.glb'),
    runUrl: assetUrl('models/parisian-girl-run.glb'),
  },
  henry: {
    modelUrl: assetUrl('models/henry-child.glb'),
    armPoseUrl: null,
    runUrl: null,
  },
};

const TARGET_HEIGHT = 5.5;

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

const templateCache = new Map();
/** Cached atlas ImageData keyed by source texture uuid (shared templates). */
const atlasImageCache = new Map();
const _gripScratch = new THREE.Vector3();

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, resolve, undefined, reject);
  });
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

/** Painterly atlas: warm peach = skin; keep dark hair/shoes; recolor the rest. */
function isSkinPixel(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.38 || l > 0.96 || s < 0.06 || s > 0.62) return false;
  return h >= 8 && h <= 58 && r >= g - 8 && g >= b - 12;
}

function isKeepDarkPixel(r, g, b) {
  const { s, l } = rgbToHsl(r, g, b);
  return l < 0.22 && s < 0.45;
}

function getAtlasImageData(texture) {
  if (!texture?.image) return null;
  const key = texture.uuid;
  if (atlasImageCache.has(key)) return atlasImageCache.get(key);
  const img = texture.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  atlasImageCache.set(key, data);
  return data;
}

function makeClothesTexture(sourceTex, primaryHex, accentHex) {
  const src = getAtlasImageData(sourceTex);
  if (!src) return null;

  const primary = new THREE.Color(primaryHex);
  const accent = new THREE.Color(accentHex || primaryHex);
  const pHsl = rgbToHsl(primary.r * 255, primary.g * 255, primary.b * 255);
  const aHsl = rgbToHsl(accent.r * 255, accent.g * 255, accent.b * 255);

  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const px = out.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const a = px[i + 3];
    if (a < 8) continue;
    if (isSkinPixel(r, g, b) || isKeepDarkPixel(r, g, b)) continue;

    const { h, s, l } = rgbToHsl(r, g, b);
    // Warm / brown regions → accent; cool greens/blues → primary
    const target = (h < 75 || h > 320) && s > 0.12 ? aHsl : pHsl;
    const next = hslToRgb(target.h, Math.min(0.82, Math.max(0.28, s * 0.85 + 0.2)), l);
    px[i] = next.r;
    px[i + 1] = next.g;
    px[i + 2] = next.b;
  }

  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  canvas.getContext('2d').putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = sourceTex.colorSpace;
  tex.flipY = sourceTex.flipY;
  tex.wrapS = sourceTex.wrapS;
  tex.wrapT = sourceTex.wrapT;
  tex.needsUpdate = true;
  return tex;
}

function applyClothesColors(model, clothesColor, clothesAccent) {
  if (!clothesColor) return;
  const tinted = new Map();
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      const cloned = mat.clone();
      for (const key of ['map', 'emissiveMap']) {
        const src = mat[key];
        if (!src) continue;
        if (!tinted.has(src.uuid)) {
          tinted.set(src.uuid, makeClothesTexture(src, clothesColor, clothesAccent) || src);
        }
        const tex = tinted.get(src.uuid);
        if (tex && tex !== src) cloned[key] = tex;
      }
      cloned.needsUpdate = true;
      return cloned;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function tintProceduralClothes(group, clothesColor, clothesAccent) {
  if (!clothesColor || !group) return;
  const primary = new THREE.Color(clothesColor);
  const accent = new THREE.Color(clothesAccent || clothesColor);
  let part = 0;
  group.traverse((child) => {
    if (!child.isMesh || !child.material?.color) return;
    // Skip head (sphere) — keep skin; recolor coat / hat / arm cloth-ish parts
    const geo = child.geometry?.type || '';
    if (geo.includes('Sphere')) return;
    child.material = child.material.clone();
    child.material.color.copy(part === 0 ? primary : accent);
    part += 1;
  });
}

function prepareScene(scene) {
  scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const box = new THREE.Box3();
  let hasMesh = false;
  scene.traverse((child) => {
    if (child.isMesh) {
      box.expandByObject(child);
      hasMesh = true;
    }
  });
  if (!hasMesh) box.setFromObject(scene);

  const size = box.getSize(new THREE.Vector3());
  const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);

  const grounded = new THREE.Box3();
  scene.traverse((child) => {
    if (child.isMesh) grounded.expandByObject(child);
  });
  if (grounded.isEmpty()) grounded.setFromObject(scene);
  scene.position.y -= grounded.min.y;
}

/**
 * Run GLB = live mesh + run clip.
 * Base GLB = clip0 body bind (symmetric stand).
 * Walk GLB = fallback arm rest quaternions only (not played).
 */
async function loadCharacterTemplate(characterType) {
  const key = CHARACTERS[characterType] ? characterType : 'boy';
  if (templateCache.has(key)) return templateCache.get(key);

  const config = CHARACTERS[key];
  const promise = (async () => {
    try {
      const primaryUrl = config.runUrl || config.modelUrl;
      const gltf = await loadGltf(primaryUrl);
      prepareScene(gltf.scene);
      const animations = [...(gltf.animations || [])];
      let armPoseClip = null;

      for (const url of [config.modelUrl, config.armPoseUrl]) {
        if (!url || url === primaryUrl) continue;
        try {
          const extra = await loadGltf(url);
          if (extra.animations?.length) {
            animations.push(...extra.animations);
            if (url === config.armPoseUrl) armPoseClip = extra.animations[0];
          }
        } catch (err) {
          console.warn(`Extra avatar clip failed (${url}):`, err);
        }
      }

      return { scene: gltf.scene, animations, armPoseClip };
    } catch (err) {
      console.warn(`Character model failed (${key}), using procedural fallback:`, err);
      return null;
    }
  })();

  templateCache.set(key, promise);
  return promise;
}

function pickClip(animations, keywords) {
  const list = Array.isArray(keywords) ? keywords : [keywords];
  for (const keyword of list) {
    const found = animations.find((clip) =>
      clip.name.toLowerCase().includes(keyword.toLowerCase()),
    );
    if (found) return found;
  }
  return null;
}

function findBone(root, name) {
  let found = null;
  root.traverse((obj) => {
    if (obj.isSkinnedMesh && obj.skeleton) {
      for (const bone of obj.skeleton.bones) {
        if (bone.name === name) found = bone;
      }
    }
    if (!found && obj.isBone && obj.name === name) found = obj;
  });
  return found;
}

/** Baked idle stance from avatarIdlePose.js, as bone -> quaternion. */
function bakedArmRestPose(characterType) {
  const baked = IDLE_ARM_POSE[characterType];
  if (!baked) return null;
  const pose = {};
  for (const name of ARM_BONES) {
    const q = baked[name];
    if (q) pose[name] = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
  }
  return Object.keys(pose).length ? pose : null;
}

/** First-keyframe local quaternions for arm bones from a pose clip. */
function extractArmRestPose(clip) {
  if (!clip) return null;
  const pose = {};
  for (const name of ARM_BONES) {
    const track = clip.tracks.find((t) => t.name === `${name}.quaternion`);
    if (!track) continue;
    pose[name] = new THREE.Quaternion(
      track.values[0],
      track.values[1],
      track.values[2],
      track.values[3],
    );
  }
  return Object.keys(pose).length ? pose : null;
}

/**
 * Async factory: bind-body idle + authored arm rest + run locomotion.
 * @param {string} characterType
 * @param {number|{ skinTint?: number|null, clothesColor?: string|null, clothesAccent?: string|null }} [options]
 */
export async function createAnimatedChildAvatar(characterType = 'boy', options = null) {
  const opts = (options != null && typeof options === 'object' && !Array.isArray(options))
    ? options
    : { skinTint: options };
  const skinTint = opts.skinTint ?? null;
  const clothesColor = opts.clothesColor || null;
  const clothesAccent = opts.clothesAccent || null;

  const type = CHARACTERS[characterType] ? characterType : 'boy';
  const template = await loadCharacterTemplate(type);

  if (!template) {
    const fallback = createProceduralChild(skinTint ?? 0xffe0bd);
    tintProceduralClothes(fallback, clothesColor, clothesAccent);
    return {
      group: fallback,
      update() {},
      setMoving() {},
      setPoking() {},
      getStickGripWorld(target) {
        return target.set(fallback.position.x + 0.9, 2.1, fallback.position.z);
      },
      dispose() {},
    };
  }

  const group = new THREE.Group();
  group.name = 'ChildAvatar';
  group.userData.characterType = type;

  const model = cloneSkinned(template.scene);
  group.add(model);

  const basePos = model.position.clone();
  const bones = Object.fromEntries(
    ARM_BONES.map((name) => [name, findBone(model, name)]),
  );
  const rightHand = bones.RightHand;

  // Baked stance wins; walk-clip frame 0 covers characters with no baked entry.
  const armRest = bakedArmRestPose(type)
    || extractArmRestPose(
      template.armPoseClip
        || pickClip(template.animations, ['walking', 'Walk', 'walk']),
    );

  if (clothesColor) {
    applyClothesColors(model, clothesColor, clothesAccent);
  } else if (skinTint != null && type === 'henry') {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat.color) mat.color.lerp(new THREE.Color(skinTint), 0.15);
        });
      }
    });
  }

  const mixer = new THREE.AnimationMixer(model);
  const runClip = pickClip(template.animations, ['running', 'Run', 'run']);
  // Symmetric bind body for idle — arms overwritten from armRest each frame
  let idleClip = pickClip(template.animations, ['clip0']);
  if (!idleClip && runClip) {
    idleClip = runClip.clone();
    idleClip.name = `${runClip.name}_bodyHold`;
  }

  const actions = {
    idle: idleClip ? mixer.clipAction(idleClip) : null,
    run: runClip ? mixer.clipAction(runClip) : null,
  };

  let current = null;
  const playIdle = (fade = 0.25) => {
    if (!actions.idle) return;
    if (current && current !== actions.idle) current.fadeOut(fade);
    actions.idle.reset();
    actions.idle.time = 0;
    actions.idle.setEffectiveTimeScale(0);
    actions.idle.setEffectiveWeight(1).fadeIn(fade).play();
    current = actions.idle;
  };

  const playRun = (fade = 0.2) => {
    if (!actions.run) return;
    if (current && current !== actions.run) current.fadeOut(fade);
    actions.run.reset();
    actions.run.setEffectiveTimeScale(1);
    actions.run.setEffectiveWeight(1).fadeIn(fade).play();
    current = actions.run;
  };

  if (actions.idle) playIdle(0);
  else if (actions.run) playRun(0);

  let moving = false;

  /** Authored soft arm rest on bind body (no poke overlay). */
  function applyIdleArms() {
    if (moving || !armRest) return;
    for (const name of ARM_BONES) {
      const bone = bones[name];
      const rest = armRest[name];
      if (bone && rest) bone.quaternion.copy(rest);
    }
  }

  return {
    group,
    update(dt) {
      mixer.update(dt);
      model.position.x = basePos.x;
      model.position.z = basePos.z;
      applyIdleArms();
    },
    setMoving(isMoving) {
      if (moving === isMoving) return;
      moving = isMoving;
      if (isMoving) playRun();
      else playIdle();
    },
    setPoking() {},
    getStickGripWorld(target = _gripScratch) {
      if (rightHand) {
        rightHand.getWorldPosition(target);
        return target;
      }
      return group.localToWorld(target.set(0.9, 2.1, 0.25));
    },
    dispose() {
      mixer.stopAllAction();
    },
  };
}

loadCharacterTemplate('boy');
loadCharacterTemplate('girl');
