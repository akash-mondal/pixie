'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';

/* ── Void-and-Cluster 14×14 threshold map ── */
const VC = [
  131,187,8,78,50,18,134,89,155,102,29,95,184,73,
  22,86,113,171,142,105,34,166,9,60,151,128,40,110,
  168,137,45,28,64,188,82,54,124,189,80,13,156,56,
  7,61,186,121,154,6,108,177,24,100,38,176,93,123,
  83,148,96,17,88,133,44,145,69,161,139,72,30,181,
  115,27,163,47,178,65,164,14,120,48,5,127,153,52,
  190,58,126,81,116,21,106,77,173,92,191,63,99,12,
  76,144,4,185,37,149,192,39,135,23,117,31,170,132,
  35,172,103,66,129,79,3,97,57,159,70,141,53,94,
  114,20,49,158,19,146,169,122,183,11,104,180,2,165,
  152,87,182,118,91,42,67,25,84,147,43,85,125,68,
  16,136,71,10,193,112,160,138,51,111,162,26,194,46,
  174,107,41,143,33,74,1,101,195,15,75,140,109,90,
  32,62,157,98,167,119,179,59,36,130,175,55,0,150,
];
const VC_SZ = 14;
const VC_SC = 196;
const N = 400;

/* ── GLSL ── */
const snoise = `
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
  vec3 permute(vec3 x){return mod289(((x*34.)+10.)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
    vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;
    i=mod289(i);
    vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
    vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
    m=m*m;m=m*m;
    vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;
    vec3 ox=floor(x+.5);vec3 a0=x-ox;
    m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
    vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.*dot(m,g);
  }
`;

const vert = `
  uniform float uRows;
  uniform float uCols;
  uniform float uDither;
  uniform float uOffsetEnd;
  uniform sampler2D uTex;
  attribute float aRow;
  attribute float aCol;
  attribute float aThresh;
  varying vec3 vColor;
  varying vec3 vNormal;
  ${snoise}
  void main(){
    vec2 st=vec2(aCol,uRows-1.-aRow)/vec2(uCols-1.,uRows-1.);
    float rowId=aRow/uRows;
    float colId=aCol/uCols;
    vec4 tc=texture2D(uTex,st);
    float target=1.0-tc.r;
    float delay=snoise(vec2(rowId,colId)*80.7);
    delay=smoothstep(-1.,1.,delay);
    float dur=.15;
    float dStart=delay*(1.-dur);
    float dEnd=dStart+dur;
    float ap=smoothstep(dStart,dEnd,uDither);
    float dithered=step(aThresh,target);
    float dp=smoothstep(0.,1.,ap);
    float fc=mix(0.,dithered,dp);
    float off=mix(0.,uOffsetEnd,fc);
    vec4 cp=modelMatrix*instanceMatrix*vec4(position,1.);
    cp.z+=off;
    vec4 mn=modelMatrix*instanceMatrix*vec4(normal,0.);
    gl_Position=projectionMatrix*viewMatrix*cp;
    vColor=vec3(1.0-fc);
    vNormal=normalize(mn.xyz);
  }
`;

const frag = `
  varying vec3 vColor;
  varying vec3 vNormal;
  void main(){
    float sh=dot(normalize(vec3(0.,1.,1.)),normalize(vNormal));
    vec3 c=vColor*(.9+.6*sh);
    c=clamp(vec3(0.),vec3(1.),c);
    gl_FragColor=vec4(c,1.);
  }
`;

function easeIO(t: number) { return -(Math.cos(Math.PI * t) - 1) / 2; }

export function DitherHero() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* Scene */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');

    /* Camera */
    const camera = new THREE.OrthographicCamera();
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    camera.near = 1;
    camera.far = 2000;

    const anchor = new THREE.Group();
    anchor.add(camera);
    scene.add(anchor);

    /* Renderer */
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    el.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const pr = Math.min(window.devicePixelRatio, 2);

    /* Resize — frustum sized so grid fills viewport at minimum zoom (0.85) */
    const MIN_ZOOM = 0.85;
    const fit = N * MIN_ZOOM; // at zoom=0.85, visible = fit/0.85 = N → grid fills exactly
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const a = w / h;
      if (a >= 1) {
        camera.left = -fit / 2;
        camera.right = fit / 2;
        camera.top = (fit / 2) / a;
        camera.bottom = -(fit / 2) / a;
      } else {
        camera.left = -(fit / 2) * a;
        camera.right = (fit / 2) * a;
        camera.top = fit / 2;
        camera.bottom = -fit / 2;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(pr);
    };

    /* Grid */
    const count = N * N;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const rowArr = new Float32Array(count);
    const colArr = new Float32Array(count);
    const thrArr = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      rowArr[i] = r;
      colArr[i] = c;
      thrArr[i] = (VC[(c % VC_SZ) + (r % VC_SZ) * VC_SZ] + 0.5) / VC_SC;
    }

    geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(rowArr, 1));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(colArr, 1));
    geo.setAttribute('aThresh', new THREE.InstancedBufferAttribute(thrArr, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uRows: { value: N },
        uCols: { value: N },
        uOffsetEnd: { value: 0.35 },
        uTex: { value: new THREE.Texture() },
        uDither: { value: 0.3 },
      },
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      dummy.position.set((c - (N - 1) / 2), (-r + (N - 1) / 2), 0);
      dummy.scale.set(1, 1, 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.position.x = 150; // shift grid right so SKALE appears on right side of screen
    scene.add(mesh);

    /* Initial state — centered, moderate zoom so texture is visible immediately */
    camera.zoom = 15;
    camera.updateProjectionMatrix();
    anchor.rotation.reorder('ZXY');
    anchor.rotation.z = Math.PI * 0.15;
    anchor.rotation.x = Math.PI * 0.2;
    resize();

    /* Animation — ping-pong: zoom out (forward) then zoom in (reverse) */
    const DUR = 14000;
    let start: number | null = null;
    let rafId = 0;
    let timer: ReturnType<typeof setTimeout>;
    let dir = 1; // 1 = forward (zoom out), -1 = reverse (zoom in)

    const applyState = (p: number) => {
      // Zoom 15 → 0.85
      camera.zoom = 15 - (15 - 0.85) * easeIO(p);
      camera.updateProjectionMatrix();

      // Rotation unwind
      anchor.rotation.z = Math.PI * 0.15 * (1 - easeIO(p));
      anchor.rotation.x = Math.PI * 0.2 * (1 - easeIO(p));

      // Dither 0.3 → 1.0 over first 75%
      mat.uniforms.uDither.value = 0.3 + 0.7 * Math.min(p / 0.75, 1);

      renderer.render(scene, camera);
    };

    const tick = (t: number) => {
      if (start === null) start = t;
      const rawP = Math.min((t - start) / DUR, 1);

      // Forward: 0→1, Reverse: 1→0
      const p = dir === 1 ? rawP : 1 - rawP;
      applyState(p);

      if (rawP < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Pause 2s at each extreme, then flip direction
        timer = setTimeout(() => {
          dir *= -1;
          start = null;
          rafId = requestAnimationFrame(tick);
        }, 2000);
      }
    };

    /* Start only after texture loads — no blank frame */
    new THREE.TextureLoader().load('/skale-logo.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.uniforms.uTex.value = tex;
      mat.needsUpdate = true;
      applyState(0);
      rafId = requestAnimationFrame(tick);
    });

    const ro = new ResizeObserver(() => {
      resize();
      renderer.render(scene, camera);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={ref} className="absolute inset-0 pointer-events-none" />;
}
