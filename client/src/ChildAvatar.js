import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createChildAvatar as createProceduralChild } from './Assets.js';
import { assetUrl } from './assetUrl.js';

/** Quaternius "Henry" (CC0) — https://poly.pizza/m/yEdSk8tRKc */
const CHARACTERS = {
  boy: {
    modelUrl: assetUrl('models/parisian-boy.glb'),
    runUrl: assetUrl('models/parisian-boy-run.glb'),
  },
  girl: {
    modelUrl: assetUrl('models/parisian-girl.glb'),
    runUrl: assetUrl('models/parisian-girl-run.glb'),
  },
  henry: {
    modelUrl: assetUrl('models/henry-child.glb'),
    runUrl: null,
  },
};

const TARGET_HEIGHT = 5.5;

const templateCache = new Map();
const _gripScratch = new THREE.Vector3();

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, resolve, undefined, reject);
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
 * Prefer the run GLB when present — skinned mesh + run clip already bound
 * (avoids T-pose bind as the live pose).
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
      return { scene: gltf.scene, animations: [...(gltf.animations || [])] };
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

/**
 * Async factory: returns a playable child avatar with idle/walk.
 * No manual arm posing — skeleton follows animation clips only.
 */
export async function createAnimatedChildAvatar(characterType = 'boy', skinTint = null) {
  const type = CHARACTERS[characterType] ? characterType : 'boy';
  const template = await loadCharacterTemplate(type);

  if (!template) {
    const fallback = createProceduralChild(skinTint ?? 0xffe0bd);
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
  const rightHand = findBone(model, 'RightHand');

  if (skinTint != null && type === 'henry') {
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
  // Meshy: Armature|running_man|baselayer; Henry fallback: Walk
  const runClip = pickClip(template.animations, ['running', 'Run', 'run', 'Walk', 'walk']);
  let idleClip = pickClip(template.animations, ['Idle', 'idle']);
  // Same clip can't back two actions in Three.js — clone run for a frozen idle stand
  if (!idleClip && runClip) {
    idleClip = runClip.clone();
    idleClip.name = `${runClip.name}_idleHold`;
  }
  const punchClip = pickClip(template.animations, ['Punch', 'punch', 'Attack']);

  const actions = {
    idle: idleClip ? mixer.clipAction(idleClip) : null,
    run: runClip ? mixer.clipAction(runClip) : null,
    punch: punchClip ? mixer.clipAction(punchClip) : null,
  };

  const idleIsFrozenRun = Boolean(
    runClip && idleClip && idleClip !== runClip && idleClip.name.endsWith('_idleHold'),
  );

  let current = null;
  const playIdle = (fade = 0.2) => {
    if (!actions.idle) return;
    if (current && current !== actions.idle) current.fadeOut(fade);
    actions.idle.reset();
    if (idleIsFrozenRun) {
      actions.idle.time = Math.min(0.12, actions.idle.getClip().duration * 0.05);
      actions.idle.setEffectiveTimeScale(0);
    } else {
      actions.idle.setEffectiveTimeScale(1);
    }
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
  let pokeUntil = 0;

  return {
    group,
    update(dt, now = performance.now()) {
      mixer.update(dt);
      model.position.x = basePos.x;
      model.position.z = basePos.z;

      if (pokeUntil && now >= pokeUntil) {
        pokeUntil = 0;
        if (moving) playRun();
        else playIdle();
      }
    },
    setMoving(isMoving) {
      if (moving === isMoving) return;
      moving = isMoving;
      if (pokeUntil) return;
      if (isMoving) playRun();
      else playIdle();
    },
    setPoking() {
      pokeUntil = performance.now() + 500;
      if (actions.punch) {
        if (current && current !== actions.punch) current.fadeOut(0.08);
        actions.punch.reset();
        actions.punch.setLoop(THREE.LoopOnce, 1);
        actions.punch.clampWhenFinished = true;
        actions.punch.setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.08).play();
        current = actions.punch;
      }
    },
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
