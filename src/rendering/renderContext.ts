import type * as THREE from "three";

export type RenderContext = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
};
